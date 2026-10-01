import type { EffectiveObservation } from "./types";

/**
 * Intervalo em que uma observação é considerada vigente: do momento da leitura até a
 * próxima observação, limitado a `maxValidityMs`. O tempo além do limite é "sem dados".
 */
export interface Segment {
  observation: EffectiveObservation;
  start: number;
  end: number;
  /** Preço vigente no segmento (null = indisponível). */
  priceCents: number | null;
}

export function buildSegments(
  observations: readonly EffectiveObservation[],
  now: Date,
  maxValidityMs: number,
): Segment[] {
  const nowMs = now.getTime();
  const segments: Segment[] = [];
  for (let i = 0; i < observations.length; i++) {
    const o = observations[i];
    const start = o.observedAt.getTime();
    if (start > nowMs) break;
    const next = observations[i + 1];
    const nextStart = next ? Math.min(next.observedAt.getTime(), nowMs) : nowMs;
    const end = Math.max(start, Math.min(nextStart, start + maxValidityMs));
    segments.push({
      observation: o,
      start,
      end,
      priceCents: o.status === "OK" ? o.priceCents : null,
    });
  }
  return segments;
}

export function durationMs(s: Segment): number {
  return s.end - s.start;
}

/** Sobreposição do segmento com o intervalo [from, to]. */
export function overlapMs(s: Segment, from: number, to: number): number {
  return Math.max(0, Math.min(s.end, to) - Math.max(s.start, from));
}
