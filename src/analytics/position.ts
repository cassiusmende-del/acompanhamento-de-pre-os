import { durationMs, type Segment } from "./timeline";

/**
 * Posição do preço na faixa histórica: 0% = menor preço já visto, 100% = maior.
 * null quando o preço nunca variou (faixa de largura zero).
 */
export function rangePosition(current: number, min: number, max: number): number | null {
  if (max === min) return null;
  return ((current - min) / (max - min)) * 100;
}

/**
 * Percentil por observação: porcentagem das observações com preço menor ou igual ao atual.
 * A observação atual faz parte do histórico e entra na contagem.
 */
export function percentileByObservation(prices: readonly number[], current: number): number | null {
  if (prices.length === 0) return null;
  return (prices.filter((p) => p <= current).length / prices.length) * 100;
}

/** Percentil por tempo: porcentagem do tempo monitorado (com preço) em que o preço foi ≤ atual. */
export function percentileByTime(segments: readonly Segment[], current: number): number | null {
  let total = 0;
  let atOrBelow = 0;
  for (const s of segments) {
    if (s.priceCents === null) continue;
    const d = durationMs(s);
    total += d;
    if (s.priceCents <= current) atOrBelow += d;
  }
  return total > 0 ? (atOrBelow / total) * 100 : null;
}

export interface Share {
  observations: number;
  totalObservations: number;
  /** % das observações. */
  byObservation: number | null;
  /** % do tempo monitorado com preço. */
  byTime: number | null;
}

/** Fração das observações e do tempo em que o preço satisfez `predicate`. */
export function priceShare(
  segments: readonly Segment[],
  predicate: (priceCents: number) => boolean,
): Share {
  let n = 0;
  let matching = 0;
  let total = 0;
  let matchingTime = 0;
  for (const s of segments) {
    if (s.priceCents === null) continue;
    const d = durationMs(s);
    n += 1;
    total += d;
    if (predicate(s.priceCents)) {
      matching += 1;
      matchingTime += d;
    }
  }
  return {
    observations: matching,
    totalObservations: n,
    byObservation: n > 0 ? (matching / n) * 100 : null,
    byTime: total > 0 ? (matchingTime / total) * 100 : null,
  };
}

export interface DistinctRank {
  /** 1 = menor valor distinto já observado. */
  rank: number;
  distinctLevels: number;
  /** Observações com preço estritamente menor que o atual. */
  observationsBelow: number;
  totalObservations: number;
}

/**
 * Posição ordinal do preço atual entre os valores DISTINTOS observados (dense rank),
 * para que repetições do mesmo valor não distorçam o ranking.
 */
export function distinctRank(prices: readonly number[], current: number): DistinctRank | null {
  if (prices.length === 0) return null;
  const levels = [...new Set(prices)].sort((a, b) => a - b);
  const below = levels.filter((l) => l < current).length;
  return {
    rank: below + 1,
    distinctLevels: levels.length,
    observationsBelow: prices.filter((p) => p < current).length,
    totalObservations: prices.length,
  };
}
