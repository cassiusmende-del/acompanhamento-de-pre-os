import { getDb } from "@/lib/db";

/** Usado pelo healthcheck do Docker e para conferir a conexão com o banco. */
export async function GET() {
  try {
    await getDb().$queryRaw`SELECT 1`;
    return Response.json({ status: "ok", database: "ok" });
  } catch (error) {
    console.error("healthcheck: falha ao consultar o banco", error);
    return Response.json({ status: "error", database: "unreachable" }, { status: 503 });
  }
}
