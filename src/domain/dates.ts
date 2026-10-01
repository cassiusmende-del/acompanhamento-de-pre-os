export const DISPLAY_TIME_ZONE = "America/Sao_Paulo";

const dateFormatter = new Intl.DateTimeFormat("pt-BR", {
  timeZone: DISPLAY_TIME_ZONE,
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

const dateTimeFormatter = new Intl.DateTimeFormat("pt-BR", {
  timeZone: DISPLAY_TIME_ZONE,
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

/** "12/09/2026" no fuso de São Paulo. */
export function formatDate(date: Date): string {
  return dateFormatter.format(date);
}

/** "12/09/2026 14:02" no fuso de São Paulo. */
export function formatDateTime(date: Date): string {
  return dateTimeFormatter.format(date).replace(",", "");
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** Dias completos decorridos entre duas datas. */
export function wholeDaysBetween(from: Date, to: Date): number {
  return Math.floor((to.getTime() - from.getTime()) / DAY_MS);
}

/** "hoje", "há 1 dia", "há 47 dias". */
export function formatDaysAgo(date: Date, now: Date): string {
  const days = wholeDaysBetween(date, now);
  if (days <= 0) return "hoje";
  return days === 1 ? "há 1 dia" : `há ${days} dias`;
}

/** Duração em dias com uma casa decimal quando menor que 10: "0,5 dia", "4 dias". */
export function formatDurationDays(ms: number): string {
  const days = ms / DAY_MS;
  if (days < 1) {
    const hours = Math.round(ms / (60 * 60 * 1000));
    return hours === 1 ? "1 hora" : `${hours} horas`;
  }
  const rounded = days < 10 ? Math.round(days * 10) / 10 : Math.round(days);
  const text = String(rounded).replace(".", ",");
  return rounded === 1 ? "1 dia" : `${text} dias`;
}
