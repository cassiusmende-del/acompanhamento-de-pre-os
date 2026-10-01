import type { NextRequest } from "next/server";
import { loadCaptureQueue } from "@/capture/queries";
import { getDb } from "@/lib/db";
import { isAuthorizedExtensionRequest, unauthorized } from "@/lib/extensionAuth";

/** Produtos pendentes de captura, para o botão "Abrir pendentes" da extensão. */
export async function GET(request: NextRequest) {
  if (!(await isAuthorizedExtensionRequest(request))) return unauthorized();
  const limit = Math.min(20, Math.max(1, Number(request.nextUrl.searchParams.get("limit")) || 10));
  const queue = await loadCaptureQueue(getDb(), new Date());
  const pending = queue.filter((q) => q.status !== "ok");
  return Response.json({
    total: pending.length,
    items: pending.slice(0, limit).map((q) => ({ title: q.title, asin: q.asin, url: q.url })),
  });
}
