import { parseAsin } from "@/domain/asin";
import { parseLocalDateTime } from "@/domain/dates";
import { parseBRL } from "@/domain/money";
import type { Condition } from "./service";

/** Resultado da interpretação de um formulário: dados válidos ou erros por campo. */
export type FormResult<T> = { ok: true; data: T } | { ok: false; errors: Record<string, string> };

function field(form: FormData, name: string): string {
  const value = form.get(name);
  return typeof value === "string" ? value.trim() : "";
}

const CONDITIONS: Condition[] = ["NEW", "USED", "REFURBISHED", "UNKNOWN"];

export interface ProductFormData {
  asin: string;
  title: string | null;
  targetIntervalHours: number;
  notes: string | null;
}

export function parseProductForm(form: FormData): FormResult<ProductFormData> {
  const errors: Record<string, string> = {};
  const parsed = parseAsin(field(form, "input"));
  let asin = "";
  if (!parsed.ok) {
    errors.input = {
      EMPTY: "Informe o link do produto ou o ASIN.",
      SHORT_LINK:
        "Links curtos (amzn.to) não podem ser lidos sem acessar a Amazon. Cole o link completo da página do produto.",
      NOT_AMAZON: "O link não é da Amazon.",
      NOT_FOUND:
        "Não encontrei um ASIN nesse texto. Cole o link da página do produto ou o código de 10 caracteres.",
    }[parsed.reason];
  } else if (parsed.otherMarketplace) {
    errors.input = `Por enquanto só a Amazon Brasil é suportada (o link é de ${parsed.marketplace}).`;
  } else {
    asin = parsed.asin;
  }

  const interval = parseTargetInterval(field(form, "targetIntervalHours"));
  if (interval === null)
    errors.targetIntervalHours = "Use um número inteiro de horas entre 1 e 720.";

  const title = field(form, "title");
  if (title.length > 500) errors.title = "Título muito longo.";
  const notes = field(form, "notes");
  if (notes.length > 2000) errors.notes = "Anotação muito longa.";

  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return {
    ok: true,
    data: {
      asin,
      title: title || null,
      targetIntervalHours: interval as number,
      notes: notes || null,
    },
  };
}

export function parseTargetInterval(value: string): number | null {
  if (value === "") return 48;
  if (!/^\d+$/.test(value)) return null;
  const n = Number(value);
  return n >= 1 && n <= 720 ? n : null;
}

export interface ManualObservationData {
  status: "OK" | "UNAVAILABLE";
  priceCents: number | null;
  observedAt: Date;
  sellerName: string | null;
  listPriceCents: number | null;
  shippingCents: number | null;
  couponText: string | null;
  couponCents: number | null;
  condition: Condition;
}

function optionalMoney(
  form: FormData,
  name: string,
  errors: Record<string, string>,
  allowZero = false,
): number | null {
  const raw = field(form, name);
  if (raw === "") return null;
  const cents = parseBRL(raw);
  if (cents === null || cents < 0 || (!allowZero && cents === 0)) {
    errors[name] = "Valor inválido. Use o formato 649,90.";
    return null;
  }
  return cents;
}

/**
 * Formulário de registro manual. Frete vazio = desconhecido; "0" ou "grátis" = frete grátis.
 * A data/hora é interpretada no fuso de São Paulo e não pode estar no futuro.
 */
export function parseManualObservationForm(
  form: FormData,
  now: Date,
): FormResult<ManualObservationData> {
  const errors: Record<string, string> = {};
  const status = field(form, "status") === "UNAVAILABLE" ? "UNAVAILABLE" : "OK";

  let priceCents: number | null = null;
  if (status === "OK") {
    priceCents = parseBRL(field(form, "price"));
    if (priceCents === null || priceCents <= 0) errors.price = "Informe o preço no formato 649,90.";
  }

  const observedRaw = field(form, "observedAt");
  let observedAt = now;
  if (observedRaw) {
    const parsed = parseLocalDateTime(observedRaw);
    if (!parsed) errors.observedAt = "Data e hora inválidas.";
    else if (parsed.getTime() > now.getTime() + 5 * 60_000)
      errors.observedAt = "A data não pode estar no futuro.";
    else observedAt = parsed;
  }

  const shippingRaw = field(form, "shipping").toLowerCase();
  let shippingCents: number | null = null;
  if (/^gr[aá]tis$/.test(shippingRaw)) shippingCents = 0;
  else shippingCents = optionalMoney(form, "shipping", errors, true);

  const listPriceCents = optionalMoney(form, "listPrice", errors);
  const couponCents = optionalMoney(form, "couponValue", errors);
  const conditionRaw = field(form, "condition") as Condition;

  const sellerName = field(form, "sellerName");
  const couponText = field(form, "couponText");
  if (sellerName.length > 200) errors.sellerName = "Texto muito longo.";
  if (couponText.length > 300) errors.couponText = "Texto muito longo.";

  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return {
    ok: true,
    data: {
      status,
      priceCents: status === "OK" ? priceCents : null,
      observedAt,
      sellerName: sellerName || null,
      listPriceCents,
      shippingCents,
      couponText: couponText || null,
      couponCents,
      condition: CONDITIONS.includes(conditionRaw) ? conditionRaw : "UNKNOWN",
    },
  };
}
