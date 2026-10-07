import { getDb } from "@/lib/db";
import { APP_VERSION } from "@/version";

/** Usado pelo healthcheck do Docker e para conferir a conexão com o banco. */
export async function GET() {
  try {
    await getDb().$queryRaw`SELECT 1`;
    return Response.json({ status: "ok", database: "ok", version: APP_VERSION });
  } catch (error) {
    console.error("healthcheck: falha ao consultar o banco", error);
    return Response.json(
      { status: "error", database: "unreachable", version: APP_VERSION },
      { status: 503 },
    );
  }
}
