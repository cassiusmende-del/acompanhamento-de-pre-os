import { headers } from "next/headers";
import { regenerateTokenAction } from "@/app/actions";
import { secondaryButtonClass } from "@/components/form";
import { getDb } from "@/lib/db";
import { getCaptureDedupeMinutes, getOrCreateExtensionToken } from "@/lib/settings";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const db = getDb();
  const [token, dedupeMinutes, h] = await Promise.all([
    getOrCreateExtensionToken(db),
    getCaptureDedupeMinutes(db),
    headers(),
  ]);
  const host = h.get("host") ?? "localhost:3000";
  const appUrl = `http://${host}`;

  return (
    <>
      <h1 className="text-lg font-semibold">Configurações</h1>

      <section className="mt-6 max-w-2xl">
        <h2 className="font-semibold">Extensão do navegador</h2>
        <p className="mt-1 text-sm text-muted">
          A extensão lê o preço da página da Amazon que você abriu e envia para esta aplicação. Ela
          não acessa a Amazon sozinha, não usa sua conta e não lê o carrinho.
        </p>

        <ol className="mt-4 list-decimal space-y-2 pl-5 text-sm">
          <li>
            No Chrome, Edge ou Brave, abra <code>chrome://extensions</code> e ative o{" "}
            <strong>Modo do desenvolvedor</strong>.
          </li>
          <li>
            Clique em <strong>Carregar sem compactação</strong> e escolha a pasta{" "}
            <code>extension</code> deste projeto.
          </li>
          <li>
            Abra as opções da extensão e preencha:
            <dl className="mt-2 grid grid-cols-[max-content_1fr] gap-x-3 gap-y-1">
              <dt className="text-muted">Endereço</dt>
              <dd>
                <code className="select-all">{appUrl}</code>
              </dd>
              <dt className="text-muted">Token</dt>
              <dd>
                <code className="break-all select-all">{token}</code>
              </dd>
            </dl>
          </li>
          <li>Use “Testar conexão” nas opções da extensão.</li>
        </ol>

        <form action={regenerateTokenAction} className="mt-4">
          <button type="submit" className={secondaryButtonClass}>
            Gerar novo token
          </button>
          <span className="ml-3 text-xs text-muted">
            O token antigo deixa de funcionar imediatamente.
          </span>
        </form>
      </section>

      <section className="mt-8 max-w-2xl border-t border-rule pt-4">
        <h2 className="font-semibold">Regras de captura</h2>
        <p className="mt-1 text-sm">
          Recarregar a página em menos de {dedupeMinutes} minutos com o mesmo preço não gera novo
          registro. Se o preço mudar, o registro é feito na hora. O botão “Registrar agora” da
          extensão ignora essa regra.
        </p>
      </section>
    </>
  );
}
