import { DAY_MS } from "./config";
import { overlapMs, type Segment } from "./timeline";

export type WindowStatus = "complete" | "partial" | "no_data";

export interface WindowResult {
  days: number;
  status: WindowStatus;
  minCents: number | null;
  /** Data da observação que registrou o mínimo (pode ser anterior ao início da janela, se ainda vigente nele). */
  minObservedAt: Date | null;
  /** Fração da janela com estado conhecido (com preço ou indisponível). */
  coverage: number;
  coveredDays: number;
}

/**
 * Menor preço vigente em algum momento dos últimos `days` dias.
 *
 * - complete: o histórico começa antes da janela e no máximo `maxGapFraction` dela está sem dados;
 * - partial: há preço na janela, mas o histórico não a cobre inteira;
 * - no_data: nenhum preço vigente na janela.
 */
export function windowMinimum(
  segments: readonly Segment[],
  now: Date,
  days: number,
  maxGapFraction: number,
): WindowResult {
  const to = now.getTime();
  const from = to - days * DAY_MS;
  const windowMs = to - from;

  let covered = 0;
  let minCents: number | null = null;
  let minObservedAt: Date | null = null;

  for (const s of segments) {
    covered += overlapMs(s, from, to);
    if (s.priceCents === null) continue;
    const inWindow = (s.start >= from && s.start <= to) || s.end > from;
    if (!inWindow) continue;
    if (minCents === null || s.priceCents < minCents) {
      minCents = s.priceCents;
      minObservedAt = s.observation.observedAt;
    } else if (s.priceCents === minCents) {
      minObservedAt = s.observation.observedAt;
    }
  }

  const historyStart = segments[0]?.start ?? Infinity;
  const coverage = windowMs > 0 ? covered / windowMs : 0;
  let status: WindowStatus;
  if (minCents === null) status = "no_data";
  else if (historyStart <= from && 1 - coverage <= maxGapFraction + 1e-12) status = "complete";
  else status = "partial";

  return { days, status, minCents, minObservedAt, coverage, coveredDays: covered / DAY_MS };
}
