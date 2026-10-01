import { describe, expect, it } from "vitest";
import { DAY_MS } from "../config";
import { applyCorrections } from "../corrections";
import {
  distinctRank,
  percentileByObservation,
  percentileByTime,
  priceShare,
  rangePosition,
} from "../position";
import { buildSegments } from "../timeline";
import { d, distributionSeries } from "./fixtures";

describe("posição na faixa", () => {
  it("exemplo do enunciado: 579,90 / 649,90 / 899,90", () => {
    expect(rangePosition(64990, 57990, 89990)).toBeCloseTo(21.875);
    expect(rangePosition(57990, 57990, 89990)).toBe(0);
    expect(rangePosition(89990, 57990, 89990)).toBe(100);
  });

  it("indefinida quando o preço nunca variou", () => {
    expect(rangePosition(500, 500, 500)).toBeNull();
  });
});

describe("percentil e ranking (distribuição do enunciado)", () => {
  const series = distributionSeries();
  const prices = series.map((o) => o.priceCents as number);
  const now = d("2026-07-30", 18);
  const segments = buildSegments(applyCorrections(series), now, 7 * DAY_MS);

  it("percentil por observação: 6 de 60 observações ≤ 649", () => {
    expect(percentileByObservation(prices, 64900)).toBe(10);
    expect(percentileByObservation(prices, 59900)).toBeCloseTo(100 / 60);
    expect(percentileByObservation(prices, 89900)).toBe(100);
  });

  it("percentil por tempo pondera cada preço pela duração", () => {
    // ≤ 649: 599 por 1 dia + 649 por 4,25 dias, de 59,25 dias
    expect(percentileByTime(segments, 64900)).toBeCloseTo((5.25 / 59.25) * 100);
  });

  it("ranking sobre valores distintos", () => {
    expect(distinctRank(prices, 64900)).toEqual({
      rank: 2,
      distinctLevels: 5,
      observationsBelow: 1,
      totalObservations: 60,
    });
  });

  it("R$ 599 é raro, R$ 699 é recorrente", () => {
    const at599 = priceShare(segments, (p) => p === 59900);
    const at699 = priceShare(segments, (p) => p === 69900);
    expect(at599.observations).toBe(1);
    expect(at699.observations).toBe(24);
    expect(at699.byObservation).toBe(40);
  });
});
