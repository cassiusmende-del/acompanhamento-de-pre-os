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

function zoneOffsetMs(utcMs: number, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(new Date(utcMs));
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  const asUtc = Date.UTC(
    get("year"),
    get("month") - 1,
    get("day"),
    get("hour"),
    get("minute"),
    get("second"),
  );
  return asUtc - Math.floor(utcMs / 1000) * 1000;
}

/**
 * Interpreta "AAAA-MM-DDTHH:mm" (valor de <input type="datetime-local">) no fuso informado.
 * Retorna null se o texto não estiver nesse formato.
 */
export function parseLocalDateTime(value: string, timeZone = DISPLAY_TIME_ZONE): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value.trim());
  if (!m) return null;
  const [, y, mo, d, h, mi] = m.map(Number);
  const naive = Date.UTC(y, mo - 1, d, h, mi);
  const check = new Date(naive);
  if (check.getUTCMonth() !== mo - 1 || check.getUTCDate() !== d || h > 23 || mi > 59) return null;
  let utc = naive - zoneOffsetMs(naive, timeZone);
  // Segunda passada cobre mudanças de horário de verão perto do instante.
  utc = naive - zoneOffsetMs(utc, timeZone);
  return new Date(utc);
}

/** Valor para <input type="datetime-local"> no fuso informado. */
export function toLocalDateTimeInput(date: Date, timeZone = DISPLAY_TIME_ZONE): string {
  const local = new Date(date.getTime() + zoneOffsetMs(date.getTime(), timeZone));
  return local.toISOString().slice(0, 16);
}
