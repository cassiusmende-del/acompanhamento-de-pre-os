/*
 * Roda nas páginas da Amazon Brasil. Se a página for de um produto monitorado, lê o preço
 * (extract.js) e envia ao serviço em segundo plano, mostrando um aviso discreto com a opção
 * de desfazer. Não clica, não navega e não faz requisições à Amazon.
 */
(function () {
  "use strict";

  const SETTLE_MS = 1500; // espera o preço dinâmico da página carregar
  let handledKey = null;

  function send(message) {
    return new Promise((resolve) => {
      try {
        chrome.runtime.sendMessage(message, (response) => {
          if (chrome.runtime.lastError) resolve({ ok: false, error: "extension_error" });
          else resolve(response);
        });
      } catch {
        resolve({ ok: false, error: "extension_error" });
      }
    });
  }

  function toPayload(data, force) {
    const unavailable = data.available === false;
    return {
      asin: data.asin,
      pageUrl: location.href.split("#")[0],
      title: data.title,
      status: unavailable ? "UNAVAILABLE" : "OK",
      priceCents: unavailable ? null : data.priceCents,
      listPriceCents: data.listPriceCents,
      shippingCents: data.shippingCents,
      shippingText: data.shippingText,
      couponText: data.couponText,
      couponCents: data.couponCents,
      sellerName: data.sellerName,
      shipsFrom: data.shipsFrom,
      fulfilledByAmazon: data.fulfilledByAmazon,
      condition: data.condition,
      availability: data.availabilityText,
      diagnostics: data.diagnostics,
      force: Boolean(force),
    };
  }

  // ---------- aviso na página (isolado em Shadow DOM) ----------
  let toastHost = null;
  let hideTimer = null;

  function showToast(lines, actions, tone) {
    if (!toastHost) {
      toastHost = document.createElement("div");
      toastHost.style.cssText = "position:fixed;right:16px;bottom:16px;z-index:2147483647;";
      toastHost.attachShadow({ mode: "open" });
      document.documentElement.appendChild(toastHost);
    }
    const root = toastHost.shadowRoot;
    root.innerHTML = "";
    const style = document.createElement("style");
    style.textContent = `
      .box{font:13px/1.4 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;background:#fff;color:#1a1a1a;
        border:1px solid #c8c8c8;border-left:4px solid ${tone === "warn" ? "#b3261e" : "#1a1a1a"};
        border-radius:4px;padding:10px 12px;max-width:340px;box-shadow:0 2px 8px rgba(0,0,0,.15)}
      .title{font-weight:600;margin-bottom:2px}
      p{margin:0}
      .actions{margin-top:8px;display:flex;gap:12px}
      button,a{font:inherit;background:none;border:0;padding:0;color:#1a1a1a;text-decoration:underline;cursor:pointer}
      .close{position:absolute;top:4px;right:8px;text-decoration:none;color:#6b6b6b}
      .wrap{position:relative}`;
    const box = document.createElement("div");
    box.className = "box wrap";
    const title = document.createElement("div");
    title.className = "title";
    title.textContent = "Histórico de preços";
    box.appendChild(title);
    for (const line of lines) {
      const p = document.createElement("p");
      p.textContent = line;
      box.appendChild(p);
    }
    if (actions.length) {
      const bar = document.createElement("div");
      bar.className = "actions";
      for (const action of actions) {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.textContent = action.label;
        btn.addEventListener("click", action.onClick);
        bar.appendChild(btn);
      }
      box.appendChild(bar);
    }
    const close = document.createElement("button");
    close.className = "close";
    close.type = "button";
    close.setAttribute("aria-label", "Fechar");
    close.textContent = "×";
    close.addEventListener("click", hideToast);
    box.appendChild(close);
    box.addEventListener("mouseenter", () => clearTimeout(hideTimer));
    box.addEventListener("mouseleave", () => scheduleHide(4000));
    root.append(style, box);
    scheduleHide(10000);
  }

  function scheduleHide(ms) {
    clearTimeout(hideTimer);
    hideTimer = setTimeout(hideToast, ms);
  }

  function hideToast() {
    if (toastHost) toastHost.shadowRoot.innerHTML = "";
  }

  const ERRORS = {
    offline: "A aplicação local não respondeu. Ela está rodando?",
    unauthorized: "Token inválido. Confira as opções da extensão.",
    no_token: "Configure o token nas opções da extensão.",
  };

  // ---------- carrinho: todos os itens de uma vez ----------
  async function runCart({ force = false, manual = false } = {}) {
    const cart = globalThis.HistoricoPrecosExtract.extractCart(document);
    if (!cart.isCart || cart.items.length === 0) return { ok: false, error: "empty_cart" };

    const key = "cart|" + cart.items.map((i) => `${i.asin}:${i.status}:${i.priceCents}`).join(",");
    if (!manual && handledKey === key) return { ok: true, skipped: true };
    handledKey = key;

    const config = await send({ type: "config" });
    if (!manual && config && config.autoCapture === false) return { ok: true, skipped: true };

    const readable = cart.items.filter((i) => i.status !== "UNREADABLE");
    const payload = {
      kind: "cart",
      pageUrl: location.href.split("#")[0],
      unreadable: cart.items.length - readable.length,
      force: Boolean(force),
      items: readable.map((i) => ({
        asin: i.asin,
        title: i.title,
        section: i.section,
        status: i.status,
        priceCents: i.priceCents,
        pixPriceCents: i.pixPriceCents,
        listPriceCents: i.listPriceCents,
        primeExclusive: i.primeExclusive,
        sellerName: i.sellerName,
        availability: i.availabilityText,
        diagnostics: i.diagnostics,
      })),
    };
    const result = await send({ type: "captureBatch", payload });
    if (!result || !result.ok) {
      showToast(
        [ERRORS[result && result.error] || "Não foi possível registrar os preços do carrinho."],
        [],
        "warn",
      );
      return result;
    }
    const { summary, lines } = result.body;
    // Recarregar o carrinho sem novidades não precisa de aviso.
    if (
      !manual &&
      summary.recorded === 0 &&
      summary.notMonitored.length === 0 &&
      summary.unreadable === 0
    ) {
      return result;
    }
    const actions = [];
    if (summary.notMonitored.length > 0) {
      const n = summary.notMonitored.length;
      actions.push({
        label: n === 1 ? "Monitorar este item" : `Monitorar os ${n}`,
        onClick: async () => {
          const r = await send({
            type: "monitorBatch",
            items: summary.notMonitored.map((x) => ({ asin: x.asin, title: x.title || x.asin })),
          });
          if (r && r.ok) await runCart({ manual: true });
          else showToast(["Não foi possível cadastrar os itens."], [], "warn");
        },
      });
    }
    actions.push({
      label: "Ver registros",
      onClick: () => send({ type: "openApp", path: "/registros" }),
    });
    showToast(
      ["Carrinho: " + lines[0], ...lines.slice(1)],
      actions,
      summary.suspect ? "warn" : undefined,
    );
    return result;
  }

  // ---------- fluxo principal ----------
  async function run({ force = false, manual = false } = {}) {
    if (globalThis.HistoricoPrecosExtract.isCartPage(document)) return runCart({ force, manual });
    const data = globalThis.HistoricoPrecosExtract.extract(document, location.href);
    if (!data.asin || !data.isProductPage) return { ok: false, error: "not_product_page" };

    const key = `${data.asin}|${location.pathname}`;
    if (!manual && handledKey === key) return { ok: true, skipped: true };
    handledKey = key;

    const config = await send({ type: "config" });
    if (!manual && config && config.autoCapture === false) return { ok: true, skipped: true };

    const status = await send({ type: "status", asin: data.asin });
    if (!status || !status.ok) {
      if (manual)
        showToast(
          [ERRORS[status && status.error] || "Não foi possível falar com a aplicação."],
          [],
          "warn",
        );
      return status;
    }
    if (!status.body.monitored) return { ok: true, monitored: false };
    const path = status.body.product.path;
    const openHistory = { label: "Ver histórico", onClick: () => send({ type: "openApp", path }) };

    if (data.available !== false && data.priceCents === null) {
      showToast(
        [
          "Não consegui ler o preço desta página. Nada foi registrado.",
          "Você pode registrar manualmente na aplicação.",
        ],
        [{ label: "Registrar manualmente", onClick: () => send({ type: "openApp", path }) }],
        "warn",
      );
      return { ok: false, error: "price_not_found" };
    }

    const result = await send({ type: "capture", payload: toPayload(data, force) });
    if (!result || !result.ok) {
      showToast(
        [ERRORS[result && result.error] || "Não foi possível registrar o preço."],
        [],
        "warn",
      );
      return result;
    }
    const body = result.body;
    if (body.status === "duplicate") {
      if (manual || force)
        showToast([`Mesmo preço já registrado há ${body.minutesAgo} min.`], [openHistory]);
      return result;
    }
    showToast(body.feedback, [
      {
        label: "Desfazer",
        onClick: async () => {
          const undo = await send({ type: "undo", observationId: body.observationId });
          showToast(
            [undo && undo.ok ? "Registro excluído da análise." : "Não foi possível desfazer."],
            [openHistory],
          );
        },
      },
      openHistory,
    ]);
    return result;
  }

  // Mensagens do popup
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message.type === "extract") {
      sendResponse(globalThis.HistoricoPrecosExtract.extract(document, location.href));
      return false;
    }
    if (message.type === "extractCart") {
      sendResponse(globalThis.HistoricoPrecosExtract.extractCart(document));
      return false;
    }
    if (message.type === "captureNow") {
      run({ force: true, manual: true }).then(sendResponse);
      return true;
    }
    return false;
  });

  setTimeout(() => run(), SETTLE_MS);

  // Troca de variação (cor, capacidade) pode mudar a URL sem recarregar a página.
  let lastHref = location.href;
  setInterval(() => {
    if (location.href !== lastHref) {
      lastHref = location.href;
      setTimeout(() => run(), SETTLE_MS);
    }
  }, 1000);
})();
