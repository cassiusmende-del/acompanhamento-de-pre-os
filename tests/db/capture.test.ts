import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  createProduct,
  excludeObservation,
  loadProductAnalytics,
  placeholderTitle,
  recordObservation,
} from "@/capture/service";
import { getOrCreateExtensionToken, regenerateExtensionToken } from "@/lib/settings";
import { createPrismaClient } from "@/lib/prisma";
import type { PrismaClient } from "@/generated/prisma/client";

const url = process.env.TEST_DATABASE_URL;

function randomAsin(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  return (
    "B" + Array.from({ length: 9 }, () => chars[Math.floor(Math.random() * chars.length)]).join("")
  );
}

describe.skipIf(!url)("serviço de captura", () => {
  let db: PrismaClient;

  beforeAll(() => {
    db = createPrismaClient(url);
  });
  afterAll(async () => {
    await db?.$disconnect();
  });

  it("cria produto com título provisório e recusa duplicado", async () => {
    const asin = randomAsin();
    const first = await createProduct(db, { asin });
    expect(first.ok).toBe(true);
    const product = await db.product.findUniqueOrThrow({
      where: { id: (first as { productId: string }).productId },
    });
    expect(product.title).toBe(placeholderTitle(asin));
    expect(product.url).toBe(`https://www.amazon.com.br/dp/${asin}`);
    expect(await createProduct(db, { asin, title: "Outro" })).toEqual({
      ok: false,
      reason: "DUPLICATE",
      productId: product.id,
    });
  });

  it("grava, ignora repetição recente, grava mudança e substitui título provisório", async () => {
    const asin = randomAsin();
    const created = await createProduct(db, { asin });
    const productId = (created as { productId: string }).productId;
    const t0 = new Date("2026-09-12T15:00:00Z");
    const minutes = (m: number) => new Date(t0.getTime() + m * 60_000);
    const base = { productId, status: "OK" as const, source: "extension" as const };

    const r1 = await recordObservation(
      db,
      {
        ...base,
        observedAt: t0,
        priceCents: 69990,
        shippingCents: 0,
        pageTitle: "SSD 990 Pro 2TB",
      },
      { dedupeMinutes: 30, now: t0 },
    );
    expect(r1.status).toBe("recorded");
    if (r1.status === "recorded")
      expect(r1.feedback).toEqual(["R$ 699,90 registrado.", "Primeiro preço deste produto."]);

    const dup = await recordObservation(
      db,
      { ...base, observedAt: minutes(10), priceCents: 69990 },
      { dedupeMinutes: 30, now: minutes(10) },
    );
    expect(dup).toMatchObject({ status: "duplicate", minutesAgo: 10 });

    const forced = await recordObservation(
      db,
      { ...base, observedAt: minutes(11), priceCents: 69990 },
      { dedupeMinutes: 30, force: true, now: minutes(11) },
    );
    expect(forced.status).toBe("recorded");

    const changed = await recordObservation(
      db,
      { ...base, observedAt: minutes(15), priceCents: 64990 },
      { dedupeMinutes: 30, now: minutes(15) },
    );
    expect(changed.status).toBe("recorded");
    if (changed.status === "recorded")
      expect(changed.feedback[1]).toBe("Caiu 7,1% desde a observação anterior (R$ 699,90).");

    // origem diferente não é afetada pela regra de duplicidade
    const manual = await recordObservation(
      db,
      { ...base, source: "manual", observedAt: minutes(16), priceCents: 64990 },
      { dedupeMinutes: 30, now: minutes(16) },
    );
    expect(manual.status).toBe("recorded");

    const product = await db.product.findUniqueOrThrow({ where: { id: productId } });
    expect(product.title).toBe("SSD 990 Pro 2TB");

    const first = await db.priceObservation.findFirstOrThrow({
      where: { productId },
      orderBy: { observedAt: "asc" },
    });
    expect(first.totalCents).toBe(69990);
    expect(await db.collectionRun.count({ where: { observations: { some: { productId } } } })).toBe(
      4,
    );
  });

  it("indisponível sem preço e exclusão por correção", async () => {
    const asin = randomAsin();
    const productId = (
      (await createProduct(db, { asin, title: "Produto X" })) as { productId: string }
    ).productId;
    const at = new Date("2026-09-12T15:00:00Z");
    const ok = await recordObservation(
      db,
      { productId, status: "OK", priceCents: 10000, observedAt: at, source: "manual" },
      { dedupeMinutes: 0, now: at },
    );
    const out = await recordObservation(
      db,
      {
        productId,
        status: "UNAVAILABLE",
        priceCents: 12345,
        observedAt: new Date(at.getTime() + 60_000),
        source: "manual",
      },
      { dedupeMinutes: 0, now: at },
    );
    expect(out.status).toBe("recorded");
    const stored = await db.priceObservation.findFirstOrThrow({
      where: { productId, status: "UNAVAILABLE" },
    });
    expect(stored.priceCents).toBeNull();

    if (ok.status !== "recorded") throw new Error("esperava gravação");
    expect(await excludeObservation(db, ok.observationId, "teste")).toBe("excluded");
    const analytics = await loadProductAnalytics(db, productId, new Date(at.getTime() + 120_000));
    expect(analytics.counts).toMatchObject({ total: 2, priced: 0, excluded: 1 });
    expect(await excludeObservation(db, "inexistente", "x")).toBe("not_found");
  });

  it("token da extensão é estável até ser regenerado", async () => {
    const a = await getOrCreateExtensionToken(db);
    expect(await getOrCreateExtensionToken(db)).toBe(a);
    const b = await regenerateExtensionToken(db);
    expect(b).not.toBe(a);
    expect(await getOrCreateExtensionToken(db)).toBe(b);
  });
});
