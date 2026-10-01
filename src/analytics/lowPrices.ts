import type { EffectiveObservation } from "./types";

export type EpisodeEnd = "price_above" | "unavailable" | "gap" | "ongoing";

/**
 * Período contínuo em que o preço observado ficou em ou abaixo de um limite.
 *
 * Como o momento exato de início e fim entre duas observações é desconhecido, a duração
 * é dada por limites:
 * - mínima: da primeira à última observação dentro do período;
 * - máxima: da última observação antes do período à primeira observação depois dele
 *   (null quando um desses extremos não é conhecido).
 */
export interface LowPriceEpisode {
  startAt: Date;
  lastLowAt: Date;
  endAt: Date | null;
  endReason: EpisodeEnd;
  minPriceCents: number;
  minPriceAt: Date;
  observationCount: number;
  priceBeforeCents: number | null;
  priceAfterCents: number | null;
  durationMinMs: number;
  durationMaxMs: number | null;
}

interface Open {
  first: EffectiveObservation;
  last: EffectiveObservation;
  before: EffectiveObservation | null;
  min: EffectiveObservation;
  count: number;
}

export function lowPriceEpisodes(
  observations: readonly EffectiveObservation[],
  thresholdCents: number,
  maxValidityMs: number,
  now: Date,
): LowPriceEpisode[] {
  const episodes: LowPriceEpisode[] = [];
  let open: Open | null = null;
  let previous: EffectiveObservation | null = null;

  const close = (o: Open, endObs: EffectiveObservation | null, reason: EpisodeEnd) => {
    const startMs = o.first.observedAt.getTime();
    const lastMs = o.last.observedAt.getTime();
    const knownBefore = o.before !== null && !isLow(o.before, thresholdCents);
    episodes.push({
      startAt: o.first.observedAt,
      lastLowAt: o.last.observedAt,
      endAt: endObs?.observedAt ?? null,
      endReason: reason,
      minPriceCents: o.min.priceCents as number,
      minPriceAt: o.min.observedAt,
      observationCount: o.count,
      priceBeforeCents: knownBefore && o.before?.status === "OK" ? o.before.priceCents : null,
      priceAfterCents: endObs?.status === "OK" ? endObs.priceCents : null,
      durationMinMs: lastMs - startMs,
      durationMaxMs:
        knownBefore && endObs && o.before
          ? endObs.observedAt.getTime() - o.before.observedAt.getTime()
          : null,
    });
  };

  for (const o of observations) {
    if (isLow(o, thresholdCents)) {
      if (open && o.observedAt.getTime() - open.last.observedAt.getTime() > maxValidityMs) {
        // Lacuna sem dados dentro do período: não sabemos o que aconteceu, então encerramos.
        close(open, null, "gap");
        open = null;
      }
      if (!open) {
        open = { first: o, last: o, before: previous, min: o, count: 1 };
      } else {
        open.last = o;
        open.count += 1;
        if ((o.priceCents as number) < (open.min.priceCents as number)) open.min = o;
      }
    } else if (open) {
      const gap = o.observedAt.getTime() - open.last.observedAt.getTime() > maxValidityMs;
      if (gap) close(open, null, "gap");
      else close(open, o, o.status === "OK" ? "price_above" : "unavailable");
      open = null;
    }
    previous = o;
  }

  if (open) {
    const stale = now.getTime() - open.last.observedAt.getTime() > maxValidityMs;
    close(open, null, stale ? "gap" : "ongoing");
  }
  return episodes;
}

function isLow(o: EffectiveObservation, threshold: number): boolean {
  return o.status === "OK" && o.priceCents !== null && o.priceCents <= threshold;
}
