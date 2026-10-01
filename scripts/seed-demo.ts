/**
 * Gera produtos e histórico SIMULADOS para desenvolver e testar as telas.
 *
 * Como o histórico é imutável, os dados gerados não podem ser apagados depois. Por isso o
 * script só roda em bancos cujo nome termina em "_dev" ou "_test", a menos que receba
 * --permitir-qualquer-banco.
 *
 * Uso: DATABASE_URL=postgresql://.../precos_dev npm run db:seed-demo
 */
import "dotenv/config";
import { createProduct } from "@/capture/service";
import { createPrismaClient } from "@/lib/prisma";
import { MockPriceProvider } from "@/providers/mock";

const DEMO = [
  { asin: "DEMO000001", title: "[Simulado] SSD NVMe 2TB" },
  { asin: "DEMO000002", title: "[Simulado] Fone de ouvido sem fio" },
  { asin: "DEMO000003", title: "[Simulado] Cafeteira elétrica" },
];
const DAYS = 180;
const STEP_HOURS = 12;

function databaseName(url: string): string {
  return new URL(url).pathname.replace(/^\//, "");
}

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL não definida.");
  const name = databaseName(url);
  if (!/_(dev|test)$/.test(name) && !process.argv.includes("--permitir-qualquer-banco")) {
    console.error(
      `Recusado: o banco "${name}" não termina em _dev ou _test.\n` +
        "Dados simulados não podem ser removidos de um histórico imutável. Use um banco de desenvolvimento.",
    );
    process.exit(1);
  }

  const db = createPrismaClient(url);
  const now = new Date();
  try {
    for (const demo of DEMO) {
      const created = await createProduct(db, {
        asin: demo.asin,
        title: demo.title,
        notes: "Dados simulados gerados por scripts/seed-demo.ts.",
        targetIntervalHours: 24,
      });
      if (!created.ok) {
        console.log(`${demo.asin}: já existe, ignorado.`);
        continue;
      }

      let clock = new Date(now.getTime() - DAYS * 24 * 3600_000);
      const provider = new MockPriceProvider(() => clock);
      const run = await db.collectionRun.create({
        data: { provider: "mock", trigger: "seed", status: "RUNNING" },
      });
      const rows = [];
      let skipUntil = 0;
      for (let t = clock.getTime(); t <= now.getTime(); t += STEP_HOURS * 3600_000) {
        // Lacunas ocasionais de alguns dias, como aconteceria com captura manual.
        if (t < skipUntil) continue;
        if ((t / 3600_000) % 997 < STEP_HOURS) {
          skipUntil = t + 5 * 24 * 3600_000;
          continue;
        }
        clock = new Date(t);
        const result = await provider.getPrice({ asin: demo.asin, marketplace: "amazon.com.br" });
        if (result.status === "OK") {
          rows.push({
            productId: created.productId,
            asin: demo.asin,
            observedAt: result.offer.observedAt,
            status: "OK" as const,
            priceCents: result.offer.priceCents,
            listPriceCents: result.offer.listPriceCents ?? null,
            sellerName: result.offer.sellerName ?? null,
            condition: result.offer.condition,
            availability: result.offer.availability,
            source: "mock",
            collectionRunId: run.id,
          });
        } else if (result.status === "UNAVAILABLE") {
          rows.push({
            productId: created.productId,
            asin: demo.asin,
            observedAt: result.observedAt,
            status: "UNAVAILABLE" as const,
            priceCents: null,
            source: "mock",
            collectionRunId: run.id,
          });
        }
      }
      await db.priceObservation.createMany({ data: rows });
      const ok = rows.filter((r) => r.status === "OK").length;
      await db.collectionRun.update({
        where: { id: run.id },
        data: {
          status: "SUCCEEDED",
          finishedAt: new Date(),
          okCount: ok,
          unavailableCount: rows.length - ok,
        },
      });
      console.log(`${demo.asin}: ${rows.length} observações simuladas.`);
    }
  } finally {
    await db.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
