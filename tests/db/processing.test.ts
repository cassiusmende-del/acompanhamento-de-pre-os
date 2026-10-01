import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { correctObservation, createProduct, recordObservation } from "@/capture/service";
import { ensureSnapshots, processProduct } from "@/processing/process";
import { createPrismaClient } from "@/lib/prisma";
import type { PrismaClient } from "@/generated/prisma/client";

const url = process.env.TEST_DATABASE_URL;

function randomAsin(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  return (
    "P" + Array.from({ length: 9 }, () => chars[Math.floor(Math.random() * chars.length)]).join("")
  );
}

describe.skipIf(!url)("processamento: eventos, retrato e suspeitos", () => {
  let db: PrismaClient;
  beforeAll(() => {
    db = createPrismaClient(url);
  });
  afterAll(async () => {
    await db?.$disconnect();
  });

  it("grava eventos, marca suspeito, e reprocessa após confirmar ou excluir", async () => {
    const productId = (
      (await createProduct(db, { asin: randomAsin(), title: "Teste" })) as { productId: string }
    ).productId;
    const day = (d: number) => new Date(Date.UTC(2026, 8, d, 12));
    const record = (d: number, priceCents: number | null) =>
      recordObservation(
        db,
        {
          productId,
          observedAt: day(d),
          status: priceCents === null ? "UNAVAILABLE" : "OK",
          priceCents,
          source: "manual",
        },
        { dedupeMinutes: 0, now: day(d) },
      );

    await record(1, 69990);
    await record(3, 64990);
    await record(5, null);
    await record(7, 66990);
    const suspect = await record(8, 6699); // valor de parcela
    expect(suspect.status).toBe("recorded");
    if (suspect.status !== "recorded") throw new Error();
    expect(suspect.suspect).toBe(true);
    expect(suspect.feedback.at(-1)).toMatch(/marcado para revisão/);

    const stored = await db.priceObservation.findUniqueOrThrow({
      where: { id: suspect.observationId },
    });
    expect(stored.suspect).toBe(true);
    expect(stored.suspectReason).toMatch(/abaixo da mediana dos últimos 30 dias/);

    const events = await db.priceEvent.findMany({
      where: { productId },
      orderBy: { occurredAt: "asc" },
    });
    expect(events.map((e) => [e.type, e.backInStock])).toEqual([
      ["FIRST_PRICE", false],
      ["PRICE_DROP", false],
      ["PRICE_UNAVAILABLE", false],
      ["PRICE_INCREASE", true],
      ["PRICE_DROP", false],
    ]);
    expect(Number(events[1].deltaPercent)).toBeCloseTo(-7.1439, 3);

    let snap = await db.productSnapshot.findUniqueOrThrow({ where: { productId } });
    expect(snap).toMatchObject({ currentPriceCents: 6699, lowestPriceCents: 6699, pricedCount: 4 });
    expect((snap.data as { pendingSuspect: number }).pendingSuspect).toBe(1);

    await correctObservation(db, suspect.observationId, "CONFIRM");
    snap = await db.productSnapshot.findUniqueOrThrow({ where: { productId } });
    expect((snap.data as { pendingSuspect: number }).pendingSuspect).toBe(0);

    await correctObservation(db, suspect.observationId, "EXCLUDE", "parcela");
    snap = await db.productSnapshot.findUniqueOrThrow({ where: { productId } });
    expect(snap).toMatchObject({
      currentPriceCents: 66990,
      lowestPriceCents: 64990,
      pricedCount: 3,
    });
    expect(await db.priceEvent.count({ where: { productId } })).toBe(4);
  });

  it("ensureSnapshots preenche produtos sem retrato e processProduct é idempotente", async () => {
    const productId = ((await createProduct(db, { asin: randomAsin() })) as { productId: string })
      .productId;
    expect(await db.productSnapshot.findUnique({ where: { productId } })).toBeNull();
    await ensureSnapshots(db);
    expect(await db.productSnapshot.findUnique({ where: { productId } })).not.toBeNull();
    await processProduct(db, productId);
    await processProduct(db, productId);
    expect(await db.productSnapshot.count({ where: { productId } })).toBe(1);
  });
});
