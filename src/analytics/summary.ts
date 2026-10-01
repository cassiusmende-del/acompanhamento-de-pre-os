import { DAY_MS, DEFAULT_ANALYTICS_CONFIG, type AnalyticsConfig } from "./config";
import { applyCorrections } from "./corrections";
import { deriveEvents, type DerivedEvent } from "./events";
import { defaultBucketWidth, priceFrequency, type PriceBucket } from "./frequency";
import { lowPriceEpisodes, type LowPriceEpisode } from "./lowPrices";
import {
  distinctRank,
  percentileByObservation,
  percentileByTime,
  priceShare,
  rangePosition,
  type DistinctRank,
  type Share,
} from "./position";
import {
  mean,
  median,
  nearestRankQuantile,
  percentChange,
  weightedMean,
  weightedMedian,
} from "./stats";
import { buildSegments, durationMs } from "./timeline";
import {
  isPriced,
  type CorrectionInput,
  type EffectiveObservation,
  type ObservationInput,
  type PricedObservation,
} from "./types";
import { windowMinimum, type WindowResult } from "./windows";

export interface PricePoint {
  priceCents: number;
  observedAt: Date;
}

export interface Extreme {
  priceCents: number;
  firstAt: Date;
  lastAt: Date;
  /** Quantas observações registraram exatamente esse valor. */
  count: number;
}

export interface Change {
  referenceCents: number;
  deltaCents: number;
  percent: number;
}

export type PercentileResult =
  | { status: "ok"; byObservation: number; byTime: number | null }
  | {
      status: "insufficient";
      observations: number;
      spanDays: number;
      requiredObservations: number;
      requiredSpanDays: number;
    }
  | { status: "no_current_price" };

export interface LowPriceAnalysis {
  threshold:
    | { status: "ok"; cents: number; basis: "user" | "percentile"; percentile: number | null }
    | { status: "insufficient"; percentile: number };
  episodes: LowPriceEpisode[];
  /** Observações/tempo em ou abaixo do limite. */
  share: Share | null;
}

export interface ProductAnalytics {
  computedAt: Date;
  config: AnalyticsConfig;
  counts: {
    total: number;
    priced: number;
    unavailable: number;
    excluded: number;
    corrected: number;
    /** Observações suspeitas ainda não revisadas — entram nos cálculos até serem revisadas. */
    pendingSuspect: number;
  };
  firstObservedAt: Date | null;
  lastObservedAt: Date | null;
  /** Dias entre a primeira e a última observação com preço. */
  pricedSpanDays: number;

  /** Preço da observação mais recente, se ela tiver preço. */
  current: (PricePoint & { stale: boolean; ageDays: number }) | null;
  /** Desde quando o produto está indisponível (quando a observação mais recente não tem preço). */
  unavailableSince: Date | null;
  /** Último preço válido registrado (igual ao atual quando há preço atual). */
  lastPriced: PricePoint | null;
  /** Preço válido anterior ao último. */
  previous: PricePoint | null;

  lowest: Extreme | null;
  highest: Extreme | null;
  average: { byObservation: number | null; byTime: number | null };
  median: { byObservation: number | null; byTime: number | null };

  changes: {
    fromPrevious: Change | null;
    fromAverage: Change | null;
    fromMedian: Change | null;
    fromLowest: Change | null;
    fromHighest: Change | null;
  };

  windows: WindowResult[];

  position: {
    /** 0 = menor preço, 100 = maior. null se não há preço atual ou o preço nunca variou. */
    range: number | null;
    percentile: PercentileResult;
    rank: DistinctRank | null;
    /** Observações/tempo com preço estritamente abaixo do atual. */
    below: Share | null;
  };

  events: DerivedEvent[];
  dropCount: number;
  increaseCount: number;

  lowPrice: LowPriceAnalysis;
  frequency: { levels: PriceBucket[]; bands: PriceBucket[]; bandWidthCents: number | null };
}

export interface AnalyticsInput {
  observations: readonly ObservationInput[];
  corrections?: readonly CorrectionInput[];
  now: Date;
  config?: Partial<AnalyticsConfig>;
  /** Limite de "preço baixo" definido pelo usuário; se ausente, usa o percentil configurado. */
  lowPriceThresholdCents?: number | null;
}

function extreme(priced: readonly PricedObservation[], pick: "min" | "max"): Extreme | null {
  if (priced.length === 0) return null;
  const target = priced.reduce(
    (acc, o) => (pick === "min" ? Math.min(acc, o.priceCents) : Math.max(acc, o.priceCents)),
    priced[0].priceCents,
  );
  const matches = priced.filter((o) => o.priceCents === target);
  return {
    priceCents: target,
    firstAt: matches[0].observedAt,
    lastAt: matches[matches.length - 1].observedAt,
    count: matches.length,
  };
}

function change(current: number | null, reference: number | null): Change | null {
  if (current === null || reference === null) return null;
  const percent = percentChange(current, reference);
  if (percent === null) return null;
  return { referenceCents: reference, deltaCents: current - reference, percent };
}

