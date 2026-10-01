import type { ProductAnalytics } from "@/analytics";
import { formatDaysAgo } from "@/domain/dates";
import { formatBRL, formatPercent } from "@/domain/money";

/**
 * Linhas curtas mostradas logo após uma captura (aviso da extensão e tela de confirmação).
 * Apenas fatos sobre o histórico registrado.
 */
export function captureFeedback(a: ProductAnalytics, now: Date): string[] {
  const lines: string[] = [];
  if (!a.current) {
    lines.push("Registrado como indisponível.");
    if (a.lastPriced) lines.push(`Último preço registrado: ${formatBRL(a.lastPriced.priceCents)}.`);
    return lines;
  }
  lines.push(`${formatBRL(a.current.priceCents)} registrado.`);
  const prev = a.changes.fromPrevious;
  if (!prev) {
    lines.push("Primeiro preço deste produto.");
    return lines;
  }
  if (prev.deltaCents === 0) lines.push("Igual à observação anterior.");
  else
    lines.push(
      `${prev.deltaCents < 0 ? "Caiu" : "Subiu"} ${formatPercent(Math.abs(prev.percent))} desde a observação anterior (${formatBRL(prev.referenceCents)}).`,
    );
  if (a.lowest) {
    lines.push(
      a.lowest.priceCents === a.current.priceCents
        ? a.lowest.count === 1
          ? "É o menor preço já registrado."
          : "Igual ao menor preço já registrado."
        : `Menor registrado: ${formatBRL(a.lowest.priceCents)} (${formatDaysAgo(a.lowest.lastAt, now)}).`,
    );
  }
  return lines;
}
