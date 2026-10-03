import { durationMs, type Segment } from "./timeline";

export interface PriceBucket {
  /** Limite inferior da faixa (ou o próprio valor, no agrupamento por valor exato). */
  fromCents: number;
  /** Limite superior exclusivo da faixa (igual a fromCents no agrupamento por valor exato). */
  toCents: number;
  observations: number;
  timeMs: number;
  /** Quantas vezes o preço entrou nesta faixa (sequências contínuas de observações). */
  episodes: number;
  /** null em faixas sem registros (apenas em `readableBands`). */
  lastSeenAt: Date | null;
}

/**
 * Frequência por faixa de preço. `widthCents` = null agrupa por valor exato.
 * Uma indisponibilidade ou uma lacuna sem dados interrompe a sequência.
 */
export function priceFrequency(
  segments: readonly Segment[],
  widthCents: number | null,
): PriceBucket[] {
  const buckets = new Map<number, PriceBucket>();
  let previousKey: number | null = null;
  let previousEnd: number | null = null;

  for (const s of segments) {
    if (s.priceCents === null) {
      previousKey = null;
      previousEnd = null;
      continue;
    }
    const key = widthCents ? Math.floor(s.priceCents / widthCents) * widthCents : s.priceCents;
    let bucket = buckets.get(key);
    if (!bucket) {
      bucket = {
        fromCents: key,
        toCents: widthCents ? key + widthCents : key,
        observations: 0,
        timeMs: 0,
        episodes: 0,
        lastSeenAt: s.observation.observedAt,
      };
      buckets.set(key, bucket);
    }
    const continuous = previousKey === key && previousEnd !== null && previousEnd >= s.start;
    if (!continuous) bucket.episodes += 1;
    bucket.observations += 1;
    bucket.timeMs += durationMs(s);
    bucket.lastSeenAt = s.observation.observedAt;
    previousKey = key;
    previousEnd = s.end;
  }
  return [...buckets.values()].sort((a, b) => a.fromCents - b.fromCents);
}

/** Largura de faixa padrão: 2,5% da mediana, arredondada para reais inteiros (mínimo R$ 1). */
export function defaultBucketWidth(medianCents: number): number {
  return Math.max(100, Math.round((medianCents * 0.025) / 100) * 100);
}

/**
 * Faixas de preço com no máximo `maxBands` linhas: começa na largura padrão e dobra a
 * largura até caber, para a distribuição continuar legível em produtos com muita variação.
 */
export function readableBands(
  segments: readonly Segment[],
  medianCents: number,
  maxBands = 14,
): { width: number; bands: PriceBucket[] } {
  let width = defaultBucketWidth(medianCents);
  let bands = priceFrequency(segments, width);
  for (let guard = 0; guard < 20; guard++) {
    const span = bands.length
      ? (bands[bands.length - 1].fromCents - bands[0].fromCents) / width + 1
      : 0;
    if (span <= maxBands) break;
    width *= 2;
    bands = priceFrequency(segments, width);
  }
  return { width, bands: fillEmptyBands(bands, width) };
}

/** Inclui as faixas sem registros entre a menor e a maior, para a distribuição não esconder lacunas. */
function fillEmptyBands(bands: PriceBucket[], width: number): PriceBucket[] {
  if (bands.length === 0) return bands;
  const byStart = new Map(bands.map((b) => [b.fromCents, b]));
  const out: PriceBucket[] = [];
  for (let from = bands[0].fromCents; from <= bands[bands.length - 1].fromCents; from += width) {
    out.push(
      byStart.get(from) ?? {
        fromCents: from,
        toCents: from + width,
        observations: 0,
        timeMs: 0,
        episodes: 0,
        lastSeenAt: null,
      },
    );
  }
  return out;
}
