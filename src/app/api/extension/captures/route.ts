import { DEFAULT_MARKETPLACE } from "@/domain/asin";
import { extensionCaptureSchema } from "@/capture/schema";
import { recordObservation } from "@/capture/service";
import { getDb } from "@/lib/db";
import { isAuthorizedExtensionRequest, unauthorized } from "@/lib/extensionAuth";
import { getCaptureDedupeMinutes } from "@/lib/settings";

/** Recebe o preço lido pela extensão na página que o usuário abriu. */
export async function POST(request: Request) {
  if (!(await isAuthorizedExtensionRequest(request))) return unauthorized();

  const body = await request.json().catch(() => null);
  const parsed = extensionCaptureSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      {
        error: "invalid",
        issues: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`),
      },
      { status: 400 },
    );
  }
  const capture = parsed.data;
  const db = getDb();
  const product = await db.product.findFirst({
    where: { asin: capture.asin, marketplace: DEFAULT_MARKETPLACE, active: true },
    select: { id: true },
  });
  if (!product) return Response.json({ error: "not_monitored" }, { status: 404 });

  const now = new Date();
  const result = await recordObservation(
    db,
    {
      productId: product.id,
      observedAt: now,
      status: capture.status,
      priceCents: capture.priceCents,
      listPriceCents: capture.listPriceCents,
      shippingCents: capture.shippingCents,
      couponText: capture.couponText,
      couponCents: capture.couponCents,
      sellerName: capture.sellerName,
      fulfilledByAmazon: capture.fulfilledByAmazon,
      condition: capture.condition,
      availability: capture.availability,
      source: "extension",
      pageTitle: capture.title,
      rawPayload: {
        pageUrl: capture.pageUrl ?? null,
        shippingText: capture.shippingText ?? null,
        shipsFrom: capture.shipsFrom ?? null,
        diagnostics: capture.diagnostics ?? null,
      },
    },
    { dedupeMinutes: await getCaptureDedupeMinutes(db), force: capture.force, now },
  );

  const path = `/produtos/${product.id}`;
  switch (result.status) {
    case "recorded":
      return Response.json({
        status: "recorded",
        observationId: result.observationId,
        feedback: result.feedback,
        path,
      });
    case "duplicate":
      return Response.json({
        status: "duplicate",
        observationId: result.observationId,
        minutesAgo: result.minutesAgo,
        path,
      });
    case "product_not_found":
      return Response.json({ error: "not_monitored" }, { status: 404 });
  }
}
