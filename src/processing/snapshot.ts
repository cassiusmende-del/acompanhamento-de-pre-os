import type { ProductAnalytics } from "@/analytics";

/**
 * Retrato compacto das métricas de um produto, guardado em product_snapshots para a
 * listagem. É sempre recalculável a partir das observações.
 */
export interface SnapshotData {
  version: 1;
  averageCents: number | null;
  changeFromPreviousPercent: number | null;
  changeFromMedianPercent: number | null;
  changeFromLowestPercent: number | null;
  lowestLastAt: string | null;
  percentileStatus: "ok" | "insufficient" | "no_current_price";
  unavailableSince: string | null;
  pendingSuspect: number;
  dropCount: number;
  increaseCount: number;
}

export interface SnapshotRow {
  computedAt: Date;
  lastObservedAt: Date | null;
  currentPriceCents: number | null;
  previousPriceCents: number | null;
  lowestPriceCents: number | null;
  highestPriceCents: number | null;
  medianPriceCents: number | null;
  pricedCount: number;
  percentile: number | null;
  data: SnapshotData;
}

export function buildSnapshot(a: ProductAnalytics): SnapshotRow {
  const p = a.position.percentile;
  return {
    computedAt: a.computedAt,
    lastObservedAt: a.lastObservedAt,
    currentPriceCents: a.current?.priceCents ?? null,
    previousPriceCents: a.previous?.priceCents ?? null,
    lowestPriceCents: a.lowest?.priceCents ?? null,
    highestPriceCents: a.highest?.priceCents ?? null,
    medianPriceCents: a.median.byObservation === null ? null : Math.round(a.median.byObservation),
    pricedCount: a.counts.priced,
    percentile: p.status === "ok" ? Math.round(p.byObservation * 100) / 100 : null,
    data: {
      version: 1,
      averageCents: a.average.byObservation,
      changeFromPreviousPercent: a.changes.fromPrevious?.percent ?? null,
      changeFromMedianPercent: a.changes.fromMedian?.percent ?? null,
      changeFromLowestPercent: a.changes.fromLowest?.percent ?? null,
      lowestLastAt: a.lowest?.lastAt.toISOString() ?? null,
      percentileStatus: p.status,
      unavailableSince: a.unavailableSince?.toISOString() ?? null,
      pendingSuspect: a.counts.pendingSuspect,
      dropCount: a.dropCount,
      increaseCount: a.increaseCount,
    },
  };
}
