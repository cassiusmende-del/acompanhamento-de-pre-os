export interface Weighted {
  value: number;
  weight: number;
}

const EPSILON = 1e-9;

export function mean(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

/** Mediana; com quantidade par, média dos dois valores centrais. */
export function median(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

export function weightedMean(items: readonly Weighted[]): number | null {
  const total = items.reduce((sum, i) => sum + i.weight, 0);
  if (total <= 0) return null;
  return items.reduce((sum, i) => sum + i.value * i.weight, 0) / total;
}

/**
 * Mediana ponderada: menor valor cujo peso acumulado ultrapassa metade do total.
 * Quando o acumulado atinge exatamente a metade, média com o valor seguinte
 * (mesma convenção da mediana simples com quantidade par).
 */
export function weightedMedian(items: readonly Weighted[]): number | null {
  const positive = items.filter((i) => i.weight > 0).sort((a, b) => a.value - b.value);
  const total = positive.reduce((sum, i) => sum + i.weight, 0);
  if (total <= 0) return null;
  const half = total / 2;
  let cumulative = 0;
  for (let i = 0; i < positive.length; i++) {
    cumulative += positive[i].weight;
    if (Math.abs(cumulative - half) <= EPSILON * total) {
      const next = positive[i + 1];
      return next ? (positive[i].value + next.value) / 2 : positive[i].value;
    }
    if (cumulative > half) return positive[i].value;
  }
  return positive[positive.length - 1].value;
}

/**
 * Quantil pelo método do posto mais próximo (nearest-rank): o menor valor observado
 * tal que pelo menos `p`% das observações são menores ou iguais a ele.
 * Sempre devolve um valor que de fato ocorreu.
 */
export function nearestRankQuantile(values: readonly number[], p: number): number | null {
  if (values.length === 0) return null;
  if (p <= 0 || p > 100) throw new RangeError("p deve estar em (0, 100]");
  const sorted = [...values].sort((a, b) => a - b);
  const rank = Math.ceil((p / 100) * sorted.length);
  return sorted[Math.max(0, rank - 1)];
}

/** Variação percentual de `value` em relação a `reference`. */
export function percentChange(value: number, reference: number): number | null {
  if (reference === 0) return null;
  return ((value - reference) / reference) * 100;
}
