"use strict";

const $ = (id) => document.getElementById(id);
const DEFAULTS = { appUrl: "http://localhost:3000", token: "", autoCapture: true };

function isLocal(url) {
  try {
    const u = new URL(url);
    return u.protocol === "http:" && (u.hostname === "localhost" || u.hostname === "127.0.0.1");
  } catch {
    return false;
  }
}

async function load() {
  const config = await chrome.storage.local.get(DEFAULTS);
  $("appUrl").value = config.appUrl;
  $("token").value = config.token;
  $("autoCapture").checked = config.autoCapture !== false;
}

$("form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const appUrl = $("appUrl").value.trim().replace(/\/+$/, "");
  if (!isLocal(appUrl)) {
    $("message").textContent = "Use um endereço local, como http://localhost:3000.";
    return;
  }
  await chrome.storage.local.set({
    appUrl,
    token: $("token").value.trim(),
    autoCapture: $("autoCapture").checked,
  });
  $("message").textContent = "Salvo.";
});

$("test").addEventListener("click", async () => {
  $("message").textContent = "Testando…";
  const r = await chrome.runtime.sendMessage({ type: "test" });
  $("message").textContent =
    r && r.ok
      ? "Conexão funcionando."
      : r && r.error === "unauthorized"
        ? "A aplicação respondeu, mas o token não confere."
        : r && r.error === "no_token"
          ? "Salve o token antes de testar."
          : "A aplicação não respondeu. Confira o endereço e se ela está rodando.";
});

load();
