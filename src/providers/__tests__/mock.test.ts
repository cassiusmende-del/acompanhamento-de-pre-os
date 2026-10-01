import { describe, expect, it } from "vitest";
import { MockPriceProvider, mockPriceAt } from "../mock";

describe("MockPriceProvider", () => {
  it("é determinístico por ASIN e instante", () => {
    const at = new Date("2026-09-01T12:00:00Z");
    expect(mockPriceAt("DEMO000001", at)).toEqual(mockPriceAt("DEMO000001", at));
    expect(mockPriceAt("DEMO000001", at)).not.toEqual(mockPriceAt("DEMO000002", at));
  });

  it("gera preços positivos terminados em ,90 e algumas indisponibilidades", () => {
    let unavailable = 0;
    for (let d = 0; d < 365; d++) {
      const { priceCents } = mockPriceAt("DEMO000001", new Date(Date.UTC(2026, 0, 1 + d, 12)));
      if (priceCents === null) unavailable++;
      else {
        expect(priceCents).toBeGreaterThan(0);
        expect(priceCents % 100).toBe(90);
      }
    }
    expect(unavailable).toBeGreaterThan(0);
    expect(unavailable).toBeLessThan(30);
  });

  it("devolve resultado no formato do contrato", async () => {
    const provider = new MockPriceProvider(() => new Date("2026-09-01T12:00:00Z"));
    const result = await provider.getPrice({ asin: "DEMO000003", marketplace: "amazon.com.br" });
    expect(["OK", "UNAVAILABLE"]).toContain(result.status);
  });
});
