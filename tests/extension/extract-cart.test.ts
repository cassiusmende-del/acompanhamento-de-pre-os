// @vitest-environment happy-dom
/**
 * Leitor do carrinho. As estruturas abaixo reproduzem, com ASINs e títulos inventados, os
 * casos encontrados numa página real do carrinho da Amazon Brasil (out/2026).
 */
import { beforeAll, describe, expect, it } from "vitest";
import "../../extension/extract.js";

interface CartItem {
  asin: string;
  title: string | null;
  section: "active" | "saved";
  status: "OK" | "UNAVAILABLE" | "UNREADABLE";
  priceCents: number | null;
  pixPriceCents: number | null;
  listPriceCents: number | null;
  primeExclusive: boolean;
  sellerName: string | null;
  availabilityText: string | null;
  diagnostics: Record<string, unknown>;
}
type Api = {
  extractCart: (doc: Document) => { isCart: boolean; items: CartItem[]; duplicates: number };
  isCartPage: (doc: Document) => boolean;
};
let api: Api;
beforeAll(() => {
  api = (globalThis as unknown as { HistoricoPrecosExtract: Api }).HistoricoPrecosExtract;
});

const priceSpan = (cls: string, reais: string, cents: string) =>
  `<span class="a-price ${cls}"><span class="a-offscreen">R$&nbsp;${reais},${cents}</span><span><span class="a-price-symbol">R$</span><span class="a-price-whole">${reais}<span class="a-price-decimal">,</span></span><span class="a-price-fraction">${cents}</span></span></span>`;

function item(o: {
  asin: string;
  type?: "active" | "saved";
  attr: string;
  title?: string;
  priceBlock?: string;
  extra?: string;
  outOfStock?: boolean;
}) {
  return `<div class="a-row sc-list-item" role="listitem" data-asin="${o.asin}" data-itemtype="${o.type ?? "active"}"
      data-price="${o.attr}" data-producttitle="${o.title ?? "Livro " + o.asin}" data-outofstock="${o.outOfStock ? 1 : 0}">
    <div class="sc-item-price-block">${o.priceBlock ?? ""}</div>${o.extra ?? ""}</div>`;
}

const page = (body: string) => {
  const doc = document.implementation.createHTMLDocument("Carrinho");
  doc.body.innerHTML = `<div id="sc-active-cart">${body}</div>`;
  return doc;
};

describe("extractCart", () => {
  const doc = page(
    [
      // preço comum, preço "De:" em .a-offscreen irmão e marcação Prime
      item({
        asin: "TESTE00001",
        attr: "39.12",
        priceBlock: `<div class="sc-apex-cart-price">${priceSpan("apex-price-to-pay-value", "39", "12")}
          <span class="a-offscreen">De: R$&nbsp;59,00</span>
          <span class="a-price a-text-price apex-basis-price-value"><span class="a-offscreen">null</span><span>R$59,00</span></span></div>`,
        extra: `<span>Preço exclusivo Prime</span>`,
      }),
      // destaque é o preço à vista no Pix: principal = data-price
      item({
        asin: "TESTE00002",
        attr: "179",
        priceBlock: `<div class="sc-apex-cart-price">${priceSpan("apex-promotions-unified-otp", "170", "05")}</div>
          <div class="installments-plan"> à vista no Pix ou NuPay ou em até 5x de R$&nbsp;35,80 sem juros</div>`,
      }),
      // repetido no carrinho
      item({ asin: "TESTE00002", attr: "179" }),
      // salvo: indisponível com o vendedor; "a partir de" é outra oferta
      item({
        asin: "TESTE00003",
        type: "saved",
        attr: "0",
        priceBlock: `<span class="sc-badge-price-to-pay"><span class="sc-price sc-product-price">R$ 58,15</span></span>`,
        extra: `<span>Ver outras ofertas novas a partir de R$ 58,15</span>
          <span class="a-size-small a-color-price sc-product-availability">Este item não está mais disponível com o vendedor selecionado.</span>`,
      }),
      // salvo: atributo desatualizado, vale o visível; vendedor
      item({
        asin: "TESTE00004",
        type: "saved",
        attr: "26.6",
        priceBlock: `<span class="sc-badge-price-to-pay"><span class="a-size-medium sc-price sc-product-price">R$ 26,25</span></span>`,
        extra: `<span class="sc-product-availability">Em estoque</span>
          <span class="a-size-small a-color-secondary sc-seller"> Vendido por: <a>Livraria Exemplo</a></span>
          <span>Atualizamos este item para a melhor oferta. O preço foi reduzido em R$ 0,35.</span>`,
      }),
      // salvo: "Não disponível." sem preço
      item({
        asin: "TESTE00005",
        type: "saved",
        attr: "0",
        extra: `<span class="sc-product-availability">Não disponível.</span>`,
      }),
      // sem nenhum preço legível
      item({ asin: "TESTE00006", attr: "" }),
      // ASIN inválido é ignorado
      item({ asin: "XYZ", attr: "10" }),
    ].join(""),
  );
  const r = () => api.extractCart(doc);
  const byAsin = (asin: string) => r().items.find((i) => i.asin === asin)!;

  it("reconhece a página e ignora repetidos e ASIN inválido", () => {
    expect(r().isCart).toBe(true);
    expect(r().items.map((i) => i.asin)).toEqual([
      "TESTE00001",
      "TESTE00002",
      "TESTE00003",
      "TESTE00004",
      "TESTE00005",
      "TESTE00006",
    ]);
    expect(r().duplicates).toBe(1);
  });

  it("preço comum com preço “De:” e Prime", () => {
    expect(byAsin("TESTE00001")).toMatchObject({
      status: "OK",
      priceCents: 3912,
      listPriceCents: 5900,
      pixPriceCents: null,
      primeExclusive: true,
      section: "active",
    });
  });

  it("preço no Pix fica à parte; o principal é o preço normal", () => {
    expect(byAsin("TESTE00002")).toMatchObject({
      status: "OK",
      priceCents: 17900,
      pixPriceCents: 17005,
    });
  });

  it("indisponível nunca vira preço, nem o de outras ofertas", () => {
    for (const asin of ["TESTE00003", "TESTE00005"]) {
      expect(byAsin(asin)).toMatchObject({
        status: "UNAVAILABLE",
        priceCents: null,
        section: "saved",
      });
    }
  });

  it("atributo desatualizado: vale o preço visível; lê o vendedor", () => {
    expect(byAsin("TESTE00004")).toMatchObject({
      status: "OK",
      priceCents: 2625,
      sellerName: "Livraria Exemplo",
      diagnostics: { attrPriceCents: 2660 },
    });
  });

  it("sem preço confiável, não registra", () => {
    expect(byAsin("TESTE00006")).toMatchObject({ status: "UNREADABLE", priceCents: null });
  });

  it("página de produto não é carrinho", () => {
    const doc2 = document.implementation.createHTMLDocument("p");
    doc2.body.innerHTML = `<span id="productTitle">X</span>`;
    expect(api.isCartPage(doc2)).toBe(false);
    expect(api.extractCart(doc2).items).toEqual([]);
  });
});
