// @vitest-environment happy-dom
/**
 * Testes do leitor de página da extensão. As páginas abaixo são reduções SINTÉTICAS da
 * estrutura conhecida das páginas da Amazon Brasil (não são cópias de páginas reais).
 * A validação final precisa ser feita em páginas reais, com o diagnóstico do popup.
 */
import { beforeAll, describe, expect, it } from "vitest";
import "../../extension/extract.js";

interface Extracted {
  asin: string | null;
  title: string | null;
  isProductPage: boolean;
  available: boolean | null;
  priceCents: number | null;
  listPriceCents: number | null;
  availabilityText: string | null;
  sellerName: string | null;
  shipsFrom: string | null;
  fulfilledByAmazon: boolean | null;
  shippingCents: number | null;
  couponText: string | null;
  couponCents: number | null;
  condition: string;
  diagnostics: Record<string, unknown>;
}

type ExtractApi = {
  extract: (doc: Document, href: string) => Extracted;
  parsePrice: (t: string) => number | null;
};
let api: ExtractApi;

beforeAll(() => {
  api = (globalThis as unknown as { HistoricoPrecosExtract: ExtractApi }).HistoricoPrecosExtract;
});

function page(body: string): Document {
  const doc = document.implementation.createHTMLDocument("t");
  doc.body.innerHTML = body;
  return doc;
}

const URL = "https://www.amazon.com.br/SSD-Samsung/dp/B0BHJJ9Y77/ref=sr_1_1";

describe("parsePrice", () => {
  it.each([
    ["R$ 649,90", 64990],
    ["R$649,90", 64990],
    ["R$ 1.234,56", 123456],
    ["R$ 1.299", 129900],
    ["649,90", 64990],
    ["em até 10x de R$ 64,99 sem juros", 6499],
  ])("%s", (text, cents) => expect(api.parsePrice(text)).toBe(cents));

  it.each(["", "Grátis", "10%", "R$ 0,00"])("rejeita %j", (text) =>
    expect(api.parsePrice(text)).toBeNull(),
  );
});

