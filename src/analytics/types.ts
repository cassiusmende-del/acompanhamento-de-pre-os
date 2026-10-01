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
  /** Marcada na gravação por destoar do histórico recente. */
  suspect?: boolean;
}

/** CONFIRM = valor revisado e mantido como foi lido (efeito igual a RESTORE). */
export type CorrectionAction = "EXCLUDE" | "REPLACE_PRICE" | "RESTORE" | "CONFIRM";

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
  /** Já passou por alguma correção ou revisão (para saber se um suspeito foi revisado). */
  reviewed: boolean;
}

/** Observação com preço válido. */
export interface PricedObservation extends EffectiveObservation {
  status: "OK";
  priceCents: number;
}

export function isPriced(o: EffectiveObservation): o is PricedObservation {
  return o.status === "OK" && o.priceCents !== null;
}
