import { batchSummaryLines, recordCaptureBatch } from "@/capture/batch";
import { extensionBatchSchema } from "@/capture/schema";
import { getDb } from "@/lib/db";
import { isAuthorizedExtensionRequest, unauthorized } from "@/lib/extensionAuth";
import { getCaptureDedupeMinutes } from "@/lib/settings";

/** Recebe todos os itens lidos no carrinho que o usuário abriu. */
export async function POST(request: Request) {
  if (!(await isAuthorizedExtensionRequest(request))) return unauthorized();
  const parsed = extensionBatchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json(
      {
        error: "invalid",
        issues: parsed.error.issues.slice(0, 10).map((i) => `${i.path.join(".")}: ${i.message}`),
      },
      { status: 400 },
    );
  }
  const db = getDb();
  const summary = await recordCaptureBatch(db, parsed.data.items, {
    dedupeMinutes: await getCaptureDedupeMinutes(db),
    force: parsed.data.force,
    unreadable: parsed.data.unreadable,
    pageUrl: parsed.data.pageUrl,
  });
  return Response.json({
    status: "ok",
    summary,
    lines: batchSummaryLines(summary),
    path: "/registros",
  });
}
