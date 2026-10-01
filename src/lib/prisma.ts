import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";

/** Cria um cliente Prisma. A aplicação usa `db` (src/lib/db.ts); scripts e testes usam esta função. */
export function createPrismaClient(connectionString = process.env.DATABASE_URL): PrismaClient {
  if (!connectionString) throw new Error("DATABASE_URL não definida.");
  return new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
}
