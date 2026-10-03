import { describe, expect, it } from "vitest";
import { buildChartSeries, clipChartSeries, priceExtent } from "../chart";
import { DAY_MS } from "../config";
import { applyCorrections } from "../corrections";
import { readableBands } from "../frequency";
import { buildSegments } from "../timeline";
import { d, distributionSeries, obs } from "./fixtures";

const segs = (list: ReturnType<typeof obs>[], now: Date) =>
  buildSegments(applyCorrections(list), now, 7 * DAY_MS);

describe("buildChartSeries", () => {
  it("degraus contínuos sem lacunas", () => {
    const s = buildChartSeries(
      segs([obs("2026-09-01", 100), obs("2026-09-03", 90)], d("2026-09-04")),
      d("2026-09-04"),
    );
    expect(s.points).toEqual([
      { t: d("2026-09-01").getTime(), price: 100 },
      { t: d("2026-09-03").getTime(), price: 100 },
      { t: d("2026-09-03").getTime(), price: 90 },
      { t: d("2026-09-04").getTime(), price: 90 },
    ]);
    expect(s.unavailable).toEqual([]);
  });

  it("interrompe a linha onde não há dados e em indisponibilidade", () => {
    const s = buildChartSeries(
      segs(
        [
          obs("2026-09-01", 100),
          obs("2026-09-20", 95),
          obs("2026-09-21", null),
          obs("2026-09-22", null),
          obs("2026-09-23", 80),
        ],
        d("2026-09-24"),
      ),
      d("2026-09-24"),
    );
    const gapEnd = d("2026-09-08").getTime();
    expect(s.points.slice(0, 3)).toEqual([
      { t: d("2026-09-01").getTime(), price: 100 },
      { t: gapEnd, price: 100 },
      { t: gapEnd + 1, price: null },
    ]);
    expect(s.points.filter((p) => p.price === null)).toHaveLength(3);
    expect(s.unavailable).toEqual([
      { from: d("2026-09-21").getTime(), to: d("2026-09-23").getTime() },
    ]);
  });
});

describe("clipChartSeries", () => {
  it("leva o preço vigente para a borda esquerda do período", () => {
    const s = buildChartSeries(
      segs([obs("2026-09-01", 100), obs("2026-09-05", 90)], d("2026-09-08")),
      d("2026-09-08"),
    );
    const from = d("2026-09-04").getTime();
    const c = clipChartSeries(s, from);
    expect(c.points[0]).toEqual({ t: from, price: 100 });
    expect(priceExtent(c.points)).toEqual([90, 100]);
  });

  it("período sem dados fica vazio", () => {
    const s = buildChartSeries(segs([obs("2026-01-01", 100)], d("2026-09-08")), d("2026-09-08"));
    const c = clipChartSeries(s, d("2026-09-01").getTime());
    expect(priceExtent(c.points)).toBeNull();
  });
});

describe("readableBands", () => {
  it("alarga as faixas até caber no limite de linhas", () => {
    const segments = segs(distributionSeries(), d("2026-07-30", 18));
    const { width, bands } = readableBands(segments, 69900, 6);
    expect(width).toBeGreaterThan(1700);
    const span = (bands[bands.length - 1].fromCents - bands[0].fromCents) / width + 1;
    expect(span).toBeLessThanOrEqual(6);
    expect(bands.reduce((n, b) => n + b.observations, 0)).toBe(60);
    // faixas consecutivas, inclusive as vazias
    bands.slice(1).forEach((b, i) => expect(b.fromCents - bands[i].fromCents).toBe(width));
  });
});

describe("niceTicks", () => {
  it("passos redondos cobrindo o intervalo", async () => {
    const { niceTicks } = await import("../chart");
    expect(niceTicks(138500, 199000)).toEqual([120000, 140000, 160000, 180000, 200000]);
    expect(niceTicks(57990, 89990)).toEqual([50000, 60000, 70000, 80000, 90000]);
    const small = niceTicks(9990, 10490);
    expect(small[0]).toBeLessThanOrEqual(9990);
    expect(small[small.length - 1]).toBeGreaterThanOrEqual(10490);
    expect(small.every((t) => t % 100 === 0)).toBe(true);
  });
});
