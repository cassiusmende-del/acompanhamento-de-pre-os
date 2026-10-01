import { percentChange } from "./stats";
import type { EffectiveObservation } from "./types";

export type PriceEventType =
  "FIRST_PRICE" | "PRICE_DROP" | "PRICE_INCREASE" | "PRICE_UNCHANGED" | "PRICE_UNAVAILABLE";

export interface DerivedEvent {
  observationId: string;
  previousObservationId: string | null;
  type: PriceEventType;
  occurredAt: Date;
  previousPriceCents: number | null;
  newPriceCents: number | null;
  deltaCents: number | null;
  deltaPercent: number | null;
  sellerChanged: boolean;
  /** Primeiro preço depois de um período indisponível. */
  backInStock: boolean;
}

function sellerKey(o: EffectiveObservation): string | null {
  return o.sellerId?.trim() || o.sellerName?.trim().toLowerCase() || null;
}

/**
 * Deriva os eventos de mudança a partir das observações efetivas (ordem cronológica).
 *
 * - Preço é comparado com o último preço válido, mesmo que haja indisponibilidade no meio.
 * - Indisponibilidade gera PRICE_UNAVAILABLE só na transição (não se repete).
 * - Ausência de preço nunca é tratada como zero.
 */
export function deriveEvents(observations: readonly EffectiveObservation[]): DerivedEvent[] {
  const events: DerivedEvent[] = [];
  let lastAny: EffectiveObservation | null = null;
  let lastPriced: EffectiveObservation | null = null;

  for (const o of observations) {
    if (o.status !== "OK" || o.priceCents === null) {
      if (!lastAny || lastAny.status === "OK") {
        events.push({
          observationId: o.id,
          previousObservationId: lastPriced?.id ?? null,
          type: "PRICE_UNAVAILABLE",
          occurredAt: o.observedAt,
          previousPriceCents: lastPriced?.priceCents ?? null,
          newPriceCents: null,
          deltaCents: null,
          deltaPercent: null,
          sellerChanged: false,
          backInStock: false,
        });
      }
      lastAny = o;
      continue;
    }

    const backInStock = lastAny !== null && lastAny.status !== "OK";
    if (!lastPriced || lastPriced.priceCents === null) {
      events.push({
        observationId: o.id,
        previousObservationId: null,
        type: "FIRST_PRICE",
        occurredAt: o.observedAt,
        previousPriceCents: null,
        newPriceCents: o.priceCents,
        deltaCents: null,
        deltaPercent: null,
        sellerChanged: false,
        backInStock,
      });
    } else {
      const delta = o.priceCents - lastPriced.priceCents;
      const previousSeller = sellerKey(lastPriced);
      const currentSeller = sellerKey(o);
      events.push({
        observationId: o.id,
        previousObservationId: lastPriced.id,
        type: delta < 0 ? "PRICE_DROP" : delta > 0 ? "PRICE_INCREASE" : "PRICE_UNCHANGED",
        occurredAt: o.observedAt,
        previousPriceCents: lastPriced.priceCents,
        newPriceCents: o.priceCents,
        deltaCents: delta,
        deltaPercent: percentChange(o.priceCents, lastPriced.priceCents),
        sellerChanged:
          previousSeller !== null && currentSeller !== null && previousSeller !== currentSeller,
        backInStock,
      });
    }
    lastAny = o;
    lastPriced = o;
  }
  return events;
}

/** Evento gerado pela observação mais recente, considerando o histórico anterior. */
export function detectEventForLatest(
  observations: readonly EffectiveObservation[],
): DerivedEvent | null {
  const latest = observations[observations.length - 1];
  if (!latest) return null;
  const last = deriveEvents(observations).at(-1);
  return last && last.observationId === latest.id ? last : null;
}