export function computeProductAnalytics(input: AnalyticsInput): ProductAnalytics {
  const config: AnalyticsConfig = { ...DEFAULT_ANALYTICS_CONFIG, ...input.config };
  const now = input.now;
  const maxValidityMs = config.maxValidityDays * DAY_MS;

  const effective: EffectiveObservation[] = applyCorrections(
    input.observations.filter((o) => o.observedAt.getTime() <= now.getTime()),
    input.corrections,
  );
  const priced = effective.filter(isPriced);
  const prices = priced.map((o) => o.priceCents);
  const segments = buildSegments(effective, now, maxValidityMs);
  const pricedWeights = segments
    .filter((s) => s.priceCents !== null)
    .map((s) => ({ value: s.priceCents as number, weight: durationMs(s) }));

  const latest = effective[effective.length - 1] ?? null;
  const lastPricedObs = priced[priced.length - 1] ?? null;
  const previousObs = priced[priced.length - 2] ?? null;

  const current =
    latest && isPriced(latest)
      ? {
          priceCents: latest.priceCents,
          observedAt: latest.observedAt,
          ageDays: (now.getTime() - latest.observedAt.getTime()) / DAY_MS,
          stale: now.getTime() - latest.observedAt.getTime() > maxValidityMs,
        }
      : null;

  let unavailableSince: Date | null = null;
  if (latest && !isPriced(latest)) {
    for (let i = effective.length - 1; i >= 0 && !isPriced(effective[i]); i--) {
      unavailableSince = effective[i].observedAt;
    }
  }

  const lowest = extreme(priced, "min");
  const highest = extreme(priced, "max");
  const averageByObservation = mean(prices);
  const medianByObservation = median(prices);
  const currentCents = current?.priceCents ?? null;

  const pricedSpanDays =
    priced.length > 1
      ? (priced[priced.length - 1].observedAt.getTime() - priced[0].observedAt.getTime()) / DAY_MS
      : 0;
  const enoughForDistribution =
    priced.length >= config.percentileMinObservations &&
    pricedSpanDays >= config.percentileMinSpanDays;

  let percentile: PercentileResult;
  if (currentCents === null) percentile = { status: "no_current_price" };
  else if (!enoughForDistribution)
    percentile = {
      status: "insufficient",
      observations: priced.length,
      spanDays: pricedSpanDays,
      requiredObservations: config.percentileMinObservations,
      requiredSpanDays: config.percentileMinSpanDays,
    };
  else
    percentile = {
      status: "ok",
      byObservation: percentileByObservation(prices, currentCents) as number,
      byTime: percentileByTime(segments, currentCents),
    };

  const events = deriveEvents(effective);

  // Preço baixo: limite do usuário ou percentil do histórico (só com dados suficientes).
  let lowPrice: LowPriceAnalysis;
  const userThreshold = input.lowPriceThresholdCents ?? null;
  const thresholdCents =
    userThreshold ??
    (enoughForDistribution ? nearestRankQuantile(prices, config.lowPricePercentile) : null);
  if (thresholdCents === null) {
    lowPrice = {
      threshold: { status: "insufficient", percentile: config.lowPricePercentile },
      episodes: [],
      share: null,
    };
  } else {
    lowPrice = {
      threshold: {
        status: "ok",
        cents: thresholdCents,
        basis: userThreshold !== null ? "user" : "percentile",
        percentile: userThreshold !== null ? null : config.lowPricePercentile,
      },
      episodes: lowPriceEpisodes(effective, thresholdCents, maxValidityMs, now),
      share: priceShare(segments, (p) => p <= thresholdCents),
    };
  }

  const bandWidthCents =
    medianByObservation !== null ? defaultBucketWidth(medianByObservation) : null;

  return {
    computedAt: now,
    config,
    counts: {
      total: input.observations.length,
      priced: priced.length,
      unavailable: effective.length - priced.length,
      excluded: input.observations.length - effective.length,
      corrected: effective.filter((o) => o.corrected).length,
      pendingSuspect: effective.filter((o) => o.suspect && !o.reviewed).length,
    },
    firstObservedAt: effective[0]?.observedAt ?? null,
    lastObservedAt: latest?.observedAt ?? null,
    pricedSpanDays,
    current,
    unavailableSince,
    lastPriced: lastPricedObs
      ? { priceCents: lastPricedObs.priceCents, observedAt: lastPricedObs.observedAt }
      : null,
    previous: previousObs
      ? { priceCents: previousObs.priceCents, observedAt: previousObs.observedAt }
      : null,
    lowest,
    highest,
    average: { byObservation: averageByObservation, byTime: weightedMean(pricedWeights) },
    median: { byObservation: medianByObservation, byTime: weightedMedian(pricedWeights) },
    changes: {
      fromPrevious: change(currentCents, previousObs?.priceCents ?? null),
      fromAverage: change(currentCents, averageByObservation),
      fromMedian: change(currentCents, medianByObservation),
      fromLowest: change(currentCents, lowest?.priceCents ?? null),
      fromHighest: change(currentCents, highest?.priceCents ?? null),
    },
    windows: config.windowDays.map((d) =>
      windowMinimum(segments, now, d, config.windowMaxGapFraction),
    ),
    position: {
      range:
        currentCents !== null && lowest && highest
          ? rangePosition(currentCents, lowest.priceCents, highest.priceCents)
          : null,
      percentile,
      rank: currentCents !== null ? distinctRank(prices, currentCents) : null,
      below: currentCents !== null ? priceShare(segments, (p) => p < currentCents) : null,
    },
    events,
    dropCount: events.filter((e) => e.type === "PRICE_DROP").length,
    increaseCount: events.filter((e) => e.type === "PRICE_INCREASE").length,
    lowPrice,
    frequency: {
      levels: priceFrequency(segments, null),
      bands: bandWidthCents ? priceFrequency(segments, bandWidthCents) : [],
      bandWidthCents,
    },
  };
}
