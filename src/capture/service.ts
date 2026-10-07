import { applyCorrections, type ProductAnalytics } from "@/analytics";
import { DEFAULT_MARKETPLACE, productUrl } from "@/domain/asin";
import { Prisma, type PrismaClient } from "@/generated/prisma/client";
import { loadProductHistory, processProduct } from "@/processing/process";
import { assessSuspect } from "@/processing/suspect";
import { captureFeedback } from "./feedback";
import { computeTotalCents } from "./total";

/**
 * Gravação de produtos e observações. Toda entrada de preço (extensão, formulário manual,
 * provider) passa por `recordObservation`, que nunca altera observações existentes.
 */

type Db = PrismaClient;
export type Condition = "NEW" | "USED" | "REFURBISHED" | "UNKNOWN";
export type CaptureSource = "extension" | "cart" | "manual" | "mock";

export function placeholderTitle(asin: string): string {
  return `Produto ${asin}`;
}

export interface CreateProductInput {
  asin: string;
  title?: string | null;
  url?: string | null;
  trackedCondition?: Condition;
  targetIntervalHours?: number;
  notes?: string | null;
}

export type CreateProductResult =
  { ok: true; productId: string } | { ok: false; reason: "DUPLICATE"; productId: string };

export async function createProduct(
  db: Db,
  input: CreateProductInput,
): Promise<CreateProductResult> {
  const trackedCondition = input.trackedCondition ?? "NEW";
  const existing = await db.product.findUnique({
    where: {
      asin_marketplace_trackedCondition: {
        asin: input.asin,
        marketplace: DEFAULT_MARKETPLACE,
        trackedCondition,
      },
    },
    select: { id: true },
  });
  if (existing) return { ok: false, reason: "DUPLICATE", productId: existing.id };

  const product = await db.product.create({
    data: {
      asin: input.asin,
      marketplace: DEFAULT_MARKETPLACE,
      title: input.title?.trim() || placeholderTitle(input.asin),
      url: productUrl(input.asin),
      trackedCondition,
      targetIntervalHours: input.targetIntervalHours ?? 48,
      notes: input.notes?.trim() || null,
    },
    select: { id: true },
  });
  return { ok: true, productId: product.id };
}

export interface RecordObservationInput {
  productId: string;
  observedAt: Date;
  status: "OK" | "UNAVAILABLE";
  priceCents: number | null;
  listPriceCents?: number | null;
  shippingCents?: number | null;
  couponText?: string | null;
  couponCents?: number | null;
  sellerName?: string | null;
  fulfilledByAmazon?: boolean | null;
  condition?: Condition;
  availability?: string | null;
  /** Preço à vista no Pix/NuPay (fora da série principal). */
  pixPriceCents?: number | null;
  primeExclusive?: boolean | null;
  source: CaptureSource;
  /** Sessão de captura já criada (lotes); sem ela, cria uma sessão para esta observação. */
  collectionRunId?: string;
  /** Título lido da página; substitui o título provisório do produto. */
  pageTitle?: string | null;
  rawPayload?: unknown;
}

export type RecordObservationResult =
  | {
      status: "recorded";
      observationId: string;
      feedback: string[];
      analytics: ProductAnalytics;
      suspect: boolean;
    }
  | { status: "duplicate"; observationId: string; minutesAgo: number }
  | { status: "product_not_found" };

/**
 * Grava uma observação (append-only) e uma sessão de captura.
 *
 * Duplicidade: se a última observação da MESMA origem tiver menos de `dedupeMinutes` e o
 * mesmo status e preço, nada é gravado (evita repetir a cada recarga da página).
 * Mudança de preço dentro da janela é sempre gravada.
 */
