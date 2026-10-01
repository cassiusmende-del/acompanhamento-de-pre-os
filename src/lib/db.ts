import type { PrismaClient } from "@/generated/prisma/client";
import { createPrismaClient } from "./prisma";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

/**
 * Cliente único por processo, criado no primeiro uso (o build do Next.js importa os
 * módulos sem DATABASE_URL). Reaproveitado entre recarregamentos em desenvolvimento.
 */
export function getDb(): PrismaClient {
  globalForPrisma.prisma ??= createPrismaClient();
  return globalForPrisma.prisma;
}
