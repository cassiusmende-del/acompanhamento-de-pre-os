"use client";

import { useActionState, useState } from "react";
import { recordManualObservationAction, type FormState } from "@/app/actions";
import { buttonClass, Field, inputClass } from "@/components/form";

export function ManualObservationForm({
  productId,
  nowLocal,
}: {
  productId: string;
  nowLocal: string;
}) {
  const [state, action, pending] = useActionState<FormState, FormData>(
    recordManualObservationAction,
    {},
  );
  const v = state.values ?? {};
  const [status, setStatus] = useState(v.status ?? "OK");
  const e = state.errors ?? {};

  return (
    // `key` recria o formulário vazio depois de um registro bem-sucedido
    <form key={state.savedAt ?? "new"} action={action} className="flex flex-col gap-3">
      <input type="hidden" name="productId" value={productId} />
      <fieldset className="flex gap-4 text-sm">
        <legend className="sr-only">Situação</legend>
        <label className="flex items-center gap-1">
          <input
            type="radio"
            name="status"
            value="OK"
            checked={status === "OK"}
            onChange={() => setStatus("OK")}
          />
          Disponível
        </label>
        <label className="flex items-center gap-1">
          <input
            type="radio"
            name="status"
            value="UNAVAILABLE"
            checked={status === "UNAVAILABLE"}
            onChange={() => setStatus("UNAVAILABLE")}
          />
          Indisponível
        </label>
      </fieldset>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {status === "OK" && (
          <Field label="Preço" name="price" error={e.price}>
            <input
              id="price"
              name="price"
              inputMode="decimal"
              placeholder="649,90"
              defaultValue={v.price}
              className={inputClass}
              required
            />
          </Field>
        )}
        <Field
          label="Data e hora"
          name="observedAt"
          error={e.observedAt}
          hint="Horário de Brasília"
        >
          <input
            id="observedAt"
            name="observedAt"
            type="datetime-local"
            defaultValue={v.observedAt ?? nowLocal}
            className={inputClass}
          />
        </Field>
        <Field label="Vendedor" name="sellerName" error={e.sellerName}>
          <input
            id="sellerName"
            name="sellerName"
            defaultValue={v.sellerName}
            className={inputClass}
          />
        </Field>
      </div>
      {status === "OK" && (
        <details className="text-sm">
          <summary className="cursor-pointer text-muted">
            Preço “de”, frete, cupom e condição
          </summary>
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Field label="Preço “de” exibido" name="listPrice" error={e.listPrice}>
              <input
                id="listPrice"
                name="listPrice"
                inputMode="decimal"
                defaultValue={v.listPrice}
                className={inputClass}
              />
            </Field>
            <Field
              label="Frete"
              name="shipping"
              error={e.shipping}
              hint="Vazio = não sei; 0 ou “grátis” = grátis"
            >
              <input
                id="shipping"
                name="shipping"
                defaultValue={v.shipping}
                className={inputClass}
              />
            </Field>
            <Field label="Condição" name="condition">
              <select
                id="condition"
                name="condition"
                defaultValue={v.condition ?? "NEW"}
                className={inputClass}
              >
                <option value="NEW">Novo</option>
                <option value="USED">Usado</option>
                <option value="REFURBISHED">Recondicionado</option>
                <option value="UNKNOWN">Não sei</option>
              </select>
            </Field>
            <Field label="Cupom (texto)" name="couponText" error={e.couponText}>
              <input
                id="couponText"
                name="couponText"
                placeholder="Ex.: 10% de desconto"
                defaultValue={v.couponText}
                className={inputClass}
              />
            </Field>
            <Field
              label="Valor do cupom em reais"
              name="couponValue"
              error={e.couponValue}
              hint="Só se for valor fixo"
            >
              <input
                id="couponValue"
                name="couponValue"
                inputMode="decimal"
                defaultValue={v.couponValue}
                className={inputClass}
              />
            </Field>
          </div>
        </details>
      )}
      {state.message && <p className="text-sm">{state.message}</p>}
      <div>
        <button type="submit" disabled={pending} className={buttonClass}>
          {pending ? "Registrando…" : "Registrar"}
        </button>
      </div>
    </form>
  );
}
