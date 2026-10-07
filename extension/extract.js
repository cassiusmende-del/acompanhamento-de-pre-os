/*
 * Leitura dos dados da página de produto da Amazon Brasil que o usuário abriu.
 * Função pura sobre o DOM já carregado: não faz requisições nem interage com a página.
 *
 * A Amazon muda o HTML com frequência; por isso cada campo tem vários seletores, em ordem
 * de preferência, e o resultado informa qual seletor foi usado (diagnóstico). Quando o
 * preço não é encontrado, nada é inventado: o campo fica null.
 */
(function (root) {
  "use strict";

  var VERSION = "0.2.0";
  var ASIN_RE = /^[A-Z0-9]{10}$/;
  var URL_ASIN_RE = /\/(?:dp|gp\/product|gp\/aw\/d|gp\/offer-listing)\/([A-Z0-9]{10})(?=[/?#]|$)/i;

  /** Preço do bloco principal (Buy Box), em ordem de preferência. */
  var PRICE_SELECTORS = [
    "#corePriceDisplay_desktop_feature_div .priceToPay",
    "#corePrice_feature_div .priceToPay",
    "#corePriceDisplay_mobile_feature_div .priceToPay",
    "#apex_desktop .priceToPay",
    "#apex_offerDisplay_desktop .priceToPay",
    "#corePrice_feature_div .a-price:not(.a-text-price)",
    "#corePrice_desktop .a-price:not(.a-text-price)",
    "#tp_price_block_total_price_ww",
    "#price_inside_buybox",
    "#newBuyBoxPrice",
    "#priceblock_dealprice",
    "#priceblock_ourprice",
    "#priceblock_saleprice",
    "#kindle-price",
  ];

  /** Preço "de" (riscado / preço de referência). */
  var LIST_PRICE_SELECTORS = [
    "#corePriceDisplay_desktop_feature_div .basisPrice .a-price",
    "#corePriceDisplay_desktop_feature_div .a-price.a-text-price[data-a-strike='true']",
    "#corePrice_feature_div .a-price.a-text-price[data-a-strike='true']",
    "#corePrice_desktop .a-price.a-text-price[data-a-strike='true']",
    "#apex_desktop .basisPrice .a-price",
    "#listPrice",
    "#priceblock_listprice",
  ];

  var SELLER_SELECTORS = [
    "#merchantInfoFeature_feature_div .offer-display-feature-text-message",
    "#sellerProfileTriggerId",
  ];

  var SHIPS_FROM_SELECTORS = [
    "#fulfillerInfoFeature_feature_div .offer-display-feature-text-message",
  ];

  var DELIVERY_SELECTORS = [
    "#mir-layout-DELIVERY_BLOCK",
    "#deliveryBlockMessage",
    "#delivery-block-ags-dcp-container",
    "#ddmDeliveryMessage",
  ];

  var COUPON_SELECTORS = [
    "#promoPriceBlockMessage_feature_div",
    "#couponBadgeRegularVpc",
    "[id^='couponText']",
    ".couponLabelText",
    "#vpcButton",
  ];

  var UNAVAILABLE_RE =
    /(indispon[ií]vel|n[aã]o (est[aá] )?(mais )?dispon[ií]vel|esgotad|fora de estoque)/i;

  function clean(text) {
    return (text || "").replace(/\s+/g, " ").trim();
  }

  function textOf(el) {
    return el ? clean(el.textContent) : "";
  }

  /**
   * Converte texto em centavos. Aceita "R$ 1.234,56", "R$1.234", "649,90".
   * Retorna null se não houver um valor claro.
   */
  function parsePrice(text) {
    var t = (text || "").replace(/ /g, " ");
    var m = /R\$\s*(\d{1,3}(?:\.\d{3})+|\d+)(?:,(\d{1,2}))?(?!\d)/.exec(t);
    if (!m) m = /^\s*(\d{1,3}(?:\.\d{3})+|\d+),(\d{2})\s*$/.exec(t);
    if (!m) return null;
    var reais = Number(m[1].replace(/\./g, ""));
    var cents = Number((m[2] || "").padEnd(2, "0"));
    var value = reais * 100 + cents;
    return Number.isSafeInteger(value) && value > 0 ? value : null;
  }

  /** Preço de um elemento .a-price (ou de um bloco que contenha um). */
  function priceFromElement(el) {
    var offscreen = el.querySelector(".a-offscreen, .aok-offscreen");
    var fromOffscreen = offscreen ? parsePrice(offscreen.textContent) : null;
    if (fromOffscreen) return fromOffscreen;

    var whole = el.querySelector(".a-price-whole");
    if (whole) {
      var digits = (whole.textContent || "").replace(/\D/g, "");
      var fraction = el.querySelector(".a-price-fraction");
      var frac = fraction ? (fraction.textContent || "").replace(/\D/g, "").slice(0, 2) : "";
      if (digits) {
        var value = Number(digits) * 100 + Number(frac.padEnd(2, "0"));
        if (value > 0) return value;
      }
    }
    return parsePrice(el.textContent);
  }

  function firstPrice(doc, selectors) {
    for (var i = 0; i < selectors.length; i++) {
      var el = doc.querySelector(selectors[i]);
      if (!el) continue;
      var cents = priceFromElement(el);
      if (cents) return { cents: cents, source: selectors[i] };
    }
    return null;
  }

  function firstText(doc, selectors) {
    for (var i = 0; i < selectors.length; i++) {
      var t = textOf(doc.querySelector(selectors[i]));
      if (t) return { text: t, source: selectors[i] };
    }
    return null;
  }

  /** Valor de uma linha da tabela da Buy Box cujo rótulo casa com `labelRe`. */
  function tabularValue(doc, labelRe) {
    var labels = doc.querySelectorAll(
      "#tabular-buybox .tabular-buybox-label, #tabular-buybox [class*='buybox-label'], .offer-display-feature-label",
    );
    for (var i = 0; i < labels.length; i++) {
      if (!labelRe.test(textOf(labels[i]))) continue;
      var row =
        labels[i].closest(".tabular-buybox-container, tr, .offer-display-feature-container") ||
        labels[i].parentElement;
      var value =
        (row &&
          row.querySelector(
            ".tabular-buybox-text, .offer-display-feature-text-message, td:last-child",
          )) ||
        labels[i].nextElementSibling;
      var t = textOf(value);
      if (t && !labelRe.test(t)) return t;
    }
    return null;
  }

  function extractAsin(doc, href) {
    var input = doc.querySelector("input#ASIN, input[name='ASIN']");
    var fromInput = input && clean(input.value).toUpperCase();
    if (fromInput && ASIN_RE.test(fromInput)) return { asin: fromInput, source: "input#ASIN" };
    var m = URL_ASIN_RE.exec(href || "");
    if (m) return { asin: m[1].toUpperCase(), source: "url" };
    return null;
  }

  function extractShipping(doc) {
    var priced = doc.querySelector("[data-csa-c-delivery-price]");
    if (priced) {
      var attr = clean(priced.getAttribute("data-csa-c-delivery-price"));
      if (/gr[aá]tis|free/i.test(attr))
        return { cents: 0, text: attr, source: "data-csa-c-delivery-price" };
      var cents = parsePrice(attr);
      if (cents) return { cents: cents, text: attr, source: "data-csa-c-delivery-price" };
    }
    var block = firstText(doc, DELIVERY_SELECTORS);
    if (!block) return { cents: null, text: null, source: null };
    var text = block.text.slice(0, 200);
    if (/(entrega|frete)\s+gr[aá]tis|gr[aá]tis\s+(entrega|frete)/i.test(text)) {
      return { cents: 0, text: text, source: block.source };
    }
    var m = /R\$\s*[\d.]+(?:,\d{2})?\s*(?:de\s+)?(?:frete|entrega|envio)/i.exec(text);
    if (m) return { cents: parsePrice(m[0]), text: text, source: block.source };
    return { cents: null, text: text, source: block.source };
  }

  function extractCoupon(doc) {
    for (var i = 0; i < COUPON_SELECTORS.length; i++) {
      var t = textOf(doc.querySelector(COUPON_SELECTORS[i]));
      if (t && /cupom/i.test(t)) {
        var m = /R\$\s*\d[\d.]*(?:,\d{2})?/.exec(t);
        return {
          text: t.slice(0, 200),
          cents: m ? parsePrice(m[0]) : null,
          source: COUPON_SELECTORS[i],
        };
      }
    }
    return null;
  }

  function extractSeller(doc) {
    var direct = firstText(doc, SELLER_SELECTORS);
    if (direct) return { name: direct.text, source: direct.source };
    var tab = tabularValue(doc, /^(vendido por|vendedor)$/i);
    if (tab) return { name: tab, source: "tabular" };
    var info = textOf(doc.querySelector("#merchant-info"));
    var m = /vendido por\s+(.+?)(?:\s+e\s+(?:entregue|enviado)|\.|$)/i.exec(info);
    if (m) return { name: clean(m[1]), source: "#merchant-info" };
    return null;
  }

  function extractShipsFrom(doc) {
    var direct = firstText(doc, SHIPS_FROM_SELECTORS);
    if (direct) return direct.text;
    var tab = tabularValue(doc, /^(enviado por|envio|enviado de)$/i);
    if (tab) return tab;
    var info = textOf(doc.querySelector("#merchant-info"));
    var m = /(?:entregue|enviado) por\s+(.+?)(?:\.|$)/i.exec(info);
    return m ? clean(m[1]) : null;
  }

  /**
   * @param {Document} doc
   * @param {string} href
   */
  function extract(doc, href) {
    var asin = extractAsin(doc, href);
    var title = textOf(doc.querySelector("#productTitle")) || null;
    var price = firstPrice(doc, PRICE_SELECTORS);
    if (!price) {
      var hidden = doc.querySelector("#twister-plus-price-data-price, #attach-base-product-price");
      var raw = hidden && hidden.value;
      if (raw && /^\d+(\.\d{1,2})?$/.test(raw)) {
        price = { cents: Math.round(Number(raw) * 100), source: hidden.id };
      }
    }
    var list = firstPrice(doc, LIST_PRICE_SELECTORS);
    var listPriceCents = list && price && list.cents > price.cents ? list.cents : null;

    var availabilityText = textOf(doc.querySelector("#availability")) || null;
    var available = null;
    if (
      doc.querySelector("#outOfStock") ||
      (availabilityText && UNAVAILABLE_RE.test(availabilityText))
    ) {
      available = false;
    } else if (price) {
      available = true;
    }

    var seller = extractSeller(doc);
    var shipsFrom = extractShipsFrom(doc);
    var shipping = extractShipping(doc);
    var coupon = extractCoupon(doc);
    var used = Boolean(doc.querySelector("#usedOnlyBuybox"));

    return {
      asin: asin ? asin.asin : null,
      title: title,
      isProductPage: Boolean(asin && (title || price)),
      available: available,
      priceCents: available === false ? null : price ? price.cents : null,
      listPriceCents: available === false ? null : listPriceCents,
      availabilityText: availabilityText ? availabilityText.slice(0, 200) : null,
      sellerName: seller ? seller.name.slice(0, 200) : null,
      shipsFrom: shipsFrom ? shipsFrom.slice(0, 200) : null,
      fulfilledByAmazon: shipsFrom ? /amazon/i.test(shipsFrom) : null,
      shippingCents: shipping.cents,
      shippingText: shipping.text,
      couponText: coupon ? coupon.text : null,
      couponCents: coupon ? coupon.cents : null,
      condition: used ? "USED" : "UNKNOWN",
      diagnostics: {
        extractorVersion: VERSION,
        asinSource: asin ? asin.source : null,
        priceSource: price ? price.source : null,
        listPriceSource: listPriceCents ? list.source : null,
        sellerSource: seller ? seller.source : null,
        shippingSource: shipping.source,
        couponSource: coupon ? coupon.source : null,
      },
    };
  }

  // -------------------------------------------------------------------------
  // Carrinho (inclui "Salvo para mais tarde")
  // -------------------------------------------------------------------------

  /** Preço com ponto decimal, como nos atributos data-price ("179", "26.6"). */
  function parseAttrPrice(raw) {
    if (!raw || !/^\d+(\.\d{1,2})?$/.test(raw)) return null;
    var cents = Math.round(Number(raw) * 100);
    return cents > 0 ? cents : null;
  }

  function isCartPage(doc) {
    return Boolean(
      doc.querySelector("#sc-active-cart, #sc-saved-cart, div.sc-list-item[data-asin]"),
    );
  }

  /**
   * Lê todos os itens do carrinho e de "Salvo para mais tarde".
   *
   * Regras (derivadas de uma página real do carrinho):
   * - Item "não disponível" vira UNAVAILABLE; o "a partir de R$ X" de outras ofertas é ignorado.
   * - Quando o preço em destaque é o preço à vista no Pix/NuPay, o preço principal é o normal
   *   (atributo data-price) e o do Pix é guardado à parte.
   * - Nos demais casos vale o preço visível (o atributo pode estar desatualizado quando a
   *   Amazon troca a oferta).
   * - Sem preço confiável, o item fica como UNREADABLE e não é registrado.
   */
  function extractCart(doc) {
    var nodes = doc.querySelectorAll("div.sc-list-item[data-asin]");
    var items = [];
    var seen = {};
    var duplicates = 0;
    for (var i = 0; i < nodes.length; i++) {
      var el = nodes[i];
      var asin = clean(el.getAttribute("data-asin")).toUpperCase();
      if (!ASIN_RE.test(asin)) continue;
      if (seen[asin]) {
        duplicates++;
        continue;
      }
      seen[asin] = true;

      var title =
        clean(el.getAttribute("data-producttitle")) ||
        textOf(el.querySelector(".sc-product-title .a-truncate-full, .sc-product-title")) ||
        null;
      var section = el.getAttribute("data-itemtype") === "saved" ? "saved" : "active";
      var availabilityText = textOf(el.querySelector(".sc-product-availability")) || null;
      var attrCents = parseAttrPrice(clean(el.getAttribute("data-price")));
      var diagnostics = { extractorVersion: VERSION, page: "cart", section: section };

      var unavailable =
        el.getAttribute("data-outofstock") === "1" ||
        Boolean(availabilityText && UNAVAILABLE_RE.test(availabilityText));

      var status = "OK";
      var priceCents = null;
      var pixPriceCents = null;
      if (unavailable) {
        status = "UNAVAILABLE";
      } else {
        var pixEl = el.querySelector(".apex-promotions-unified-otp .a-offscreen");
        var visibleEl = el.querySelector(
          ".apex-price-to-pay-value .a-offscreen, .sc-product-price, .sc-badge-price-to-pay .sc-price",
        );
        if (pixEl) {
          pixPriceCents = parsePrice(pixEl.textContent);
          if (attrCents && (!pixPriceCents || attrCents >= pixPriceCents)) {
            priceCents = attrCents;
            diagnostics.priceSource = "data-price (destaque era preço no Pix)";
          }
        } else if (visibleEl && parsePrice(visibleEl.textContent)) {
          priceCents = parsePrice(visibleEl.textContent);
          diagnostics.priceSource = "visível";
          if (attrCents && attrCents !== priceCents) diagnostics.attrPriceCents = attrCents;
        } else if (attrCents) {
          priceCents = attrCents;
          diagnostics.priceSource = "data-price";
        }
        if (!priceCents) {
          status = "UNREADABLE";
          pixPriceCents = null;
        }
      }

      var listPriceCents = null;
      var basis = null;
      var offs = el.querySelectorAll(".sc-apex-cart-price .a-offscreen");
      for (var j = 0; j < offs.length; j++) {
        if (/^De:/i.test(clean(offs[j].textContent))) basis = parsePrice(offs[j].textContent);
      }
      if (!basis) {
        var basisEl = el.querySelector(".apex-basis-price-value");
        if (basisEl) basis = parsePrice(basisEl.textContent.replace(/null/g, ""));
      }
      if (basis && priceCents && basis > priceCents) listPriceCents = basis;

      var sellerText = textOf(el.querySelector(".sc-seller"));
      var sellerName = sellerText ? clean(sellerText.replace(/^Vendido por:?/i, "")) || null : null;

      items.push({
        asin: asin,
        title: title ? title.slice(0, 500) : null,
        section: section,
        status: status,
        priceCents: status === "OK" ? priceCents : null,
        pixPriceCents: status === "OK" ? pixPriceCents : null,
        listPriceCents: status === "OK" ? listPriceCents : null,
        primeExclusive: /pre[çc]o exclusivo prime/i.test(el.textContent || ""),
        sellerName: sellerName ? sellerName.slice(0, 200) : null,
        availabilityText: availabilityText ? availabilityText.slice(0, 200) : null,
        diagnostics: diagnostics,
      });
    }
    return { isCart: isCartPage(doc), items: items, duplicates: duplicates };
  }

  root.HistoricoPrecosExtract = {
    extract: extract,
    extractCart: extractCart,
    isCartPage: isCartPage,
    parsePrice: parsePrice,
    version: VERSION,
  };
})(globalThis);
