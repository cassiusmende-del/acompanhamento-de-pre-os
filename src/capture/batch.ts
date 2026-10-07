import { DEFAULT_MARKETPLACE } from "@/domain/asin";
import type { PrismaClient } from "@/generated/prisma/client";
import type { BatchItem } from "./schema";
import { createProduct, recordObservation } from "./service";

/**
 * Grava de uma vez os preços lidos numa página com vários produtos (carrinho e "Salvo para
 * mais tarde"). Só registra produtos monitorados; os demais voltam em `notMonitored` para o
 * usuário decidir. Usa uma única sessão de captura para o lote.
 */

export interface BatchSummary {
  received: number;
  recorded: number;
  firstPrices: number;
  drops: number;
  increases: number;
  unchanged: number;
  unavailable: number;
  duplicates: number;
  suspect: number;
  unreadable: number;
  notMonitored: Array<{ asin: string; title: string | null }>;
}

export async function recordCaptureBatch(
  db: PrismaClient,
  items: readonly BatchItem[],
  options: {
    dedupeMinutes: number;
    force?: boolean;
    unreadable?: number;
    pageUrl?: string | null;
    now?: Date;
  },
): Promise<BatchSummary> {
  const now = options.now ?? new Date();
  const summary: BatchSummary = {
    received: items.length,
    recorded: 0,
    firstPrices: 0,
    drops: 0,
    increases: 0,
    unchanged: 0,
    unavailable: 0,
    duplicates: 0,
    suspect: 0,
    unreadable: options.unreadable ?? 0,
    notMonitored: [],
  };

  const unique = new Map<string, BatchItem>();
  for (const item of items) if (!unique.has(item.asin)) unique.set(item.asin, item);

  const products = await db.product.findMany({
    where: { asin: { in: [...unique.keys()] }, marketplace: DEFAULT_MARKETPLACE, active: true },
    select: { id: true, asin: true },
  });
  const productByAsin = new Map(products.map((p) => [p.asin, p.id]));

  const run = await db.collectionRun.create({
    data: {
      provider: "cart",
      trigger: "cart",
      status: "RUNNING",
      log: { pageUrl: options.pageUrl ?? null },
    },
    select: { id: true },
  });

  for (const item of unique.values()) {
    const productId = productByAsin.get(item.asin);
    if (!productId) {
      summary.notMonitored.push({ asin: item.asin, title: item.title ?? null });
      continue;
    }
    const result = await recordObservation(
      db,
      {
        productId,
        observedAt: now,
        status: item.status,
        priceCents: item.priceCents,
        listPriceCents: item.listPriceCents,
        pixPriceCents: item.pixPriceCents,
        primeExclusive: item.primeExclusive,
        sellerName: item.sellerName,
        availability: item.availability,
        source: "cart",
        pageTitle: item.title,
        collectionRunId: run.id,
        rawPayload: {
          pageUrl: options.pageUrl ?? null,
          section: item.section ?? null,
          diagnostics: item.diagnostics ?? null,
        },
      },
      { dedupeMinutes: options.dedupeMinutes, force: options.force, now },
    );
    if (result.status === "duplicate") {
      summary.duplicates++;
      continue;
    }
    if (result.status !== "recorded") continue;
    summary.recorded++;
    if (result.suspect) summary.suspect++;
    if (item.status !== "OK") {
      summary.unavailable++;
      continue;
    }
    const change = result.analytics.changes.fromPrevious;
    if (!change) summary.firstPrices++;
    else if (change.deltaCents < 0) summary.drops++;
    else if (change.deltaCents > 0) summary.increases++;
    else summary.unchanged++;
  }

  await db.collectionRun.update({
    where: { id: run.id },
    data: {
      status: summary.unreadable > 0 ? "PARTIAL" : "SUCCEEDED",
      finishedAt: new Date(),
      okCount: summary.recorded - summary.unavailable,
      unavailableCount: summary.unavailable,
      errorCount: summary.unreadable,
    },
  });
  return summary;
}

/** Cadastra vários produtos de uma vez (ignora os que já existem). */
export async function monitorBatch(
  db: PrismaClient,
  items: ReadonlyArray<{ asin: string; title: string }>,
): Promise<{ created: number; existing: number }> {
  let created = 0;
  let existing = 0;
  for (const item of items) {
    const r = await createProduct(db, { asin: item.asin, title: item.title });
    if (r.ok) created++;
    else existing++;
  }
  return { created, existing };
}

/** Frases curtas do resumo, mostradas no aviso da extensão. */
export function batchSummaryLines(s: BatchSummary): string[] {
  const lines: string[] = [];
  const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
  if (s.recorded === 0 && s.duplicates === 0) {
    lines.push("Nenhum preço registrado.");
  } else {
    lines.push(`${plural(s.recorded, "preço registrado", "preços registrados")}.`);
    const changes = [
      s.drops && plural(s.drops, "queda", "quedas"),
      s.increases && plural(s.increases, "alta", "altas"),
      s.unchanged && plural(s.unchanged, "sem mudança", "sem mudança"),
      s.firstPrices && plural(s.firstPrices, "primeiro registro", "primeiros registros"),
    ].filter(Boolean);
    if (changes.length) lines.push(`Desde o registro anterior: ${changes.join(", ")}.`);
  }
  if (s.unavailable)
    lines.push(`${plural(s.unavailable, "item indisponível", "itens indisponíveis")}.`);
  if (s.duplicates)
    lines.push(
      `${plural(s.duplicates, "item já registrado", "itens já registrados")} há pouco com o mesmo preço.`,
    );
  if (s.suspect)
    lines.push(
      `${plural(s.suspect, "valor suspeito", "valores suspeitos")} para revisar na aplicação.`,
    );
  if (s.unreadable)
    lines.push(
      `${plural(s.unreadable, "item não pôde ser lido", "itens não puderam ser lidos")}; nada foi gravado para eles.`,
    );
  if (s.notMonitored.length)
    lines.push(
      `${plural(s.notMonitored.length, "item ainda não é monitorado", "itens ainda não são monitorados")}.`,
    );
  return lines;
}
