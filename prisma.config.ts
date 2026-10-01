import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    // `prisma generate` não precisa de conexão; migrate/db exigem DATABASE_URL.
    url: process.env.DATABASE_URL ?? "",
  },
});
