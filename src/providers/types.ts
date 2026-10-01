/**
 * Contrato das fontes de preço consultadas ativamente (pull). A captura pela extensão e o
 * formulário manual empurram dados (push) e não passam por aqui; ambos convergem para o
 * mesmo serviço de gravação (src/capture/service.ts).
 */

export type ProviderId = "mock" | "creators_api";

export interface ProductRef {
  asin: string;
  marketplace: string;
}

export type Condition = "NEW" | "USED" | "REFURBISHED" | "UNKNOWN";

export interface OfferSnapshot {
  priceCents: number;
  currency: "BRL";
  listPriceCents?: number | null;
  /** null = desconhecido; 0 = frete grátis confirmado. */
  shippingCents?: number | null;
  couponText?: string | null;
  couponCents?: number | null;
  sellerName?: string | null;
  sellerId?: string | null;
  fulfilledByAmazon?: boolean | null;
  isBuyBoxWinner?: boolean | null;
  condition: Condition;
  availability: string;
  observedAt: Date;
}

export type ProviderResult =
  | { status: "OK"; offer: OfferSnapshot; raw: unknown }
  | { status: "UNAVAILABLE"; reason: string; observedAt: Date; raw: unknown }
  | { status: "NOT_FOUND"; observedAt: Date; raw: unknown }
  | { status: "BLOCKED"; reason: string }
  | { status: "ERROR"; error: string; retryable: boolean };

export interface PriceProvider {
  readonly id: ProviderId;
  readonly capabilities: {
    automatic: boolean;
    shipping: boolean;
    coupon: boolean;
    seller: boolean;
    listPrice: boolean;
  };
  getPrice(product: ProductRef): Promise<ProviderResult>;
}
