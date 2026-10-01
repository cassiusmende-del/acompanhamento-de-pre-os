"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { parseManualObservationForm, parseProductForm, parseTargetInterval } from "@/capture/forms";
import { correctObservation, createProduct, recordObservation } from "@/capture/service";
import { getDb } from "@/lib/db";
import { regenerateExtensionToken } from "@/lib/settings";

/**
 * Ações dos formulários. A aplicação é de uso pessoal e roda em localhost; a proteção de
 * acesso (senha opcional) é feita em src/proxy.ts, e o Next.js verifica a origem das
 * requisições de Server Actions.
 */

export interface FormState {
  errors?: Record<string, string>;
  message?: string;
  /** Link relacionado à mensagem (ex.: produto já cadastrado). */
  link?: { href: string; label: string };
  values?: Record<string, string>;
  /** Incrementado a cada envio bem-sucedido, para limpar o formulário. */
  savedAt?: number;
}

function formValues(form: FormData): Record<string, string> {
  const values: Record<string, string> = {};
  form.forEach((v, k) => {
    if (typeof v === "string" && !k.startsWith("$")) values[k] = v;
  });
  return values;
}

export async function createProductAction(_prev: FormState, form: FormData): Promise<FormState> {
  const parsed = parseProductForm(form);
  if (!parsed.ok) return { errors: parsed.errors, values: formValues(form) };

  const result = await createProduct(getDb(), parsed.data);
  if (!result.ok) {
    return {
      message: "Este produto já está cadastrado.",
      link: { href: `/produtos/${result.productId}`, label: "Abrir produto" },
      values: formValues(form),
    };
  }
  revalidatePath("/");
  redirect(`/produtos/${result.productId}`);
}

export async function updateProductAction(_prev: FormState, form: FormData): Promise<FormState> {
  const id = String(form.get("productId") ?? "");
  const title = String(form.get("title") ?? "").trim();
  const notes = String(form.get("notes") ?? "").trim();
  const interval = parseTargetInterval(String(form.get("targetIntervalHours") ?? "").trim());
  const errors: Record<string, string> = {};
  if (!title) errors.title = "Informe um título.";
  if (title.length > 500) errors.title = "Título muito longo.";
  if (notes.length > 2000) errors.notes = "Anotação muito longa.";
  if (interval === null)
    errors.targetIntervalHours = "Use um número inteiro de horas entre 1 e 720.";
  if (Object.keys(errors).length > 0) return { errors, values: formValues(form) };

  const updated = await getDb().product.updateMany({
    where: { id },
    data: {
      title,
      notes: notes || null,
      targetIntervalHours: interval as number,
      active: form.get("active") === "on",
    },
  });
  if (updated.count === 0) return { message: "Produto não encontrado." };
  revalidatePath(`/produtos/${id}`);
  revalidatePath("/");
  return { message: "Alterações salvas.", savedAt: Date.now() };
}

export async function recordManualObservationAction(
  _prev: FormState,
  form: FormData,
): Promise<FormState> {
  const productId = String(form.get("productId") ?? "");
  const now = new Date();
  const parsed = parseManualObservationForm(form, now);
  if (!parsed.ok) return { errors: parsed.errors, values: formValues(form) };

  const result = await recordObservation(
    getDb(),
    { productId, source: "manual", ...parsed.data },
    { dedupeMinutes: 0, now },
  );
  if (result.status === "product_not_found") return { message: "Produto não encontrado." };
  revalidatePath(`/produtos/${productId}`);
  revalidatePath("/");
  revalidatePath("/capturar");
  return {
    message: result.status === "recorded" ? result.feedback.join(" ") : "Registrado.",
    savedAt: Date.now(),
  };
}

async function correctionAction(
  form: FormData,
  action: "EXCLUDE" | "RESTORE" | "CONFIRM",
): Promise<void> {
  const observationId = String(form.get("observationId") ?? "");
  const productId = String(form.get("productId") ?? "");
  const reason = String(form.get("reason") ?? "").trim() || undefined;
  await correctObservation(getDb(), observationId, action, reason);
  revalidatePath(`/produtos/${productId}`);
  revalidatePath("/");
  revalidatePath("/registros");
}

export async function excludeObservationAction(form: FormData): Promise<void> {
  await correctionAction(form, "EXCLUDE");
}

export async function restoreObservationAction(form: FormData): Promise<void> {
  await correctionAction(form, "RESTORE");
}

export async function confirmObservationAction(form: FormData): Promise<void> {
  await correctionAction(form, "CONFIRM");
}

export async function regenerateTokenAction(): Promise<void> {
  await regenerateExtensionToken(getDb());
  revalidatePath("/configuracoes");
}
