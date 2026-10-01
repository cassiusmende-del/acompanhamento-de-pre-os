import { describe, expect, it } from "vitest";
import { DAY_MS } from "../config";
import { applyCorrections } from "../corrections";
import { defaultBucketWidth, priceFrequency } from "../frequency";
import { buildSegments } from "../timeline";
import { d, distributionSeries, obs } from "./fixtures";

describe("priceFrequency", () => {
  it("agrupa por valor exato: ocorrências, dias e episódios", () => {
    const segments = buildSegments(
      applyCorrections(distributionSeries()),
      d("2026-07-30", 18),
      7 * DAY_MS,
    );
    const levels = priceFrequency(segments, null);
    expect(levels.map((l) => [l.fromCents, l.observations, l.episodes])).toEqual([
      [59900, 1, 1],
      [64900, 5, 1],
      [69900, 24, 1],
      [79900, 18, 1],
      [89900, 12, 1],
    ]);
    expect(levels[2].timeMs).toBe(24 * DAY_MS);
  });

  it("conta episódios separados quando o preço volta à faixa", () => {
    const list = [
      obs("2026-09-01", 69900),
      obs("2026-09-02", 59900),
      obs("2026-09-03", 69900),
      obs("2026-09-04", null),
      obs("2026-09-05", 69900),
    ];
    const segments = buildSegments(applyCorrections(list), d("2026-09-06"), 7 * DAY_MS);
    const level = priceFrequency(segments, null).find((l) => l.fromCents === 69900)!;
    expect(level.observations).toBe(3);
    expect(level.episodes).toBe(3);
  });

  it("agrupa por faixas de largura fixa", () => {
    const list = [obs("2026-09-01", 64900), obs("2026-09-02", 65900), obs("2026-09-03", 67500)];
    const segments = buildSegments(applyCorrections(list), d("2026-09-04"), 7 * DAY_MS);
    const bands = priceFrequency(segments, 2500);
    expect(bands.map((b) => [b.fromCents, b.toCents, b.observations, b.episodes])).toEqual([
      [62500, 65000, 1, 1],
      [65000, 67500, 1, 1],
      [67500, 70000, 1, 1],
    ]);
  });

  it("largura padrão: 2,5% da mediana em reais inteiros", () => {
    expect(defaultBucketWidth(70990)).toBe(1800);
    expect(defaultBucketWidth(1000)).toBe(100);
  });
});
