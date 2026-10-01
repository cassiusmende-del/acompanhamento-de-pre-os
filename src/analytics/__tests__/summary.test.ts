import { describe, expect, it } from "vitest";
import { computeProductAnalytics } from "../summary";
import { d, distributionSeries, obs, weeklySeries } from "./fixtures";

describe("computeProductAnalytics — série semanal do enunciado", () => {
  const now = d("2026-09-12", 18);
  const a = computeProductAnalytics({ observations: weeklySeries(), now });

  it("métricas básicas", () => {
    expect(a.current).toMatchObject({ priceCents: 64990, stale: false });
    expect(a.previous?.priceCents).toBe(69990);
    expect(a.lowest).toMatchObject({ priceCents: 64990, count: 1 });
    expect(a.highest).toMatchObject({ priceCents: 79990, lastAt: d("2026-08-01") });
    expect(a.average.byObservation).toBeCloseTo(500930 / 7);
    expect(a.median.byObservation).toBe(69990);
    expect(a.dropCount).toBe(4);
    expect(a.increaseCount).toBe(2);
  });

  it("média ponderada pelo tempo", () => {
    const expected = ((79990 + 74990 + 69990 + 72990 + 67990 + 69990) * 7 + 64990 * 0.25) / 42.25;
    expect(a.average.byTime).toBeCloseTo(expected);
  });

  it("variações em relação às referências", () => {
    expect(a.changes.fromPrevious).toMatchObject({ deltaCents: -5000 });
    expect(a.changes.fromPrevious!.percent).toBeCloseTo(-7.1438, 3);
    expect(a.changes.fromLowest).toMatchObject({ deltaCents: 0, percent: 0 });
    expect(a.changes.fromHighest!.percent).toBeCloseTo(((64990 - 79990) / 79990) * 100);
  });

  it("percentil exige dados suficientes", () => {
    expect(a.position.percentile).toMatchObject({
      status: "insufficient",
      observations: 7,
      requiredObservations: 20,
      requiredSpanDays: 14,
    });
    expect(a.lowPrice.threshold).toEqual({ status: "insufficient", percentile: 10 });
  });

  it("janelas informam cobertura", () => {
    expect(a.windows.map((w) => [w.days, w.status])).toEqual([
      [7, "complete"],
      [30, "complete"],
      [90, "partial"],
      [180, "partial"],
      [365, "partial"],
    ]);
  });
});

describe("computeProductAnalytics — distribuição do enunciado", () => {
  const a = computeProductAnalytics({
    observations: distributionSeries(),
    now: d("2026-07-30", 18),
  });

  it("percentil, ranking e limite de preço baixo", () => {
    expect(a.position.percentile).toMatchObject({ status: "ok", byObservation: 10 });
    expect(a.position.rank).toMatchObject({ rank: 2, distinctLevels: 5 });
    expect(a.lowPrice.threshold).toEqual({
      status: "ok",
      cents: 64900,
      basis: "percentile",
      percentile: 10,
    });
    expect(a.lowPrice.episodes).toHaveLength(1);
    expect(a.lowPrice.episodes[0]).toMatchObject({
      endReason: "ongoing",
      minPriceCents: 59900,
      priceBeforeCents: 69900,
    });
  });

  it("limite definido pelo usuário prevalece sobre o percentil", () => {
    const b = computeProductAnalytics({
      observations: distributionSeries(),
      now: d("2026-07-30", 18),
      lowPriceThresholdCents: 70000,
    });
    expect(b.lowPrice.threshold).toMatchObject({ status: "ok", cents: 70000, basis: "user" });
    expect(b.lowPrice.share?.observations).toBe(30);
  });
});

describe("computeProductAnalytics — casos de borda", () => {
  it("sem observações", () => {
    const a = computeProductAnalytics({ observations: [], now: d("2026-09-01") });
    expect(a.current).toBeNull();
    expect(a.lowest).toBeNull();
    expect(a.average.byObservation).toBeNull();
    expect(a.windows.every((w) => w.status === "no_data")).toBe(true);
  });

  it("observação mais recente indisponível: sem preço atual, último preço preservado", () => {
    const a = computeProductAnalytics({
      observations: [obs("2026-09-01", 50000), obs("2026-09-02", null), obs("2026-09-03", null)],
      now: d("2026-09-04"),
    });
    expect(a.current).toBeNull();
    expect(a.unavailableSince).toEqual(d("2026-09-02"));
    expect(a.lastPriced?.priceCents).toBe(50000);
    expect(a.changes.fromAverage).toBeNull();
    expect(a.position.percentile).toEqual({ status: "no_current_price" });
    expect(a.counts).toMatchObject({ priced: 1, unavailable: 2 });
  });

  it("preço atual antigo é marcado como desatualizado", () => {
    const a = computeProductAnalytics({
      observations: [obs("2026-09-01", 50000)],
      now: d("2026-09-20"),
    });
    expect(a.current).toMatchObject({ stale: true });
    expect(a.current!.ageDays).toBeCloseTo(19);
  });

  it("observações futuras são ignoradas", () => {
    const a = computeProductAnalytics({
      observations: [obs("2026-09-01", 50000), obs("2026-10-01", 1000)],
      now: d("2026-09-05"),
    });
    expect(a.lowest?.priceCents).toBe(50000);
  });

  it("correções são aplicadas antes de qualquer cálculo", () => {
    const wrong = obs("2026-09-02", 500);
    const a = computeProductAnalytics({
      observations: [obs("2026-09-01", 50000), wrong, obs("2026-09-03", 51000)],
      corrections: [
        {
          observationId: wrong.id,
          action: "EXCLUDE",
          newPriceCents: null,
          createdAt: d("2026-09-04"),
        },
      ],
      now: d("2026-09-04"),
    });
    expect(a.lowest?.priceCents).toBe(50000);
    expect(a.counts).toMatchObject({ total: 3, priced: 2, excluded: 1 });
  });
});
