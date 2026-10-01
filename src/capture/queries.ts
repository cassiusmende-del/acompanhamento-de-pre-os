import type { PrismaClient } from "@/generated/prisma/client";
import { buildCaptureQueue, type QueueItem } from "./queue";

/** Fila de captura dos produtos ativos. */
export async function loadCaptureQueue(db: PrismaClient, now: Date): Promise<QueueItem[]> {
  const products = await db.product.findMany({
    where: { active: true },
    select: {
      id: true,
      title: true,
      asin: true,
      url: true,
      createdAt: true,
      targetIntervalHours: true,
      observations: { orderBy: { observedAt: "desc" }, take: 1, select: { observedAt: true } },
    },
  });
  return buildCaptureQueue(
    products.map((p) => ({
      productId: p.id,
      title: p.title,
      asin: p.asin,
      url: p.url,
      createdAt: p.createdAt,
      targetIntervalHours: p.targetIntervalHours,
      lastObservedAt: p.observations[0]?.observedAt ?? null,
    })),
    now,
  );
}
