import { describe, expect, it } from "vitest";
import { parseManualObservationForm, parseProductForm } from "../forms";

function form(values: Record<string, string>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(values)) f.set(k, v);
  return f;
}

describe("parseProductForm", () => {
  it("aceita link da Amazon Brasil", () => {
    const r = parseProductForm(
      form({
        input: "https://www.amazon.com.br/x/dp/B0BHJJ9Y77?th=1",
        title: "",
        targetIntervalHours: "",
      }),
    );
    expect(r).toEqual({
      ok: true,
      data: { asin: "B0BHJJ9Y77", title: null, targetIntervalHours: 48, notes: null },
    });
  });

  it("explica por que recusa link curto, outro país e intervalo inválido", () => {
    const r = parseProductForm(form({ input: "https://amzn.to/abc", targetIntervalHours: "0" }));
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors.input).toMatch(/link completo/);
      expect(r.errors.targetIntervalHours).toBeDefined();
    }
    const other = parseProductForm(form({ input: "https://www.amazon.com/dp/B0BHJJ9Y77" }));
    expect(!other.ok && other.errors.input).toMatch(/Amazon Brasil/);
  });
});

describe("parseManualObservationForm", () => {
  const now = new Date("2026-10-01T15:00:00Z");

  it("interpreta preço, frete grátis, cupom e data local", () => {
    const r = parseManualObservationForm(
      form({
        status: "OK",
        price: "R$ 649,90",
        observedAt: "2026-10-01T10:30",
        shipping: "Grátis",
        couponText: "Cupom de R$ 50",
        couponValue: "50",
        listPrice: "899,00",
        sellerName: "Amazon.com.br",
        condition: "NEW",
      }),
      now,
    );
    expect(r).toEqual({
      ok: true,
      data: {
        status: "OK",
        priceCents: 64990,
        observedAt: new Date("2026-10-01T13:30:00Z"),
        sellerName: "Amazon.com.br",
        listPriceCents: 89900,
        shippingCents: 0,
        couponText: "Cupom de R$ 50",
        couponCents: 5000,
        condition: "NEW",
      },
    });
  });

  it("frete vazio fica desconhecido e data vazia usa o momento atual", () => {
    const r = parseManualObservationForm(form({ status: "OK", price: "100" }), now);
    expect(r.ok && r.data).toMatchObject({
      shippingCents: null,
      observedAt: now,
      condition: "UNKNOWN",
    });
  });

  it("indisponível não exige nem guarda preço", () => {
    const r = parseManualObservationForm(form({ status: "UNAVAILABLE", price: "649,90" }), now);
    expect(r.ok && r.data).toMatchObject({ status: "UNAVAILABLE", priceCents: null });
  });

  it("aponta erros por campo", () => {
    const r = parseManualObservationForm(
      form({ status: "OK", price: "0", observedAt: "2026-10-02T10:00", shipping: "abc" }),
      now,
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(Object.keys(r.errors).sort()).toEqual(["observedAt", "price", "shipping"]);
  });
});
