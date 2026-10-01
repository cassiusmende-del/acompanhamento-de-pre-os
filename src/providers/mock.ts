import type { PriceProvider, ProductRef, ProviderResult } from "./types";

/**
 * Fonte simulada e determinística, só para desenvolvimento e demonstração.
 * O mesmo ASIN no mesmo instante sempre produz o mesmo resultado. Gera um preço base,
 * pequenas oscilações semanais, promoções curtas ocasionais e raras indisponibilidades.
 */

function hash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Número pseudoaleatório em [0, 1) derivado de uma chave. */
function unit(key: string): number {
  return hash(key) / 2 ** 32;
}

const DAY_MS = 24 * 60 * 60 * 1000;

export function mockPriceAt(
  asin: string,
  at: Date,
): { priceCents: number | null; listPriceCents: number } {
  const base = 10000 + Math.floor(unit(`${asin}:base`) * 290000); // R$ 100 a R$ 3.000
  const listPrice = Math.round((base * 1.35) / 100) * 100;
  const day = Math.floor(at.getTime() / DAY_MS);
  const week = Math.floor(day / 7);

  if (unit(`${asin}:out:${day}`) < 0.02) return { priceCents: null, listPriceCents: listPrice };

  // Patamar semanal entre -8% e +8%
  let factor = 1 + (unit(`${asin}:week:${week}`) - 0.5) * 0.16;
  // Promoção de 2 a 4 dias em ~1 a cada 5 semanas, com 12% a 25% de desconto
  if (unit(`${asin}:promo:${week}`) < 0.2) {
    const startDay = week * 7 + Math.floor(unit(`${asin}:promoStart:${week}`) * 4);
    const length = 2 + Math.floor(unit(`${asin}:promoLen:${week}`) * 3);
    if (day >= startDay && day < startDay + length) {
      factor *= 1 - (0.12 + unit(`${asin}:promoDepth:${week}`) * 0.13);
    }
  }
  // Preço terminado em ,90
  const reais = Math.max(1, Math.floor((base * factor) / 100));
  return { priceCents: reais * 100 + 90, listPriceCents: listPrice };
}

export class MockPriceProvider implements PriceProvider {
  readonly id = "mock" as const;
  readonly capabilities = {
    automatic: true,
    shipping: false,
    coupon: false,
    seller: true,
    listPrice: true,
  };

  constructor(private readonly clock: () => Date = () => new Date()) {}

  async getPrice(product: ProductRef): Promise<ProviderResult> {
    const observedAt = this.clock();
    const { priceCents, listPriceCents } = mockPriceAt(product.asin, observedAt);
    const raw = { simulated: true, asin: product.asin };
    if (priceCents === null) {
      return { status: "UNAVAILABLE", reason: "Indisponível (simulado)", observedAt, raw };
    }
    return {
      status: "OK",
      offer: {
        priceCents,
        currency: "BRL",
        listPriceCents,
        shippingCents: null,
        sellerName: "Amazon.com.br (simulado)",
        condition: "NEW",
        availability: "Em estoque (simulado)",
        observedAt,
      },
      raw,
    };
  }
}
