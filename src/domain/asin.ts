/**
 * Identificação de ASIN a partir de um ASIN colado ou de uma URL da Amazon.
 * Nenhuma requisição de rede é feita aqui.
 */

const ASIN_PATTERN = /^[A-Z0-9]{10}$/;

const URL_PATTERNS: RegExp[] = [
  /\/dp\/([A-Z0-9]{10})(?=[/?#]|$)/i,
  /\/gp\/product\/([A-Z0-9]{10})(?=[/?#]|$)/i,
  /\/gp\/aw\/d\/([A-Z0-9]{10})(?=[/?#]|$)/i,
  /\/gp\/offer-listing\/([A-Z0-9]{10})(?=[/?#]|$)/i,
  /\/exec\/obidos\/(?:tg\/detail\/-\/|ASIN\/)([A-Z0-9]{10})(?=[/?#]|$)/i,
  /\/product\/([A-Z0-9]{10})(?=[/?#]|$)/i,
  /\/o\/ASIN\/([A-Z0-9]{10})(?=[/?#]|$)/i,
];

const SHORT_LINK_HOSTS = new Set(["amzn.to", "a.co", "amzn.eu"]);

export const DEFAULT_MARKETPLACE = "amazon.com.br";

export type AsinParseResult =
  | { ok: true; asin: string; marketplace: string | null; otherMarketplace: boolean }
  | { ok: false; reason: "EMPTY" | "SHORT_LINK" | "NOT_AMAZON" | "NOT_FOUND" };

export function isValidAsin(value: string): boolean {
  return ASIN_PATTERN.test(value);
}

function marketplaceFromHost(host: string): string | null {
  const match = /(?:^|\.)(amazon\.[a-z.]+)$/i.exec(host);
  return match ? match[1].toLowerCase() : null;
}

export function parseAsin(rawInput: string): AsinParseResult {
  const input = rawInput.trim();
  if (!input) return { ok: false, reason: "EMPTY" };

  const upper = input.toUpperCase();
  if (isValidAsin(upper)) {
    return { ok: true, asin: upper, marketplace: null, otherMarketplace: false };
  }

  // Sem ponto não pode ser URL: é um ASIN malformado ou texto qualquer.
  if (!input.includes(".")) return { ok: false, reason: "NOT_FOUND" };

  let url: URL;
  try {
    url = new URL(/^https?:\/\//i.test(input) ? input : `https://${input}`);
  } catch {
    return { ok: false, reason: "NOT_FOUND" };
  }

  const host = url.hostname.toLowerCase();
  if (SHORT_LINK_HOSTS.has(host)) return { ok: false, reason: "SHORT_LINK" };

  const marketplace = marketplaceFromHost(host);
  if (!marketplace) return { ok: false, reason: "NOT_AMAZON" };

  for (const pattern of URL_PATTERNS) {
    const match = pattern.exec(url.pathname);
    if (match) {
      return {
        ok: true,
        asin: match[1].toUpperCase(),
        marketplace,
        otherMarketplace: marketplace !== DEFAULT_MARKETPLACE,
      };
    }
  }

  const queryAsin = url.searchParams.get("asin")?.toUpperCase();
  if (queryAsin && isValidAsin(queryAsin)) {
    return {
      ok: true,
      asin: queryAsin,
      marketplace,
      otherMarketplace: marketplace !== DEFAULT_MARKETPLACE,
    };
  }

  return { ok: false, reason: "NOT_FOUND" };
}

/** URL canônica da página do produto. */
export function productUrl(asin: string, marketplace = DEFAULT_MARKETPLACE): string {
  return `https://www.${marketplace}/dp/${asin}`;
}
