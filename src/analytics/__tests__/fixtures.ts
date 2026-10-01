import type { ObservationInput, ObservationStatus } from "../types";

let seq = 0;

/** Data em UTC ao meio-dia (evita ambiguidade de fuso nos testes). */
export function d(isoDate: string, hour = 12): Date {
  return new Date(`${isoDate}T${String(hour).padStart(2, "0")}:00:00Z`);
}

export function obs(
  date: Date | string,
  priceCents: number | null,
  extra: Partial<ObservationInput> = {},
): ObservationInput {
  const status: ObservationStatus = priceCents === null ? "UNAVAILABLE" : "OK";
  return {
    id: `o${String(++seq).padStart(5, "0")}`,
    observedAt: typeof date === "string" ? d(date) : date,
    status,
    priceCents,
    ...extra,
  };
}

/** Série semanal do enunciado (01/08 a 12/09/2026). */
export function weeklySeries(): ObservationInput[] {
  return [
    obs("2026-08-01", 79990),
    obs("2026-08-08", 74990),
    obs("2026-08-15", 69990),
    obs("2026-08-22", 72990),
    obs("2026-08-29", 67990),
    obs("2026-09-05", 69990),
    obs("2026-09-12", 64990),
  ];
}

/**
 * Distribuição do enunciado: 899 ×12, 799 ×18, 699 ×24, 649 ×5, 599 ×1 — uma observação
 * por dia, em blocos, terminando com a observação atual em 649.
 */
export function distributionSeries(start = "2026-06-01"): ObservationInput[] {
  const plan: Array<[number, number]> = [
    [89900, 12],
    [79900, 18],
    [69900, 24],
    [59900, 1],
    [64900, 5],
  ];
  const out: ObservationInput[] = [];
  let t = d(start).getTime();
  for (const [price, count] of plan) {
    for (let i = 0; i < count; i++) {
      out.push(obs(new Date(t), price));
      t += 24 * 60 * 60 * 1000;
    }
  }
  return out;
}
