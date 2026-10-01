import { describe, expect, it } from "vitest";
import { DAY_MS } from "../config";
import { applyCorrections } from "../corrections";
import { buildSegments } from "../timeline";
import { windowMinimum } from "../windows";
import { d, obs, weeklySeries } from "./fixtures";

const SEVEN_DAYS = 7 * DAY_MS;

function segmentsOf(list: ReturnType<typeof obs>[], now: Date) {
  return buildSegments(applyCorrections(list), now, SEVEN_DAYS);
}

describe("buildSegments", () => {
  it("cada observação vale até a próxima, limitada ao teto de validade", () => {
    const now = d("2026-09-30");
    const s = segmentsOf(
      [obs("2026-09-01", 100), obs("2026-09-03", 200), obs("2026-09-20", 300)],
      now,
    );
    expect(s.map((x) => (x.end - x.start) / DAY_MS)).toEqual([2, 7, 7]);
  });
});

describe("windowMinimum", () => {
  const now = d("2026-09-12", 18);

  it("janela completa quando o histórico a cobre", () => {
    const s = segmentsOf(weeklySeries(), now);
    const w7 = windowMinimum(s, now, 7, 0.25);
    expect(w7).toMatchObject({ status: "complete", minCents: 64990 });
    expect(w7.coverage).toBeCloseTo(1);
    expect(windowMinimum(s, now, 30, 0.25)).toMatchObject({ status: "complete", minCents: 64990 });
  });

  it("janela parcial quando o histórico começa depois do início", () => {
    const s = segmentsOf(weeklySeries(), now);
    const w90 = windowMinimum(s, now, 90, 0.25);
    expect(w90.status).toBe("partial");
    expect(w90.minCents).toBe(64990);
    expect(w90.coveredDays).toBeCloseTo(42.25);
  });

  it("considera o preço vigente no início da janela", () => {
    // 500 observado 3 dias antes da janela de 7 dias e ainda vigente dentro dela
    const n = d("2026-09-20");
    const s = segmentsOf(
      [obs("2026-09-01", 900), obs("2026-09-10", 500), obs("2026-09-15", 800)],
      n,
    );
    const w = windowMinimum(s, n, 7, 0.25);
    expect(w.minCents).toBe(500);
    expect(w.minObservedAt).toEqual(d("2026-09-10"));
  });

  it("sem dados quando nenhuma observação é vigente na janela", () => {
    const n = d("2026-09-30");
    const s = segmentsOf([obs("2026-03-01", 900)], n);
    expect(windowMinimum(s, n, 7, 0.25)).toMatchObject({ status: "no_data", minCents: null });
    expect(windowMinimum(s, n, 365, 0.25)).toMatchObject({ status: "partial", minCents: 900 });
  });

  it("lacuna grande dentro da janela torna o resultado parcial", () => {
    const n = d("2026-09-30");
    const s = segmentsOf(
      [obs("2026-08-15", 700), obs("2026-09-01", 650), obs("2026-09-25", 690)],
      n,
    );
    // 08/09 a 25/09 sem dados: 17 dias de 30 (> 25%)
    expect(windowMinimum(s, n, 30, 0.25)).toMatchObject({ status: "partial", minCents: 650 });
  });
});
