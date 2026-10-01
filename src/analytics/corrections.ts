import type { CorrectionInput, EffectiveObservation, ObservationInput } from "./types";

/**
 * Aplica correções administrativas: para cada observação vale a correção mais recente.
 * EXCLUDE remove da análise; REPLACE_PRICE substitui o preço; RESTORE volta ao original.
 * Devolve as observações efetivas em ordem cronológica.
 */
export function applyCorrections(
  observations: readonly ObservationInput[],
  corrections: readonly CorrectionInput[] = [],
): EffectiveObservation[] {
  const latest = new Map<string, CorrectionInput>();
  for (const c of corrections) {
    const current = latest.get(c.observationId);
    if (!current || c.createdAt.getTime() >= current.createdAt.getTime()) {
      latest.set(c.observationId, c);
    }
  }

  const result: EffectiveObservation[] = [];
  for (const o of observations) {
    const correction = latest.get(o.id);
    if (correction?.action === "EXCLUDE") continue;
    if (correction?.action === "REPLACE_PRICE" && correction.newPriceCents !== null) {
      result.push({
        ...o,
        status: "OK",
        priceCents: correction.newPriceCents,
        corrected: true,
        originalPriceCents: o.priceCents,
      });
      continue;
    }
    result.push({ ...o, corrected: false, originalPriceCents: o.priceCents });
  }
  return sortChronologically(result);
}

export function sortChronologically<T extends { observedAt: Date; id: string }>(items: T[]): T[] {
  return [...items].sort(
    (a, b) => a.observedAt.getTime() - b.observedAt.getTime() || a.id.localeCompare(b.id),
  );
}
