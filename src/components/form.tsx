import type { ReactNode } from "react";

/** Campo de formulário com rótulo, dica e mensagem de erro. */
export function Field({
  label,
  name,
  error,
  hint,
  children,
}: {
  label: string;
  name: string;
  error?: string;
  hint?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={name} className="text-sm font-medium">
        {label}
      </label>
      {children}
      {hint && !error && <p className="text-xs text-muted">{hint}</p>}
      {error && (
        <p id={`${name}-error`} className="text-xs text-up">
          {error}
        </p>
      )}
    </div>
  );
}

export const inputClass =
  "rounded border border-rule bg-background px-2 py-1.5 text-sm focus:outline-2 focus:outline-foreground";

export const buttonClass =
  "rounded border border-foreground bg-foreground px-3 py-1.5 text-sm font-medium text-background disabled:opacity-50";

export const secondaryButtonClass =
  "rounded border border-rule px-3 py-1.5 text-sm hover:border-foreground disabled:opacity-50";
