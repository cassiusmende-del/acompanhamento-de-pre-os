import { extensionMonitorSchema } from "@/capture/schema";
import { createProduct } from "@/capture/service";
import { getDb } from "@/lib/db";
import { isAuthorizedExtensionRequest, unauthorized } from "@/lib/extensionAuth";

/** "Monitorar este produto" a partir do popup da extensão. */
export async function POST(request: Request) {
  if (!(await isAuthorizedExtensionRequest(request))) return unauthorized();
  const parsed = extensionMonitorSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "invalid" }, { status: 400 });

  const result = await createProduct(getDb(), { asin: parsed.data.asin, title: parsed.data.title });
  return Response.json(
    { status: result.ok ? "created" : "exists", path: `/produtos/${result.productId}` },
    { status: result.ok ? 201 : 200 },
  );
}
