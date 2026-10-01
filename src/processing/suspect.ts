import { DAY_MS } from "@/analytics/config";
import { median } from "@/analytics/stats";
import { isPriced, type EffectiveObservation } from "@/analytics/types";
import { formatBRL, formatPercent } from "@/domain/money";

export const SUSPECT_WINDOW_DAYS = 30;
export const SUSPECT_MIN_OBSERVATIONS = 3;
/** Diferença relativa à mediana recente a partir da qual o valor é marcado para revisão. */
export const SUSPECT_THRESHOLD = 0.6;

export type SuspectAssessment = { suspect: false } | { suspect: true; reason: string };

/**
 * Marca para revisão um preço que destoa muito do histórico recente (ex.: valor da
 * parcela lido no lugar do preço). Não descarta nada: a observação é gravada e entra nos
 * cálculos até o usuário revisá-la.
 *
 * Referência: mediana dos preços efetivos dos últimos 30 dias, exigindo ao menos 3.
 */
export function assessSuspect(
  priceCents: number | null,
  history: readonly EffectiveObservation[],
  at: Date,
): SuspectAssessment {
  if (priceCents === null) return { suspect: false };
  const from = at.getTime() - SUSPECT_WINDOW_DAYS * DAY_MS;
  const recent = history
    .filter(isPriced)
    .filter((o) => o.observedAt.getTime() >= from && o.observedAt.getTime() <= at.getTime())
    .map((o) => o.priceCents);
  if (recent.length < SUSPECT_MIN_OBSERVATIONS) return { suspect: false };

  const reference = median(recent) as number;
  const diff = (priceCents - reference) / reference;
  if (Math.abs(diff) <= SUSPECT_THRESHOLD) return { suspect: false };
  return {
    suspect: true,
    reason: `${formatPercent(Math.abs(diff) * 100, 0)} ${diff < 0 ? "abaixo" : "acima"} da mediana dos últimos ${SUSPECT_WINDOW_DAYS} dias (${formatBRL(reference)}, ${recent.length} observações).`,
  };
}
