export interface QueueInput {
  productId: string;
  title: string;
  asin: string;
  url: string;
  createdAt: Date;
  lastObservedAt: Date | null;
  targetIntervalHours: number;
}

export type QueueStatus = "never" | "due" | "ok";

export interface QueueItem extends QueueInput {
  status: QueueStatus;
  /** Quando a próxima captura passa a ser desejada (null = nunca capturado). */
  dueAt: Date | null;
  /** Horas desde o último registro (null = nunca capturado). */
  hoursSinceLast: number | null;
}

const HOUR_MS = 60 * 60 * 1000;

/**
 * Ordena a fila de captura: nunca capturados primeiro, depois os pendentes há mais tempo,
 * depois os em dia (os que vencem antes primeiro). O intervalo desejado serve só para ordenar.
 */
export function buildCaptureQueue(products: readonly QueueInput[], now: Date): QueueItem[] {
  const rank: Record<QueueStatus, number> = { never: 0, due: 1, ok: 2 };
  return products
    .map((p): QueueItem => {
      if (!p.lastObservedAt) return { ...p, status: "never", dueAt: null, hoursSinceLast: null };
      const dueAt = new Date(p.lastObservedAt.getTime() + p.targetIntervalHours * HOUR_MS);
      return {
        ...p,
        status: dueAt.getTime() <= now.getTime() ? "due" : "ok",
        dueAt,
        hoursSinceLast: (now.getTime() - p.lastObservedAt.getTime()) / HOUR_MS,
      };
    })
    .sort((a, b) => {
      if (a.status !== b.status) return rank[a.status] - rank[b.status];
      if (a.status === "never") return a.createdAt.getTime() - b.createdAt.getTime();
      return (a.dueAt as Date).getTime() - (b.dueAt as Date).getTime();
    });
}
