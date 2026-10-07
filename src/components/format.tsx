import { formatDate, formatDateTime } from "@/domain/dates";
import { formatBRL } from "@/domain/money";

export function Money({
  cents,
  empty = "—",
}: {
  cents: number | null | undefined;
  empty?: string;
}) {
  if (cents === null || cents === undefined) return <span className="text-muted">{empty}</span>;
  return <span className="tabular-nums">{formatBRL(cents)}</span>;
}

export function DateTime({ date }: { date: Date | null | undefined }) {
  if (!date) return <span className="text-muted">—</span>;
  return <time dateTime={date.toISOString()}>{formatDateTime(date)}</time>;
}

export function DateOnly({ date }: { date: Date | null | undefined }) {
  if (!date) return <span className="text-muted">—</span>;
  return <time dateTime={date.toISOString()}>{formatDate(date)}</time>;
}

export const SOURCE_LABELS: Record<string, string> = {
  extension: "extensão",
  cart: "carrinho",
  manual: "manual",
  mock: "simulado",
};

export function sourceLabel(source: string): string {
  return SOURCE_LABELS[source] ?? source;
}
