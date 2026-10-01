/**
 * Recalcula eventos de mudança e retratos de todos os produtos a partir das observações.
 * Seguro de rodar a qualquer momento: não altera observações nem correções.
 *
 * Uso: npm run db:reprocess
 */
import "dotenv/config";
import { createPrismaClient } from "@/lib/prisma";
import { processAllProducts } from "@/processing/process";

async function main() {
  const db = createPrismaClient();
  try {
    const count = await processAllProducts(db);
    console.log(`${count} produto(s) reprocessado(s).`);
  } finally {
    await db.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
