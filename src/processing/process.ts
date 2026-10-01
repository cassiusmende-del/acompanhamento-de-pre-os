import {
  applyCorrections,
  computeProductAnalytics,
  deriveEvents,
  type CorrectionInput,
  type ObservationInput,
  type ProductAnalytics,
} from "@/analytics";
import type { PrismaClient } from "@/generated/prisma/client";
import { buildSnapshot } from "./snapshot";

/**
 * Processamento derivado das observações: eventos de mudança (price_events) e retrato das
 * métricas (product_snapshots). Tudo aqui é recalculável; nada altera observações.
 */

type Db = PrismaClient;

export interface ProductHistory {
  observations: ObservationInput[];
  corrections: CorrectionInput[];
}

export async function loadProductHistory(db: Db, productId: string): Promise<ProductHistory> {
  const [observations, corrections] = await Promise.all([
    db.priceObservation.findMany({
      where: { productId },
      orderBy: { observedAt: "asc" },
      select: {
        id: true,
        observedAt: true,
        status: true,
        priceCents: true,
        sellerId: true,
        sellerName: true,
        listPriceCents: true,
        source: true,
        suspect: true,
      },
    }),
    db.observationCorrection.findMany({
      where: { observation: { productId } },
      select: { observationId: true, action: true, newPriceCents: true, createdAt: true },
    }),
  ]);
  return { observations, corrections };
}

export async function loadProductAnalytics(
  db: Db,
  productId: string,
  now: Date = new Date(),
): Promise<ProductAnalytics> {
  const history = await loadProductHistory(db, productId);
  return computeProductAnalytics({ ...history, now });
}

/**
 * Recalcula os eventos e o retrato de um produto a partir das observações efetivas.
 * Chamado após cada observação nova e após cada correção.
 */
export async function processProduct(
  db: Db,
  productId: string,
  now: Date = new Date(),
): Promise<ProductAnalytics> {
  const history = await loadProductHistory(db, productId);
  const analytics = computeProductAnalytics({ ...history, now });
  const effective = applyCorrections(
    history.observations.filter((o) => o.observedAt.getTime() <= now.getTime()),
    history.corrections,
  );
  const events = deriveEvents(effective);
  const snapshot = buildSnapshot(analytics);
  const snapshotData = { ...snapshot, data: snapshot.data as unknown as object };

  await db.$transaction([
    db.priceEvent.deleteMany({ where: { productId } }),
    db.priceEvent.createMany({
      data: events.map((e) => ({
        productId,
        observationId: e.observationId,
        previousObservationId: e.previousObservationId,
        type: e.type,
        occurredAt: e.occurredAt,
        previousPriceCents: e.previousPriceCents,
        newPriceCents: e.newPriceCents,
        deltaCents: e.deltaCents,
        deltaPercent: e.deltaPercent === null ? null : Math.round(e.deltaPercent * 10_000) / 10_000,
        sellerChanged: e.sellerChanged,
        backInStock: e.backInStock,
      })),
    }),
    db.productSnapshot.upsert({
      where: { productId },
      create: { productId, ...snapshotData },
      update: snapshotData,
    }),
  ]);
  return analytics;
}

/** Reprocessa todos os produtos (após atualização do sistema ou para conferência). */
export async function processAllProducts(db: Db, now: Date = new Date()): Promise<number> {
  const products = await db.product.findMany({ select: { id: true } });
  for (const p of products) await processProduct(db, p.id, now);
  return products.length;
}

/** Garante que todos os produtos tenham retrato (preenche os que ainda não têm). */
export async function ensureSnapshots(db: Db, now: Date = new Date()): Promise<void> {
  const missing = await db.product.findMany({ where: { snapshot: null }, select: { id: true } });
  for (const p of missing) await processProduct(db, p.id, now);
}
