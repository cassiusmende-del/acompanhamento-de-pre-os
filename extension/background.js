/*
 * Serviço em segundo plano: única parte que fala com a aplicação local.
 * Recebe mensagens do script da página e do popup e repassa para a API com o token.
 * Nunca faz requisições à Amazon.
 */
"use strict";

const DEFAULTS = { appUrl: "http://localhost:3000", token: "", autoCapture: true };

async function getConfig() {
  const stored = await chrome.storage.local.get(DEFAULTS);
  return {
    ...DEFAULTS,
    ...stored,
    appUrl: String(stored.appUrl || DEFAULTS.appUrl).replace(/\/+$/, ""),
  };
}

async function api(path, init = {}) {
  const config = await getConfig();
  if (!config.token) return { ok: false, error: "no_token" };
  let response;
  try {
    response = await fetch(config.appUrl + path, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.token}`,
        ...(init.headers || {}),
      },
    });
  } catch {
    return { ok: false, error: "offline" };
  }
  let body = null;
  try {
    body = await response.json();
  } catch {
    body = null;
  }
  if (response.status === 401) return { ok: false, error: "unauthorized" };
  if (!response.ok)
    return { ok: false, error: (body && body.error) || `http_${response.status}`, body };
  return { ok: true, body };
}

// Último resultado por aba, para o popup mostrar.
const lastResultByTab = new Map();

async function handle(message, sender) {
  const tabId = sender.tab ? sender.tab.id : message.tabId;
  switch (message.type) {
    case "config":
      return getConfig();
    case "test":
      return api("/api/extension/status");
    case "status":
      return api(`/api/extension/status?asin=${encodeURIComponent(message.asin)}`);
    case "capture": {
      const result = await api("/api/extension/captures", {
        method: "POST",
        body: JSON.stringify(message.payload),
      });
      if (tabId !== undefined) lastResultByTab.set(tabId, { at: Date.now(), result });
      return result;
    }
    case "undo":
      return api(`/api/extension/captures/${encodeURIComponent(message.observationId)}/undo`, {
        method: "POST",
      });
    case "monitor":
      return api("/api/extension/products", {
        method: "POST",
        body: JSON.stringify({
          asin: message.asin,
          title: message.title,
          pageUrl: message.pageUrl,
        }),
      });
    case "pending":
      return api(`/api/extension/pending?limit=${message.limit || 10}`);
    case "openPending": {
      const result = await api(`/api/extension/pending?limit=${message.limit || 10}`);
      if (!result.ok) return result;
      // Abre em abas de fundo; cada página é aberta no navegador do usuário, como um clique.
      for (const item of result.body.items) {
        await chrome.tabs.create({ url: item.url, active: false });
      }
      return { ok: true, opened: result.body.items.length, total: result.body.total };
    }
    case "openApp": {
      const config = await getConfig();
      await chrome.tabs.create({ url: config.appUrl + (message.path || "/") });
      return { ok: true };
    }
    case "lastResult":
      return lastResultByTab.get(message.tabId) || null;
    default:
      return { ok: false, error: "unknown_message" };
  }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  handle(message, sender).then(sendResponse, (error) =>
    sendResponse({ ok: false, error: String(error) }),
  );
  return true; // resposta assíncrona
});

chrome.tabs.onRemoved.addListener((tabId) => lastResultByTab.delete(tabId));
