"use client";

import { useActionState } from "react";
import { updateProductAction, type FormState } from "@/app/actions";
import { Field, inputClass, secondaryButtonClass } from "@/components/form";

export function EditProductForm(props: {
  productId: string;
  title: string;
  notes: string | null;
  targetIntervalHours: number;
  active: boolean;
}) {
  const [state, action, pending] = useActionState<FormState, FormData>(updateProductAction, {});
  const v = state.values;
  const e = state.errors ?? {};
  return (
    <form action={action} className="mt-3 flex max-w-xl flex-col gap-3">
      <input type="hidden" name="productId" value={props.productId} />
      <Field label="Título" name="title" error={e.title}>
        <input
          id="title"
          name="title"
          defaultValue={v?.title ?? props.title}
          className={inputClass}
          required
        />
      </Field>
      <Field
        label="Intervalo desejado entre capturas (horas)"
        name="targetIntervalHours"
        error={e.targetIntervalHours}
      >
        <input
          id="targetIntervalHours"
          name="targetIntervalHours"
          inputMode="numeric"
          defaultValue={v?.targetIntervalHours ?? String(props.targetIntervalHours)}
          className={`${inputClass} w-28`}
        />
      </Field>
      <Field label="Anotações" name="notes" error={e.notes} hint="Não entram nos cálculos.">
        <textarea
          id="notes"
          name="notes"
          rows={3}
          defaultValue={v?.notes ?? props.notes ?? ""}
          className={inputClass}
        />
      </Field>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          name="active"
          defaultChecked={v ? v.active === "on" : props.active}
        />
        Ativo (aparece na fila de captura e é registrado pela extensão)
      </label>
      {state.message && <p className="text-sm">{state.message}</p>}
      <div>
        <button type="submit" disabled={pending} className={secondaryButtonClass}>
          {pending ? "Salvando…" : "Salvar alterações"}
        </button>
      </div>
    </form>
  );
}
