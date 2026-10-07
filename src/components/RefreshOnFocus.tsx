"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

const INTERVAL_MS = 60_000;

/**
 * Mantém os dados da página atualizados: recarrega do servidor quando o usuário volta para a
 * aba (ex.: depois de registrar preços na Amazon em outra aba) e a cada minuto enquanto ela
 * está visível. Não recarrega enquanto um campo de formulário está em uso.
 */
export function RefreshOnFocus() {
  const router = useRouter();
  useEffect(() => {
    let last = Date.now();
    const editing = () => {
      const el = document.activeElement;
      return (
        el instanceof HTMLInputElement ||
        el instanceof HTMLTextAreaElement ||
        el instanceof HTMLSelectElement
      );
    };
    const refresh = () => {
      if (document.visibilityState !== "visible" || editing()) return;
      if (Date.now() - last < 2_000) return;
      last = Date.now();
      router.refresh();
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible") refresh();
    };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("focus", refresh);
    const timer = window.setInterval(refresh, INTERVAL_MS);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("focus", refresh);
      window.clearInterval(timer);
    };
  }, [router]);
  return null;
}
