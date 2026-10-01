import type { NextRequest } from "next/server";
import { isValidAsin, DEFAULT_MARKETPLACE } from "@/domain/asin";
import { getDb } from "@/lib/db";
import { isAuthorizedExtensionRequest, unauthorized } from "@/lib/extensionAuth";

/** Diz à extensão se o ASIN da página é monitorado. Sem `asin`, serve como teste de conexão. */
export async function GET(request: NextRequest) {
  if (!(await isAuthorizedExtensionRequest(request))) return unauthorized();
  const asin = request.nextUrl.searchParams.get("asin")?.trim().toUpperCase() ?? null;
  if (!asin) return Response.json({ ok: true, app: "historico-precos" });
  if (!isValidAsin(asin)) return Response.json({ error: "invalid_asin" }, { status: 400 });

  const db = getDb();
  const product = await db.product.findFirst({
    where: { asin, marketplace: DEFAULT_MARKETPLACE, active: true },
    select: {
      id: true,
      title: true,
      observations: { orderBy: { observedAt: "desc" }, take: 1, select: { observedAt: true } },
    },
  });
  return Response.json({
    ok: true,
    app: "historico-precos",
    monitored: Boolean(product),
    product: product
      ? {
          id: product.id,
          title: product.title,
          path: `/produtos/${product.id}`,
          lastObservedAt: product.observations[0]?.observedAt ?? null,
        }
      : null,
  });
}
