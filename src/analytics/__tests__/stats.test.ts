import { describe, expect, it } from "vitest";
import {
  mean,
  median,
  nearestRankQuantile,
  percentChange,
  weightedMean,
  weightedMedian,
} from "../stats";

describe("estatísticas básicas", () => {
  it("média e mediana", () => {
    expect(mean([])).toBeNull();
    expect(median([])).toBeNull();
    expect(mean([1, 2, 3, 4])).toBe(2.5);
    expect(median([5, 1, 3])).toBe(3);
    expect(median([4, 1, 3, 2])).toBe(2.5);
  });

  it("média e mediana ponderadas", () => {
    expect(
      weightedMean([
        { value: 10, weight: 3 },
        { value: 20, weight: 1 },
      ]),
    ).toBe(12.5);
    expect(weightedMean([{ value: 10, weight: 0 }])).toBeNull();
    // 10 vale 3/4 do tempo → mediana 10
    expect(
      weightedMedian([
        { value: 20, weight: 1 },
        { value: 10, weight: 3 },
      ]),
    ).toBe(10);
    // metade exata → média entre os dois valores (convenção da mediana par)
    expect(
      weightedMedian([
        { value: 10, weight: 2 },
        { value: 20, weight: 2 },
      ]),
    ).toBe(15);
    expect(weightedMedian([])).toBeNull();
  });

  it("quantil pelo posto mais próximo devolve um valor observado", () => {
    const values = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    expect(nearestRankQuantile(values, 10)).toBe(1);
    expect(nearestRankQuantile(values, 11)).toBe(2);
    expect(nearestRankQuantile(values, 50)).toBe(5);
    expect(nearestRankQuantile(values, 100)).toBe(10);
    expect(() => nearestRankQuantile(values, 0)).toThrow();
  });

  it("variação percentual", () => {
    expect(percentChange(110, 100)).toBeCloseTo(10);
    expect(percentChange(90, 100)).toBeCloseTo(-10);
    expect(percentChange(10, 0)).toBeNull();
  });
});
