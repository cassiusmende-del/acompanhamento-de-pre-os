import { createHash, timingSafeEqual } from "node:crypto";
import { getDb } from "./db";
import { getOrCreateExtensionToken } from "./settings";

function digest(value: string): Buffer {
  return createHash("sha256").update(value).digest();
}

/**
 * Valida o token enviado pela extensão (`Authorization: Bearer <token>`).
 * Impede que qualquer página aberta no navegador grave dados no servidor local.
 */
export async function isAuthorizedExtensionRequest(request: Request): Promise<boolean> {
  const header = request.headers.get("authorization") ?? "";
  const match = /^Bearer\s+(\S+)$/.exec(header);
  if (!match) return false;
  const expected = await getOrCreateExtensionToken(getDb());
  return timingSafeEqual(digest(match[1]), digest(expected));
}

export function unauthorized(): Response {
  return Response.json(
    { error: "unauthorized", message: "Token da extensão inválido. Confira em Configurações." },
    { status: 401 },
  );
}
