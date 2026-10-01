import { describe, expect, it } from "vitest";
import { formatBRL, formatPercent, formatSignedBRL, formatSignedPercent, parseBRL } from "../money";
import { percentChange } from "@/analytics/stats";

describe("parseBRL", () => {
  it.each([
    ["R$ 649,90", 64990],
    ["649,90", 64990],
    ["649,9", 64990],
    ["R$1.234,56", 123456],
    ["1.234", 123400],
    ["12.345.678,00", 1234567800],
    ["  R$ 899,00 ", 89900],
    ["700", 70000],
  ])("%s → %i", (input, expected) => {
    expect(parseBRL(input)).toBe(expected);
  });

  it.each(["", "abc", "649.90", "1,234.56", "R$ 64,999", "12.34"])("rejeita %j", (input) => {
    expect(parseBRL(input)).toBeNull();
  });
});

describe("formatação", () => {
  it("formata reais", () => {
    expect(formatBRL(64990)).toBe("R$ 649,90");
    expect(formatBRL(123456789)).toBe("R$ 1.234.567,89");
    expect(formatBRL(5)).toBe("R$ 0,05");
    expect(formatBRL(72140.4)).toBe("R$ 721,40");
    expect(formatSignedBRL(-5000)).toBe("-R$ 50,00");
    expect(formatSignedBRL(7000)).toBe("+R$ 70,00");
    expect(formatSignedBRL(0)).toBe("R$ 0,00");
  });

  it("formata percentuais com vírgula", () => {
    expect(formatPercent(9.912)).toBe("9,9%");
    expect(formatSignedPercent(-7.1438)).toBe("-7,1%");
    expect(formatSignedPercent(12.07)).toBe("+12,1%");
    expect(formatSignedPercent(0.01)).toBe("0,0%");
    expect(formatSignedPercent(-0.01)).toBe("0,0%");
  });

  it("porcentagens não sugerem extremos que não ocorreram", async () => {
    const { formatShare, formatPercentileLabel } = await import("../money");
    expect(formatShare(0.31)).toBe("<1%");
    expect(formatShare(0)).toBe("0%");
    expect(formatShare(18.4)).toBe("18%");
    expect(formatShare(99.7)).toBe(">99%");
    expect(formatShare(100)).toBe("100%");
    expect(formatPercentileLabel(0.6)).toBe("1");
  });

  it("reproduz os números do exemplo do enunciado", () => {
    // Atual 649,90; média 721,40; menor 579,90.
    expect(formatSignedPercent(percentChange(64990, 72140)!)).toBe("-9,9%");
    expect(formatSignedPercent(percentChange(64990, 57990)!)).toBe("+12,1%");
    // 699,90 → 649,90
    expect(formatSignedPercent(percentChange(64990, 69990)!, 2)).toBe("-7,14%");
  });
});