describe("extract", () => {
  it("página atual: preço a pagar, preço “de”, frete grátis, vendedor e cupom", () => {
    const doc = page(`
      <input type="hidden" id="ASIN" value="B0BHJJ9Y77">
      <span id="productTitle">  SSD Samsung 990 PRO 2TB  </span>
      <div id="corePriceDisplay_desktop_feature_div">
        <span class="a-price priceToPay"><span class="a-offscreen">R$ 649,90</span>
          <span aria-hidden="true"><span class="a-price-whole">649<span class="a-price-decimal">,</span></span><span class="a-price-fraction">90</span></span></span>
        <span class="basisPrice">De: <span class="a-price a-text-price" data-a-strike="true"><span class="a-offscreen">R$ 899,90</span></span></span>
        <span id="installmentCalculator">em até 10x de R$ 64,99 sem juros</span>
      </div>
      <div id="promoPriceBlockMessage_feature_div"><label>Aplicar cupom de R$ 50,00</label></div>
      <div id="mir-layout-DELIVERY_BLOCK"><span data-csa-c-delivery-price="GRÁTIS">Entrega GRÁTIS: sábado, 4 de outubro</span></div>
      <div id="availability"><span>Em estoque</span></div>
      <div id="fulfillerInfoFeature_feature_div"><span class="offer-display-feature-text-message">Amazon.com.br</span></div>
      <div id="merchantInfoFeature_feature_div"><span class="offer-display-feature-text-message">Amazon.com.br</span></div>
      <div id="similarities"><span class="a-price"><span class="a-offscreen">R$ 99,90</span></span></div>
    `);
    expect(api.extract(doc, URL)).toMatchObject({
      asin: "B0BHJJ9Y77",
      title: "SSD Samsung 990 PRO 2TB",
      isProductPage: true,
      available: true,
      priceCents: 64990,
      listPriceCents: 89990,
      sellerName: "Amazon.com.br",
      shipsFrom: "Amazon.com.br",
      fulfilledByAmazon: true,
      shippingCents: 0,
      couponText: "Aplicar cupom de R$ 50,00",
      couponCents: 5000,
      condition: "UNKNOWN",
      diagnostics: {
        priceSource: "#corePriceDisplay_desktop_feature_div .priceToPay",
        asinSource: "input#ASIN",
      },
    });
  });

  it("usa partes inteira e decimal quando o texto oculto está vazio; frete pago no bloco de entrega", () => {
    const doc = page(`
      <span id="productTitle">Fone</span>
      <div id="corePrice_feature_div"><span class="a-price"><span class="a-offscreen"></span>
        <span class="a-price-whole">1.299<span class="a-price-decimal">,</span></span><span class="a-price-fraction">00</span></span></div>
      <div id="deliveryBlockMessage">R$ 19,90 de frete. Entrega quinta-feira</div>
      <div id="tabular-buybox">
        <div class="tabular-buybox-container"><span class="tabular-buybox-label">Enviado por</span><span class="tabular-buybox-text">Loja Exemplo</span></div>
        <div class="tabular-buybox-container"><span class="tabular-buybox-label">Vendido por</span><span class="tabular-buybox-text">Loja Exemplo</span></div>
      </div>
    `);
    expect(api.extract(doc, URL)).toMatchObject({
      asin: "B0BHJJ9Y77",
      priceCents: 129900,
      listPriceCents: null,
      shippingCents: 1990,
      sellerName: "Loja Exemplo",
      shipsFrom: "Loja Exemplo",
      fulfilledByAmazon: false,
      couponText: null,
    });
  });

  it("layout antigo com priceblock e texto “Vendido por … e entregue por Amazon”", () => {
    const doc = page(`
      <span id="productTitle">Livro</span>
      <span id="priceblock_ourprice">R$ 59,90</span>
      <div id="merchant-info">Vendido por Livraria X e entregue por Amazon.</div>
    `);
    expect(api.extract(doc, "https://www.amazon.com.br/gp/product/8535914846")).toMatchObject({
      asin: "8535914846",
      priceCents: 5990,
      sellerName: "Livraria X",
      shipsFrom: "Amazon",
      fulfilledByAmazon: true,
      shippingCents: null,
    });
  });

  it("produto indisponível: sem preço, mesmo que haja preços de outras ofertas", () => {
    const doc = page(`
      <span id="productTitle">Console</span>
      <div id="availability"><span>Não disponível.</span></div>
      <div id="outOfStock">Não sabemos quando ou se este item estará disponível novamente.</div>
      <div id="corePrice_feature_div"><span class="a-price"><span class="a-offscreen">R$ 3.999,00</span></span></div>
    `);
    expect(api.extract(doc, URL)).toMatchObject({
      available: false,
      priceCents: null,
      listPriceCents: null,
    });
  });

  it("preço “de” menor ou igual ao preço é descartado", () => {
    const doc = page(`
      <span id="productTitle">X</span>
      <div id="corePriceDisplay_desktop_feature_div">
        <span class="a-price priceToPay"><span class="a-offscreen">R$ 100,00</span></span>
        <span class="basisPrice"><span class="a-price a-text-price"><span class="a-offscreen">R$ 90,00</span></span></span>
      </div>`);
    expect(api.extract(doc, URL).listPriceCents).toBeNull();
  });

  it("não inventa preço: parcela isolada não é lida como preço e campo hidden é último recurso", () => {
    const noPrice = page(
      `<span id="productTitle">X</span><span id="installmentCalculator">10x de R$ 64,99</span>`,
    );
    expect(api.extract(noPrice, URL)).toMatchObject({
      priceCents: null,
      available: null,
      isProductPage: true,
    });

    const hidden = page(
      `<span id="productTitle">X</span><input id="twister-plus-price-data-price" value="649.9">`,
    );
    expect(api.extract(hidden, URL)).toMatchObject({
      priceCents: 64990,
      diagnostics: { priceSource: "twister-plus-price-data-price" },
    });
  });

  it("páginas que não são de produto", () => {
    const search = page(
      `<div class="s-result-item"><span class="a-price"><span class="a-offscreen">R$ 10,00</span></span></div>`,
    );
    expect(api.extract(search, "https://www.amazon.com.br/s?k=ssd")).toMatchObject({
      asin: null,
      isProductPage: false,
    });
  });

  it("oferta somente de usado", () => {
    const doc = page(`<span id="productTitle">X</span><div id="usedOnlyBuybox"></div>
      <div id="corePrice_feature_div"><span class="a-price"><span class="a-offscreen">R$ 300,00</span></span></div>`);
    expect(api.extract(doc, URL)).toMatchObject({ condition: "USED", priceCents: 30000 });
  });
});
