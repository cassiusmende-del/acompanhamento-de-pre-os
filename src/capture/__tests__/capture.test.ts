import { describe, expect, it } from "vitest";
import { computeProductAnalytics } from "@/analytics";
import { captureFeedback } from "../feedback";
import { buildCaptureQueue } from "../queue";
import { extensionCaptureSchema } from "../schema";
import { computeTotalCents } from "../total";

describe("extensionCaptureSchema", () => {
  const base = { asin: " b0bhjj9y77 ", status: "OK", priceCents: 64990 };

  it("normaliza ASIN e textos vazios", () => {
    const parsed = extensionCaptureSchema.parse({ ...base, sellerName: "  ", title: " SSD " });
    expect(parsed).toMatchObject({
      asin: "B0BHJJ9Y77",
      sellerName: null,
      title: "SSD",
      condition: "UNKNOWN",
    });
  });

  it("exige preço quando disponível e proíbe preço quando indisponível", () => {
    expect(extensionCaptureSchema.safeParse({ ...base, priceCents: null }).success).toBe(false);
    expect(extensionCaptureSchema.safeParse({ ...base, status: "UNAVAILABLE" }).success).toBe(
      false,
    );
    expect(
      extensionCaptureSchema.safeParse({ ...base, status: "UNAVAILABLE", priceCents: null })
        .success,
    ).toBe(true);
  });

  it("rejeita preço zero, fracionado ou absurdo", () => {
    for (const priceCents of [0, -100, 649.9, 100_000_001]) {
      expect(extensionCaptureSchema.safeParse({ ...base, priceCents }).success).toBe(false);
    }
  });
});

describe("computeTotalCents", () => {
  it("soma frete e desconta cupom em reais", () => {
    expect(computeTotalCents({ priceCents: 64990, shippingCents: 0 })).toBe(64990);
    expect(
      computeTotalCents({
        priceCents: 64990,
        shippingCents: 1290,
        couponText: "R$ 50",
        couponCents: 5000,
      }),
    ).toBe(61280);
  });

  it("fica desconhecido sem frete ou com cupom percentual", () => {
    expect(computeTotalCents({ priceCents: 64990, shippingCents: null })).toBeNull();
    expect(
      computeTotalCents({ priceCents: 64990, shippingCents: 0, couponText: "10% de desconto" }),
    ).toBeNull();
    expect(computeTotalCents({ priceCents: null, shippingCents: 0 })).toBeNull();
  });
});

describe("buildCaptureQueue", () => {
  const now = new Date("2026-10-01T12:00:00Z");
  const item = (id: string, last: string | null, hours = 48, created = "2026-09-01T00:00:00Z") => ({
    productId: id,
    title: id,
    asin: "B000000000",
    url: "u",
    createdAt: new Date(created),
    lastObservedAt: last ? new Date(last) : null,
    targetIntervalHours: hours,
  });

  it("nunca capturados, depois pendentes mais antigos, depois em dia", () => {
    const queue = buildCaptureQueue(
      [
        item("ok", "2026-10-01T06:00:00Z"),
        item("due-recent", "2026-09-29T06:00:00Z"),
        item("never", null),
        item("due-old", "2026-09-20T12:00:00Z"),
      ],
      now,
    );
    expect(queue.map((q) => [q.productId, q.status])).toEqual([
      ["never", "never"],
      ["due-old", "due"],
      ["due-recent", "due"],
      ["ok", "ok"],
    ]);
    expect(queue[1].hoursSinceLast).toBe(264);
  });
});

describe("captureFeedback", () => {
  const obs = (id: string, at: string, priceCents: number | null) => ({
    id,
    observedAt: new Date(at),
    status: priceCents === null ? ("UNAVAILABLE" as const) : ("OK" as const),
    priceCents,
  });
  const now = new Date("2026-09-12T15:00:00Z");

  it("descreve a variação e o menor preço", () => {
    const a = computeProductAnalytics({
      observations: [
        obs("a", "2026-07-27T12:00:00Z", 57990),
        obs("b", "2026-09-05T12:00:00Z", 69990),
        obs("c", "2026-09-12T12:00:00Z", 64990),
      ],
      now,
    });
    expect(captureFeedback(a, now)).toEqual([
      "R$ 649,90 registrado.",
      "Caiu 7,1% desde a observação anterior (R$ 699,90).",
      "Menor registrado: R$ 579,90 (há 47 dias).",
    ]);
  });

  it("novo menor preço e empate com o menor", () => {
    const record = computeProductAnalytics({
      observations: [
        obs("a", "2026-09-10T12:00:00Z", 69990),
        obs("b", "2026-09-12T12:00:00Z", 62990),
      ],
      now,
    });
    expect(captureFeedback(record, now)[2]).toBe("É o menor preço já registrado.");
    const tie = computeProductAnalytics({
      observations: [
        obs("a", "2026-09-09T12:00:00Z", 62990),
        obs("b", "2026-09-10T12:00:00Z", 69990),
        obs("c", "2026-09-12T12:00:00Z", 62990),
      ],
      now,
    });
    expect(captureFeedback(tie, now)[2]).toBe("Igual ao menor preço já registrado.");
  });

  it("primeiro preço e indisponibilidade", () => {
    const first = computeProductAnalytics({
      observations: [obs("a", "2026-09-12T12:00:00Z", 50000)],
      now,
    });
    expect(captureFeedback(first, now)).toEqual([
      "R$ 500,00 registrado.",
      "Primeiro preço deste produto.",
    ]);
    const out = computeProductAnalytics({
      observations: [
        obs("a", "2026-09-11T12:00:00Z", 50000),
        obs("b", "2026-09-12T12:00:00Z", null),
      ],
      now,
    });
    expect(captureFeedback(out, now)).toEqual([
      "Registrado como indisponível.",
      "Último preço registrado: R$ 500,00.",
    ]);
  });
});
