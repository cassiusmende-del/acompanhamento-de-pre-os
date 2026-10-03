import type { Segment } from "./timeline";

/**
 * Série para o gráfico em degraus (cada preço vale até o ponto seguinte).
 *
 * - Um ponto no início de cada observação com preço e outro no fim do período em que ela
 *   é considerada vigente, para o degrau terminar onde a informação termina.
 * - Onde não há dados (além do teto de validade) a linha é interrompida com um ponto null.
 * - Períodos indisponíveis também interrompem a linha e viram faixas no gráfico.
 */
export interface ChartPoint {
  t: number;
  price: number | null;
}

export interface ChartBand {
  from: number;
  to: number;
}

export interface ChartSeries {
  points: ChartPoint[];
  unavailable: ChartBand[];
}

export function buildChartSeries(segments: readonly Segment[], now: Date): ChartSeries {
  const points: ChartPoint[] = [];
  const unavailable: ChartBand[] = [];

  for (let i = 0; i < segments.length; i++) {
    const s = segments[i];
    const next = segments[i + 1];
    if (s.priceCents === null) {
      points.push({ t: s.start, price: null });
      unavailable.push({ from: s.start, to: Math.max(s.end, s.start) });
      continue;
    }
    points.push({ t: s.start, price: s.priceCents });
    if (s.end > s.start) points.push({ t: s.end, price: s.priceCents });
    // Lacuna antes da próxima observação, ou dados vencidos antes de agora.
    const gapAfter = next ? next.start > s.end : s.end < now.getTime();
    if (gapAfter) points.push({ t: s.end + 1, price: null });
  }

  // Faixas indisponíveis consecutivas viram uma só.
  const merged: ChartBand[] = [];
  for (const band of unavailable) {
    const last = merged[merged.length - 1];
    if (last && band.from <= last.to) last.to = Math.max(last.to, band.to);
    else merged.push({ ...band });
  }
  return { points, unavailable: merged };
}

/**
 * Recorta a série para começar em `from`. O preço vigente no início do período (se houver)
 * é repetido em `from`, para o degrau começar na borda esquerda.
 */
export function clipChartSeries(series: ChartSeries, from: number): ChartSeries {
  const points: ChartPoint[] = [];
  let carried: ChartPoint | null = null;
  for (const p of series.points) {
    if (p.t < from) carried = p;
    else points.push(p);
  }
  if (carried && carried.price !== null && (points.length === 0 || points[0].t > from)) {
    points.unshift({ t: from, price: carried.price });
  }
  const unavailable = series.unavailable
    .filter((b) => b.to > from)
    .map((b) => ({ from: Math.max(b.from, from), to: b.to }));
  return { points, unavailable };
}

/** Menor e maior preço visíveis na série (para o eixo vertical). */
export function priceExtent(points: readonly ChartPoint[]): [number, number] | null {
  let min = Infinity;
  let max = -Infinity;
  for (const p of points) {
    if (p.price === null) continue;
    if (p.price < min) min = p.price;
    if (p.price > max) max = p.price;
  }
  return min === Infinity ? null : [min, max];
}

/**
 * Marcas "redondas" para o eixo de preço (em centavos): passos de 1, 2, 2,5 ou 5 × 10ⁿ reais,
 * com o domínio estendido até a primeira e a última marca.
 */
export function niceTicks(minCents: number, maxCents: number, target = 5): number[] {
  const lo = Math.min(minCents, maxCents);
  const hi = Math.max(minCents, maxCents);
  const span = Math.max(hi - lo, 100);
  const rough = span / Math.max(1, target - 1);
  const magnitude = 10 ** Math.floor(Math.log10(rough));
  const step =
    [1, 2, 2.5, 5, 10].map((m) => m * magnitude).find((s) => s >= rough) ?? 10 * magnitude;
  const stepCents = Math.max(100, Math.round(step / 100) * 100);
  const first = Math.floor(lo / stepCents) * stepCents;
  const ticks: number[] = [];
  for (let t = first; t < hi + stepCents; t += stepCents) {
    ticks.push(t);
    if (t >= hi) break;
  }
  return ticks;
}
