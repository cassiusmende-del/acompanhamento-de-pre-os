"use client";

import Link from "next/link";
import { useActionState } from "react";
import { createProductAction, type FormState } from "@/app/actions";
import { buttonClass, Field, inputClass } from "@/components/form";

export function NewProductForm() {
  const [state, action, pending] = useActionState<FormState, FormData>(createProductAction, {});
  const v = state.values ?? {};
  return (
    <form action={action} className="mt-4 flex max-w-xl flex-col gap-4">
      <Field
        label="Link do produto ou ASIN"
        name="input"
        error={state.errors?.input}
        hint="Ex.: https://www.amazon.com.br/.../dp/B0BHJJ9Y77 — de preferência o link da variação exata (cor, capacidade)."
      >
        <input
          id="input"
          name="input"
          required
          defaultValue={v.input}
          className={inputClass}
          autoFocus
        />
      </Field>
      <Field
        label="Título (opcional)"
        name="title"
        error={state.errors?.title}
        hint="Se ficar vazio, o título é preenchido na primeira captura pela extensão."
      >
        <input id="title" name="title" defaultValue={v.title} className={inputClass} />
      </Field>
      <Field
        label="Intervalo desejado entre capturas (horas)"
        name="targetIntervalHours"
        error={state.errors?.targetIntervalHours}
        hint="Usado só para ordenar a fila de captura. Padrão: 48 horas."
      >
        <input
          id="targetIntervalHours"
          name="targetIntervalHours"
          inputMode="numeric"
          defaultValue={v.targetIntervalHours ?? "48"}
          className={`${inputClass} w-28`}
        />
      </Field>
      <Field
        label="Anotações (opcional)"
        name="notes"
        error={state.errors?.notes}
        hint="Contexto livre, ex.: “Keepa: mínimo R$ 549 em mar/2026”. Não entra nos cálculos."
      >
        <textarea id="notes" name="notes" rows={3} defaultValue={v.notes} className={inputClass} />
      </Field>
      {state.message && (
        <p className="text-sm">
          {state.message}{" "}
          {state.link && (
            <Link href={state.link.href} className="underline">
              {state.link.label}
            </Link>
          )}
        </p>
      )}
      <div>
        <button type="submit" disabled={pending} className={buttonClass}>
          {pending ? "Salvando…" : "Cadastrar"}
        </button>
      </div>
    </form>
  );
}
