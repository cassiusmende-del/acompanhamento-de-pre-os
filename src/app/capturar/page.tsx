import Link from "next/link";
import { DateTime } from "@/components/format";
import { loadCaptureQueue } from "@/capture/queries";
import { getDb } from "@/lib/db";

export const dynamic = "force-dynamic";

function since(hours: number | null): string {
  if (hours === null) return "nunca registrado";
  if (hours < 1) return "há menos de 1 hora";
  if (hours < 48) return `há ${Math.floor(hours)} h`;
  return `há ${Math.floor(hours / 24)} dias`;
}

const STATUS_LABEL = { never: "sem registro", due: "pendente", ok: "em dia" } as const;

export default async function CapturePage() {
  const queue = await loadCaptureQueue(getDb(), new Date());
  const pending = queue.filter((q) => q.status !== "ok").length;

  return (
    <>
      <h1 className="text-lg font-semibold">Capturar</h1>
      <p className="mt-1 max-w-2xl text-sm text-muted">
        Abra cada produto na Amazon com a extensão instalada: o preço é registrado ao carregar a
        página. Para abrir vários de uma vez, use “Abrir pendentes” no menu da extensão. O intervalo
        desejado de cada produto serve só para ordenar esta lista.
      </p>
      <p className="mt-3 text-sm">
        {pending === 0
          ? "Nenhum produto pendente."
          : `${pending} ${pending === 1 ? "produto pendente" : "produtos pendentes"}.`}
      </p>

      {queue.length === 0 ? (
        <p className="mt-6 text-muted">
          Nenhum produto ativo.{" "}
          <Link href="/produtos/novo" className="underline">
            Cadastrar produto
          </Link>
        </p>
      ) : (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-rule text-left text-muted">
                <th className="py-2 pr-4 font-normal">Situação</th>
                <th className="py-2 pr-4 font-normal">Produto</th>
                <th className="py-2 pr-4 font-normal">Último registro</th>
                <th className="py-2 font-normal" />
              </tr>
            </thead>
            <tbody>
              {queue.map((q) => (
                <tr
                  key={q.productId}
                  className={`border-b border-rule ${q.status === "ok" ? "text-muted" : ""}`}
                >
                  <td className="py-2 pr-4 whitespace-nowrap">{STATUS_LABEL[q.status]}</td>
                  <td className="py-2 pr-4">
                    <Link href={`/produtos/${q.productId}`} className="hover:underline">
                      {q.title}
                    </Link>
                  </td>
                  <td className="py-2 pr-4 whitespace-nowrap">
                    {q.lastObservedAt ? (
                      <>
                        <DateTime date={q.lastObservedAt} />{" "}
                        <span className="text-muted">({since(q.hoursSinceLast)})</span>
                      </>
                    ) : (
                      <span className="text-muted">nunca registrado</span>
                    )}
                  </td>
                  <td className="py-2 whitespace-nowrap">
                    <a href={q.url} target="_blank" rel="noopener noreferrer" className="underline">
                      Abrir na Amazon
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
