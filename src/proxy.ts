import { NextResponse, type NextRequest } from "next/server";

/**
 * Senha única opcional (HTTP Basic). Ativa somente se APP_PASSWORD estiver definida.
 * A aplicação foi feita para rodar em localhost; isto é uma camada extra, não substitui
 * manter a porta fechada para a rede.
 */
export function proxy(request: NextRequest) {
  const password = process.env.APP_PASSWORD;
  if (!password) return NextResponse.next();

  const header = request.headers.get("authorization") ?? "";
  const [scheme, encoded] = header.split(" ");
  if (scheme === "Basic" && encoded) {
    const decoded = atob(encoded);
    const supplied = decoded.slice(decoded.indexOf(":") + 1);
    if (timingSafeEqual(supplied, password)) return NextResponse.next();
  }

  return new NextResponse("Autenticação necessária.", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="historico-precos", charset="UTF-8"' },
  });
}

function timingSafeEqual(a: string, b: string): boolean {
  let diff = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  }
  return diff === 0;
}

export const config = {
  matcher: ["/((?!api/health|_next/static|_next/image|favicon.ico).*)"],
};
