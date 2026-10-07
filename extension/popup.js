"use strict";

const $ = (id) => document.getElementById(id);
const send = (message) => chrome.runtime.sendMessage(message);

function money(cents) {
  if (cents === null || cents === undefined) return "—";
  const reais = Math.floor(cents / 100)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `R$ ${reais},${String(cents % 100).padStart(2, "0")}`;
}

const ERRORS = {
  offline: "A aplicação local não respondeu. Ela está rodando?",
  unauthorized: "Token inválido. Abra as opções e cole o token de Configurações.",
  no_token: "Configure o endereço e o token nas opções.",
};

function addButton(label, onClick) {
  const b = document.createElement("button");
  b.type = "button";
  b.textContent = label;
  b.addEventListener("click", async () => {
    b.disabled = true;
    await onClick();
    b.disabled = false;
  });
  $("actions").appendChild(b);
}

function describe(data, monitored) {
  const container = $("page");
  container.innerHTML = "";
  const title = document.createElement("p");
  title.textContent = data.title || data.asin;
  title.style.fontWeight = "600";
  const dl = document.createElement("dl");
  const rows = [
    ["ASIN", data.asin],
    ["Situação", monitored ? "monitorado" : "não monitorado"],
    ["Preço lido", data.available === false ? "indisponível" : money(data.priceCents)],
    ["Preço “de”", money(data.listPriceCents)],
    [
      "Frete",
      data.shippingCents === 0 ? "grátis" : data.shippingCents ? money(data.shippingCents) : "—",
    ],
    ["Cupom", data.couponText || "—"],
    ["Vendedor", data.sellerName || "—"],
    ["Disponibilidade", data.availabilityText || "—"],
  ];
  for (const [k, v] of rows) {
    const dt = document.createElement("dt");
    dt.textContent = k;
    const dd = document.createElement("dd");
    dd.textContent = v;
    dl.append(dt, dd);
  }
  container.append(title, dl);
  if (data.available !== false && data.priceCents === null) {
    const warn = document.createElement("p");
    warn.className = "warn";
    warn.textContent = "Preço não encontrado nesta página. Registre manualmente na aplicação.";
    container.appendChild(warn);
  }
}

function describeCart(cart) {
  const container = $("page");
  container.innerHTML = "";
  const title = document.createElement("p");
  title.textContent = "Carrinho";
  title.style.fontWeight = "600";
  const count = (f) => cart.items.filter(f).length;
  const dl = document.createElement("dl");
  const rows = [
    ["Itens lidos", String(cart.items.length)],
    ["No carrinho", String(count((i) => i.section === "active"))],
    ["Salvos para depois", String(count((i) => i.section === "saved"))],
    ["Indisponíveis", String(count((i) => i.status === "UNAVAILABLE"))],
    ["Com preço no Pix", String(count((i) => i.pixPriceCents))],
    ["Sem leitura segura", String(count((i) => i.status === "UNREADABLE"))],
  ];
  for (const [k, v] of rows) {
    const dt = document.createElement("dt");
    dt.textContent = k;
    const dd = document.createElement("dd");
    dd.textContent = v;
    dl.append(dt, dd);
  }
  const note = document.createElement("p");
  note.className = "muted";
  note.textContent =
    "O preço registrado é o preço normal; o preço à vista no Pix fica guardado à parte. Só produtos monitorados são registrados.";
  container.append(title, dl, note);
}

async function init() {
  const test = await send({ type: "test" });
  $("connection").textContent =
    test && test.ok ? "Conectado à aplicação local." : ERRORS[test && test.error] || "Sem conexão.";
  $("connection").className = test && test.ok ? "muted" : "warn";

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  let data = null;
  if (tab && tab.url && tab.url.startsWith("https://www.amazon.com.br/")) {
    try {
      data = await chrome.tabs.sendMessage(tab.id, { type: "extract" });
    } catch {
      data = null;
    }
  }
  let cart = null;
  if (tab && tab.url && tab.url.startsWith("https://www.amazon.com.br/")) {
    try {
      cart = await chrome.tabs.sendMessage(tab.id, { type: "extractCart" });
    } catch {
      cart = null;
    }
  }
  if (cart && cart.isCart && cart.items.length > 0) {
    describeCart(cart);
    if (test && test.ok) {
      addButton("Registrar agora", async () => {
        const r = await chrome.tabs.sendMessage(tab.id, { type: "captureNow" });
        $("message").textContent =
          r && r.ok ? "Enviado. Veja o resumo na página." : "Não foi possível registrar.";
      });
    }
  } else if (!data || !data.asin || !data.isProductPage) {
    $("page").innerHTML =
      '<p class="muted">Abra a página de um produto na Amazon Brasil para registrar o preço.</p>';
  } else if (test && test.ok) {
    const status = await send({ type: "status", asin: data.asin });
    const monitored = Boolean(status && status.ok && status.body.monitored);
    describe(data, monitored);
    if (monitored) {
      addButton("Registrar agora", async () => {
        const r = await chrome.tabs.sendMessage(tab.id, { type: "captureNow" });
        $("message").textContent =
          r && r.ok ? "Enviado. Veja o aviso na página." : "Não foi possível registrar.";
      });
      addButton("Ver histórico", () => send({ type: "openApp", path: status.body.product.path }));
    } else {
      addButton("Monitorar este produto", async () => {
        const r = await send({
          type: "monitor",
          asin: data.asin,
          title: data.title || data.asin,
          pageUrl: tab.url,
        });
        if (r && r.ok) {
          $("message").textContent = "Produto cadastrado. Registrando o preço…";
          await chrome.tabs.sendMessage(tab.id, { type: "captureNow" });
          window.close();
        } else {
          $("message").textContent = "Não foi possível cadastrar.";
        }
      });
    }
  } else {
    describe(data, false);
  }

  if (test && test.ok) {
    const pending = await send({ type: "pending", limit: 10 });
    if (pending && pending.ok)
      $("openPending").textContent = `Abrir pendentes (${pending.body.total})`;
  }
}

$("openPending").addEventListener("click", async () => {
  const r = await send({ type: "openPending", limit: 10 });
  $("message").textContent =
    r && r.ok
      ? r.opened === 0
        ? "Nenhum produto pendente."
        : `${r.opened} ${r.opened === 1 ? "aba aberta" : "abas abertas"}${r.total > r.opened ? ` (de ${r.total} pendentes)` : ""}.`
      : ERRORS[r && r.error] || "Não foi possível obter a lista.";
});
$("openApp").addEventListener("click", () => send({ type: "openApp", path: "/" }));
$("options").addEventListener("click", () => chrome.runtime.openOptionsPage());

init();
