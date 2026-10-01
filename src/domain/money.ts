/**
 * Valores monetários são sempre inteiros em centavos. Médias e medianas podem
 * produzir frações de centavo; o arredondamento acontece só na exibição.
 */

export type Cents = number;

const BRL_INPUT = /^\s*(?:R\$\s*)?(-)?\s*(\d{1,3}(?:\.\d{3})+|\d+)(?:,(\d{1,2}))?\s*$/;

/**
 * Converte texto em reais no formato brasileiro para centavos.
 * Aceita "R$ 1.234,56", "1234,56", "1.234", "649,9". Retorna null se não reconhecer.
 * Ponto é sempre separador de milhar; vírgula é sempre decimal.
 */
export function parseBRL(input: string): Cents | null {
  const match = BRL_INPUT.exec(input.replace(/ /g, " "));
  if (!match) return null;
  const [, sign, integerPart, decimalPart = ""] = match;
  const reais = Number(integerPart.replace(/\./g, ""));
  const centavos = Number(decimalPart.padEnd(2, "0"));
  const value = reais * 100 + centavos;
  if (!Number.isSafeInteger(value)) return null;
  return sign ? -value : value;
}

function groupThousands(digits: string): string {
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

/** "R$ 1.234,56". Frações de centavo são arredondadas (meio para cima). */
export function formatBRL(cents: number): string {
  const rounded = Math.round(cents);
  const negative = rounded < 0;
  const abs = Math.abs(rounded);
  const reais = groupThousands(String(Math.floor(abs / 100)));
  const centavos = String(abs % 100).padStart(2, "0");
  return `${negative ? "-" : ""}R$ ${reais},${centavos}`;
}

/** "+R$ 70,00" / "-R$ 50,00" / "R$ 0,00". */
export function formatSignedBRL(cents: number): string {
  const rounded = Math.round(cents);
  if (rounded === 0) return formatBRL(0);
  return rounded > 0 ? `+${formatBRL(rounded)}` : formatBRL(rounded);
}

/** Número com vírgula decimal: formatDecimal(9.912, 1) → "9,9". */
export function formatDecimal(value: number, digits = 1): string {
  const fixed = Math.abs(value).toFixed(digits);
  const [int, frac] = fixed.split(".");
  const sign = value < 0 && Number(fixed) !== 0 ? "-" : "";
  return `${sign}${groupThousands(int)}${frac ? `,${frac}` : ""}`;
}

/** "9,9%" (sem sinal). */
export function formatPercent(value: number, digits = 1): string {
  return `${formatDecimal(value, digits)}%`;
}

/** "+12,1%" / "-9,9%" / "0,0%". */
export function formatSignedPercent(value: number, digits = 1): string {
  const text = formatPercent(value, digits);
  return value > 0 && Number(Math.abs(value).toFixed(digits)) !== 0 ? `+${text}` : text;
}