export async function recordObservation(
  db: Db,
  input: RecordObservationInput,
  options: { dedupeMinutes: number; force?: boolean; now?: Date },
): Promise<RecordObservationResult> {
  const now = options.now ?? new Date();
  const product = await db.product.findUnique({
    where: { id: input.productId },
    select: { id: true, asin: true, title: true },
  });
  if (!product) return { status: "product_not_found" };

  if (!options.force && options.dedupeMinutes > 0) {
    const last = await db.priceObservation.findFirst({
      where: { productId: product.id, source: input.source },
      orderBy: { observedAt: "desc" },
      select: { id: true, observedAt: true, status: true, priceCents: true },
    });
    if (last) {
      const minutesAgo = (input.observedAt.getTime() - last.observedAt.getTime()) / 60_000;
      if (
        minutesAgo >= 0 &&
        minutesAgo < options.dedupeMinutes &&
        last.status === input.status &&
        last.priceCents === input.priceCents
      ) {
        return { status: "duplicate", observationId: last.id, minutesAgo: Math.floor(minutesAgo) };
      }
    }
  }

  const priceCents = input.status === "OK" ? input.priceCents : null;
  const history = await loadProductHistory(db, product.id);
  const assessment = assessSuspect(
    priceCents,
    applyCorrections(history.observations, history.corrections),
    input.observedAt,
  );

  const observation = await db.$transaction(async (tx) => {
    const runId =
      input.collectionRunId ??
      (
        await tx.collectionRun.create({
          data: {
            provider: input.source,
            trigger: input.source,
            status: "SUCCEEDED",
            finishedAt: now,
            okCount: input.status === "OK" ? 1 : 0,
            unavailableCount: input.status === "OK" ? 0 : 1,
          },
          select: { id: true },
        })
      ).id;
    const created = await tx.priceObservation.create({
      data: {
        productId: product.id,
        asin: product.asin,
        observedAt: input.observedAt,
        status: input.status,
        priceCents,
        listPriceCents: input.listPriceCents ?? null,
        shippingCents: input.shippingCents ?? null,
        couponText: input.couponText ?? null,
        couponCents: input.couponCents ?? null,
        totalCents: computeTotalCents({
          priceCents,
          shippingCents: input.shippingCents,
          couponText: input.couponText,
          couponCents: input.couponCents,
        }),
        sellerName: input.sellerName ?? null,
        fulfilledByAmazon: input.fulfilledByAmazon ?? null,
        condition: input.condition ?? "UNKNOWN",
        availability: input.availability ?? null,
        source: input.source,
        suspect: assessment.suspect,
        suspectReason: assessment.suspect ? assessment.reason : null,
        pixPriceCents: priceCents === null ? null : (input.pixPriceCents ?? null),
        primeExclusive: input.primeExclusive ?? null,
        collectionRunId: runId,
        rawPayload:
          input.rawPayload === undefined
            ? Prisma.JsonNull
            : (input.rawPayload as Prisma.InputJsonValue),
      },
      select: { id: true },
    });
    if (input.pageTitle && product.title === placeholderTitle(product.asin)) {
      await tx.product.update({ where: { id: product.id }, data: { title: input.pageTitle } });
    }
    return created;
  });

  const analytics = await processProduct(db, product.id, now);
  const feedback = captureFeedback(analytics, now);
  if (assessment.suspect) {
    feedback.push("Valor muito diferente do histórico recente: marcado para revisão na aplicação.");
  }
  return {
    status: "recorded",
    observationId: observation.id,
    feedback,
    analytics,
    suspect: assessment.suspect,
  };
}

export type CorrectionKind = "EXCLUDE" | "RESTORE" | "CONFIRM";

const DEFAULT_REASONS: Record<CorrectionKind, string> = {
  EXCLUDE: "Excluída pelo usuário",
  RESTORE: "Restaurada pelo usuário",
  CONFIRM: "Valor conferido pelo usuário",
};

/**
 * Registra uma correção (o registro original nunca muda) e reprocessa o produto.
 * EXCLUDE tira da análise; RESTORE desfaz correções; CONFIRM marca um suspeito como conferido.
 */
export async function correctObservation(
  db: Db,
  observationId: string,
  action: CorrectionKind,
  reason?: string,
): Promise<"done" | "not_found"> {
  const observation = await db.priceObservation.findUnique({
    where: { id: observationId },
    select: { id: true, productId: true },
  });
  if (!observation) return "not_found";
  await db.observationCorrection.create({
    data: { observationId, action, reason: reason?.trim() || DEFAULT_REASONS[action] },
  });
  await processProduct(db, observation.productId);
  return "done";
}

export async function excludeObservation(
  db: Db,
  observationId: string,
  reason: string,
): Promise<"excluded" | "not_found"> {
  return (await correctObservation(db, observationId, "EXCLUDE", reason)) === "done"
    ? "excluded"
    : "not_found";
}

export { loadProductAnalytics } from "@/processing/process";
