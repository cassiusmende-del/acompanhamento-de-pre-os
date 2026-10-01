import { describe, expect, it } from "vitest";
import { applyCorrections } from "../corrections";
import { deriveEvents, detectEventForLatest } from "../events";
import { obs, weeklySeries } from "./fixtures";

describe("deriveEvents", () => {
  it("classifica as mudanças da série semanal", () => {
    const events = deriveEvents(applyCorrections(weeklySeries()));
    expect(events.map((e) => e.type)).toEqual([
      "FIRST_PRICE",
      "PRICE_DROP",
      "PRICE_DROP",
      "PRICE_INCREASE",
      "PRICE_DROP",
      "PRICE_INCREASE",
      "PRICE_DROP",
    ]);
  });

  it("registra valores do exemplo 699,90 → 649,90", () => {
    const events = deriveEvents(
      applyCorrections([obs("2026-09-05", 69990), obs("2026-09-12", 64990)]),
    );
    expect(events[1]).toMatchObject({
      type: "PRICE_DROP",
      previousPriceCents: 69990,
      newPriceCents: 64990,
      deltaCents: -5000,
    });
    expect(events[1].deltaPercent).toBeCloseTo(-7.1438, 3);
  });

  it("indisponibilidade: evento só na transição e nunca preço zero", () => {
    const events = deriveEvents(
      applyCorrections([
        obs("2026-09-01", 69990),
        obs("2026-09-02", null),
        obs("2026-09-03", null),
        obs("2026-09-04", 64990),
      ]),
    );
    expect(events.map((e) => e.type)).toEqual(["FIRST_PRICE", "PRICE_UNAVAILABLE", "PRICE_DROP"]);
    expect(events[1]).toMatchObject({
      previousPriceCents: 69990,
      newPriceCents: null,
      deltaCents: null,
    });
    // a comparação volta ao último preço válido, não a zero
    expect(events[2]).toMatchObject({
      previousPriceCents: 69990,
      deltaCents: -5000,
      backInStock: true,
    });
  });

  it("primeira observação indisponível e primeiro preço depois dela", () => {
    const events = deriveEvents(
      applyCorrections([obs("2026-09-01", null), obs("2026-09-02", 50000)]),
    );
    expect(events.map((e) => [e.type, e.backInStock])).toEqual([
      ["PRICE_UNAVAILABLE", false],
      ["FIRST_PRICE", true],
    ]);
  });

  it("preço igual gera PRICE_UNCHANGED e troca de vendedor é sinalizada", () => {
    const events = deriveEvents(
      applyCorrections([
        obs("2026-09-01", 50000, { sellerName: "Amazon.com.br" }),
        obs("2026-09-02", 50000, { sellerName: "Loja X" }),
        obs("2026-09-03", 50000, { sellerName: "loja x" }),
      ]),
    );
    expect(events.map((e) => [e.type, e.sellerChanged])).toEqual([
      ["FIRST_PRICE", false],
      ["PRICE_UNCHANGED", true],
      ["PRICE_UNCHANGED", false],
    ]);
  });

  it("detecta o evento da observação mais recente", () => {
    const effective = applyCorrections([obs("2026-09-01", null), obs("2026-09-02", null)]);
    expect(detectEventForLatest(effective)).toBeNull();
    expect(detectEventForLatest(applyCorrections(weeklySeries()))?.type).toBe("PRICE_DROP");
  });
});

describe("applyCorrections", () => {
  it("exclui, substitui e restaura respeitando a correção mais recente", () => {
    const a = obs("2026-09-01", 69990);
    const b = obs("2026-09-02", 6999); // erro de leitura
    const c = obs("2026-09-03", 70990);
    const t = (h: number) => new Date(Date.UTC(2026, 8, 10, h));
    const effective = applyCorrections(
      [c, a, b],
      [
        { observationId: b.id, action: "EXCLUDE", newPriceCents: null, createdAt: t(1) },
        { observationId: b.id, action: "REPLACE_PRICE", newPriceCents: 69990, createdAt: t(2) },
        { observationId: c.id, action: "EXCLUDE", newPriceCents: null, createdAt: t(1) },
        { observationId: c.id, action: "RESTORE", newPriceCents: null, createdAt: t(3) },
      ],
    );
    expect(effective.map((o) => [o.id, o.priceCents, o.corrected])).toEqual([
      [a.id, 69990, false],
      [b.id, 69990, true],
      [c.id, 70990, false],
    ]);
    expect(effective[1].originalPriceCents).toBe(6999);
  });

  it("observação excluída some da análise", () => {
    const a = obs("2026-09-01", 69990);
    const b = obs("2026-09-02", 1);
    const effective = applyCorrections(
      [a, b],
      [{ observationId: b.id, action: "EXCLUDE", newPriceCents: null, createdAt: new Date() }],
    );
    expect(effective.map((o) => o.id)).toEqual([a.id]);
  });
});
