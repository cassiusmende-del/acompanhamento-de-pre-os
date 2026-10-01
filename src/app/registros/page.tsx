import Link from "next/link";
import { DateTime, Money, sourceLabel } from "@/components/format";
import { getDb } from "@/lib/db";

export const dynamic = "force-dynamic";

const LIMIT = 100;

/** Últimos registros de todos os produtos, para conferir capturas e revisar suspeitos. */
export default async function RecordsPage({ searchParams }: PageProps<"/registros">) {
  const { filtro } = await searchParams;
  const onlySuspect = filtro === "suspeitos";
  const db = getDb();
  const [observations, pendingCount] = await Promise.all([
    db.priceObservation.findMany({
      where: onlySuspect ? { suspect: true, corrections: { none: {} } } : undefined,
      orderBy: { recordedAt: "desc" },
      take: LIMIT,
      include: {
        product: { select: { id: true, title: true } },
        corrections: { orderBy: { createdAt: "desc" }, take: 1 },
      },
    }),
    db.priceObservation.count({ where: { suspect: true, corrections: { none: {} } } }),
  ]);

  return (
    <>
      <h1 className="text-lg font-semibold">Registros</h1>
      <p className="mt-1 text-sm text-muted">
        Últimos {LIMIT} registros de todos os produtos, do mais recente para o mais antigo.
      </p>
      <p className="mt-3 flex gap-4 text-sm">
        <Link href="/registros" className={onlySuspect ? "underline" : "font-semibold"}>
          Todos
        </Link>
        <Link
          href="/registros?filtro=suspeitos"
          className={onlySuspect ? "font-semibold" : "underline"}
        >
          Suspeitos a revisar ({pendingCount})
        </Link>
      </p>

      {observations.length === 0 ? (
        <p className="mt-6 text-muted">
          {onlySuspect ? "Nenhum registro suspeito pendente." : "Nenhum registro ainda."}
        </p>
      ) : (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-rule text-left text-muted">
                <th className="py-2 pr-3 font-normal">Registrado em</th>
                <th className="py-2 pr-3 font-normal">Produto</th>
                <th className="py-2 pr-3 text-right font-normal">Preço</th>
                <th className="py-2 pr-3 font-normal">Origem</th>
                <th className="py-2 font-normal">Situação</th>
              </tr>
            </thead>
            <tbody>
              {observations.map((o) => {
                const correction = o.corrections[0];
                const situation =
                  correction?.action === "EXCLUDE"
                    ? "excluído da análise"
                    : o.suspect && !correction
                      ? "suspeito, a revisar"
                      : o.suspect && correction?.action === "CONFIRM"
                        ? "suspeito, conferido"
                        : correction?.action === "REPLACE_PRICE"
                          ? "corrigido"
                          : "";
                return (
                  <tr key={o.id} className="border-b border-rule">
                    <td className="py-2 pr-3 whitespace-nowrap">
                      <DateTime date={o.recordedAt} />
                    </td>
                    <td className="py-2 pr-3">
                      <Link
                        href={`/produtos/${o.product.id}#observacoes`}
                        className="hover:underline"
                      >
                        {o.product.title}
                      </Link>
                    </td>
                    <td className="py-2 pr-3 text-right whitespace-nowrap">
                      {o.status === "OK" ? (
                        <Money cents={o.priceCents} />
                      ) : (
                        <span className="text-muted">indisponível</span>
                      )}
                    </td>
                    <td className="py-2 pr-3">{sourceLabel(o.source)}</td>
                    <td
                      className={`py-2 text-xs ${o.suspect && !correction ? "text-up" : "text-muted"}`}
                    >
                      {situation}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
