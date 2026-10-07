import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { batchSummaryLines, monitorBatch, recordCaptureBatch } from "@/capture/batch";
import { createProduct, recordObservation } from "@/capture/service";
import { createPrismaClient } from "@/lib/prisma";
import type { PrismaClient } from "@/generated/prisma/client";

const url = process.env.TEST_DATABASE_URL;
const rnd = () =>
  "C" +
  Array.from(
    { length: 9 },
    () => "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"[Math.floor(Math.random() * 32)],
  ).join("");

describe.skipIf(!url)("lote do carrinho", () => {
  let db: PrismaClient;
  beforeAll(() => {
    db = createPrismaClient(url);
  });
  afterAll(async () => {
    await db?.$disconnect();
  });

  it("registra monitorados, separa Pix, resume e devolve os não monitorados", async () => {
    const [a, b, c, d] = [rnd(), rnd(), rnd(), rnd()];
    const idA = ((await createProduct(db, { asin: a, title: "A" })) as { productId: string })
      .productId;
    const idB = ((await createProduct(db, { asin: b, title: "B" })) as { productId: string })
      .productId;
    await createProduct(db, { asin: c, title: "C" });
    const t0 = new Date("2026-10-01T12:00:00Z");
    await recordObservation(
      db,
      { productId: idA, observedAt: t0, status: "OK", priceCents: 19900, source: "manual" },
      { dedupeMinutes: 0, now: t0 },
    );

    const now = new Date("2026-10-07T12:00:00Z");
    const summary = await recordCaptureBatch(
      db,
      [
        {
          asin: a,
          title: "A",
          status: "OK",
          priceCents: 17900,
          pixPriceCents: 17005,
          primeExclusive: false,
        },
        {
          asin: b,
          title: "B",
          status: "OK",
          priceCents: 3912,
          listPriceCents: 5900,
          primeExclusive: true,
        },
        { asin: c, title: "C", status: "UNAVAILABLE", priceCents: null },
        { asin: d, title: "Livro novo", status: "OK", priceCents: 5000 },
        { asin: a, title: "A", status: "OK", priceCents: 17900 },
      ],
      {
        dedupeMinutes: 30,
        unreadable: 1,
        pageUrl: "https://www.amazon.com.br/gp/cart/view.html",
        now,
      },
    );
    expect(summary).toMatchObject({
      received: 5,
      recorded: 3,
      drops: 1,
      firstPrices: 1,
      unavailable: 1,
      unreadable: 1,
      notMonitored: [{ asin: d, title: "Livro novo" }],
    });

    const obsA = await db.priceObservation.findFirstOrThrow({
      where: { productId: idA, source: "cart" },
    });
    expect(obsA).toMatchObject({ priceCents: 17900, pixPriceCents: 17005, primeExclusive: false });
    const obsB = await db.priceObservation.findFirstOrThrow({
      where: { productId: idB, source: "cart" },
    });
    expect(obsB).toMatchObject({ priceCents: 3912, listPriceCents: 5900, primeExclusive: true });

    const runs = await db.collectionRun.findMany({
      where: { observations: { some: { productId: { in: [idA, idB] } } }, trigger: "cart" },
    });
    expect(runs).toHaveLength(1);
    expect(runs[0]).toMatchObject({
      status: "PARTIAL",
      okCount: 2,
      unavailableCount: 1,
      errorCount: 1,
    });

    expect(batchSummaryLines(summary)).toEqual([
      "3 preços registrados.",
      "Desde o registro anterior: 1 queda, 1 primeiro registro.",
      "1 item indisponível.",
      "1 item não pôde ser lido; nada foi gravado para eles.",
      "1 item ainda não é monitorado.",
    ]);

    // Reabrir o carrinho em seguida não duplica.
    const again = await recordCaptureBatch(
      db,
      [{ asin: a, title: "A", status: "OK", priceCents: 17900 }],
      { dedupeMinutes: 30, now: new Date(now.getTime() + 60_000) },
    );
    expect(again).toMatchObject({ recorded: 0, duplicates: 1 });

    // Monitorar todos e registrar de novo.
    expect(
      await monitorBatch(db, [
        { asin: d, title: "Livro novo" },
        { asin: a, title: "A" },
      ]),
    ).toEqual({ created: 1, existing: 1 });
    const third = await recordCaptureBatch(
      db,
      [{ asin: d, title: "Livro novo", status: "OK", priceCents: 5000 }],
      {
        dedupeMinutes: 30,
        now: new Date(now.getTime() + 120_000),
      },
    );
    expect(third).toMatchObject({ recorded: 1, firstPrices: 1, notMonitored: [] });
  });
});
