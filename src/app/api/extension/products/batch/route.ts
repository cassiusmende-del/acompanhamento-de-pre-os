import { monitorBatch } from "@/capture/batch";
import { extensionMonitorBatchSchema } from "@/capture/schema";
import { getDb } from "@/lib/db";
import { isAuthorizedExtensionRequest, unauthorized } from "@/lib/extensionAuth";

/** "Monitorar todos" os itens do carrinho que ainda não são monitorados. */
export async function POST(request: Request) {
  if (!(await isAuthorizedExtensionRequest(request))) return unauthorized();
  const parsed = extensionMonitorBatchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "invalid" }, { status: 400 });
  const result = await monitorBatch(getDb(), parsed.data.items);
  return Response.json({ status: "ok", ...result });
}
