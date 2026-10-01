import { excludeObservation } from "@/capture/service";
import { getDb } from "@/lib/db";
import { isAuthorizedExtensionRequest, unauthorized } from "@/lib/extensionAuth";

/** "Desfazer" do aviso da extensão: exclui a observação da análise sem apagá-la. */
export async function POST(
  request: Request,
  ctx: RouteContext<"/api/extension/captures/[id]/undo">,
) {
  if (!(await isAuthorizedExtensionRequest(request))) return unauthorized();
  const { id } = await ctx.params;
  const db = getDb();
  const observation = await db.priceObservation.findUnique({
    where: { id },
    select: { source: true },
  });
  if (!observation || observation.source !== "extension") {
    return Response.json({ error: "not_found" }, { status: 404 });
  }
  const result = await excludeObservation(
    db,
    id,
    "Desfeito pelo aviso da extensão logo após a captura",
  );
  return Response.json({ status: result });
}
