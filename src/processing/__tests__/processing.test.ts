import { describe, expect, it } from "vitest";
import { applyCorrections, computeProductAnalytics, type ObservationInput } from "@/analytics";
import { buildSnapshot } from "../snapshot";
import { assessSuspect } from "../suspect";

const DAY = 86_400_000;
let seq = 0;
function obs(
  at: string,
  priceCents: number | null,
  extra: Partial<ObservationInput> = {},
): ObservationInput {
  return {
    id: `s${++seq}`,
    observedAt: new Date(at),
    status: priceCents === null ? "UNAVAILABLE" : "OK",
    priceCents,
    ...extra,
  };
}

describe("assessSuspect", () => {
  const history = applyCorrections([
    obs("2026-09-20T12:00:00Z", 64990),
    obs("2026-09-22T12:00:00Z", 69990),
    obs("2026-09-25T12:00:00Z", 66990),
  ]);
  const at = new Date("2026-09-28T12:00:00Z");

  it("marca valor de parcela lido como preço", () => {
    const r = assessSuspect(6499, history, at);
    expect(r).toEqual({
      suspect: true,
      reason: "90% abaixo da mediana dos últimos 30 dias (R$ 669,90, 3 observações).",
    });
  });

  it("marca valor muito acima e aceita variações normais e promoções fortes", () => {
    expect(assessSuspect(120000, history, at).suspect).toBe(true);
    expect(assessSuspect(45990, history, at).suspect).toBe(false); // -31%
    expect(assessSuspect(28990, history, at).suspect).toBe(false); // -56,7%
  });

  it("não avalia sem histórico recente suficiente ou sem preço", () => {
    expect(assessSuspect(6499, history.slice(0, 2), at).suspect).toBe(false);
    expect(assessSuspect(6499, history, new Date(at.getTime() + 40 * DAY)).suspect).toBe(false);
    expect(assessSuspect(null, history, at).suspect).toBe(false);
  });

  it("ignora observações excluídas da análise", () => {
    const withExcluded = applyCorrections(
      [...history, obs("2026-09-26T12:00:00Z", 100)].map((o) => ({ ...o })),
      [{ observationId: `s${seq}`, action: "EXCLUDE", newPriceCents: null, createdAt: at }],
    );
    expect(withExcluded).toHaveLength(3);
    const r = assessSuspect(6499, withExcluded, at);
    expect(r.suspect && r.reason).toMatch(/R\$ 669,90, 3 observações/);
  });
});

describe("pendingSuspect e buildSnapshot", () => {
  it("conta suspeitos não revisados e monta o retrato", () => {
    const a1 = obs("2026-09-20T12:00:00Z", 64990);
    const a2 = obs("2026-09-22T12:00:00Z", 69990);
    const s1 = obs("2026-09-23T12:00:00Z", 6499, { suspect: true });
    const s2 = obs("2026-09-24T12:00:00Z", 99990, { suspect: true });
    const now = new Date("2026-09-25T12:00:00Z");
    const a = computeProductAnalytics({
      observations: [a1, a2, s1, s2],
      corrections: [
        { observationId: s2.id, action: "CONFIRM", newPriceCents: null, createdAt: now },
      ],
      now,
    });
    expect(a.counts.pendingSuspect).toBe(1);

    const snap = buildSnapshot(a);
    expect(snap).toMatchObject({
      currentPriceCents: 99990,
      previousPriceCents: 6499,
      lowestPriceCents: 6499,
      highestPriceCents: 99990,
      medianPriceCents: 67490,
      pricedCount: 4,
      percentile: null,
      data: { percentileStatus: "insufficient", pendingSuspect: 1, dropCount: 1, increaseCount: 2 },
    });
  });
});
