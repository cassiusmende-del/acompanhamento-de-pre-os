export type ObservationStatus = "OK" | "UNAVAILABLE" | "NOT_FOUND";

/** Observação como gravada (subconjunto usado pela análise). */
export interface ObservationInput {
  id: string;
  observedAt: Date;
  status: ObservationStatus;
  priceCents: number | null;
  sellerId?: string | null;
  sellerName?: string | null;
  listPriceCents?: number | null;
  source?: string;
}

export type CorrectionAction = "EXCLUDE" | "REPLACE_PRICE" | "RESTORE";

export interface CorrectionInput {
  observationId: string;
  action: CorrectionAction;
  newPriceCents: number | null;
  createdAt: Date;
}

/** Observação após aplicar correções administrativas. */
export interface EffectiveObservation extends ObservationInput {
  corrected: boolean;
  originalPriceCents: number | null;
}

/** Observação com preço válido. */
export interface PricedObservation extends EffectiveObservation {
  status: "OK";
  priceCents: number;
}

export function isPriced(o: EffectiveObservation): o is PricedObservation {
  return o.status === "OK" && o.priceCents !== null;
}
