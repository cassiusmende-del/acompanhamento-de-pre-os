/**
 * Testes de integração das regras do banco (triggers e constraints).
 * Rodam apenas com TEST_DATABASE_URL definida, apontando para um banco com as migrations
 * aplicadas: `npm run test:db`.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPrismaClient } from "@/lib/prisma";
import type { PrismaClient } from "@/generated/prisma/client";

const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)("histórico append-only no PostgreSQL", () => {
  let db: PrismaClient;
  let productId: string;

  beforeAll(async () => {
    db = createPrismaClient(url);
    const product = await db.product.create({
      data: {
        asin: `T${Date.now().toString(36).toUpperCase()}`.slice(0, 10).padEnd(10, "0"),
        title: "Produto de teste",
        url: "https://www.amazon.com.br/dp/TEST000000",
      },
    });
    productId = product.id;
  });

  afterAll(async () => {
    await db?.$disconnect();
  });

  const base = () => ({
    productId,
    asin: "TEST000000",
    observedAt: new Date(),
    source: "test",
  });

  it("grava observação com preço e observação indisponível sem preço", async () => {
    await expect(
      db.priceObservation.create({ data: { ...base(), status: "OK", priceCents: 64990 } }),
    ).resolves.toBeTruthy();
    await expect(
      db.priceObservation.create({ data: { ...base(), status: "UNAVAILABLE" } }),
    ).resolves.toBeTruthy();
  });

  it("rejeita preço zero, preço ausente com status OK e preço em observação indisponível", async () => {
    await expect(
      db.priceObservation.create({ data: { ...base(), status: "OK", priceCents: 0 } }),
    ).rejects.toThrow();
    await expect(
      db.priceObservation.create({ data: { ...base(), status: "OK" } }),
    ).rejects.toThrow();
    await expect(
      db.priceObservation.create({ data: { ...base(), status: "UNAVAILABLE", priceCents: 64990 } }),
    ).rejects.toThrow();
  });

  it("impede alterar ou apagar observações", async () => {
    const o = await db.priceObservation.create({
      data: { ...base(), status: "OK", priceCents: 69990 },
    });
    await expect(
      db.priceObservation.update({ where: { id: o.id }, data: { priceCents: 1 } }),
    ).rejects.toThrow(/imutável/);
    await expect(db.priceObservation.delete({ where: { id: o.id } })).rejects.toThrow(/imutável/);
    await expect(db.$executeRawUnsafe(`TRUNCATE price_observations CASCADE`)).rejects.toThrow(
      /imutável/,
    );
    const still = await db.priceObservation.findUnique({ where: { id: o.id } });
    expect(still?.priceCents).toBe(69990);
  });

  it("correções são registros novos e também imutáveis", async () => {
    const o = await db.priceObservation.create({
      data: { ...base(), status: "OK", priceCents: 6999 },
    });
    const c = await db.observationCorrection.create({
      data: {
        observationId: o.id,
        action: "REPLACE_PRICE",
        newPriceCents: 69990,
        reason: "leitura errada",
      },
    });
    await expect(
      db.observationCorrection.update({ where: { id: c.id }, data: { reason: "outro" } }),
    ).rejects.toThrow(/imutável/);
    await expect(
      db.observationCorrection.create({
        data: { observationId: o.id, action: "REPLACE_PRICE", reason: "sem valor" },
      }),
    ).rejects.toThrow();
    await expect(
      db.observationCorrection.create({
        data: { observationId: o.id, action: "EXCLUDE", reason: "  " },
      }),
    ).rejects.toThrow();
  });
});
