import Link from "next/link";
import { DateTime, Money } from "@/components/format";
import { formatPercentileLabel, formatSignedPercent } from "@/domain/money";
import { getDb } from "@/lib/db";
import { ensureSnapshots } from "@/processing/process";
import type { SnapshotData } from "@/processing/snapshot";

export const dynamic = "force-dynamic";

function Change({ percent }: { percent: number | null | undefined }) {
  if (percent === null || percent === undefined) return <span className="text-muted">—</span>;
  const rounded = Math.round(percent * 10) / 10;
  const tone = rounded < 0 ? "text-down" : rounded > 0 ? "text-up" : "";
  return <span className={`tabular-nums ${tone}`}>{formatSignedPercent(percent)}</span>;
}

export default async function ProductsPage() {
  const db = getDb();
  await ensureSnapshots(db);
  const products = await db.product.findMany({
    orderBy: [{ active: "desc" }, { title: "asc" }],
    select: { id: true, title: true, asin: true, active: true, snapshot: true },
  });

  return (
    <>
      <div className="flex items-baseline justify-between gap-4">
        <h1 className="text-lg font-semibold">Produtos</h1>
        <Link href="/produtos/novo" className="text-sm underline">
          Cadastrar produto
        </Link>
      </div>

      {products.length === 0 ? (
        <p className="mt-6 text-muted">
          Nenhum produto cadastrado.{" "}
          <Link href="/produtos/novo" className="underline">
            Cadastre o primeiro
          </Link>{" "}
          ou use “Monitorar este produto” na extensão.
        </p>
      ) : (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-rule text-left text-muted">
                <th className="py-2 pr-4 font-normal">Produto</th>
                <th className="py-2 pr-4 text-right font-normal">Atual</th>
                <th
                  className="py-2 pr-4 text-right font-normal"
                  title="Variação desde a observação anterior"
                >
                  vs. anterior
                </th>
                <th className="py-2 pr-4 text-right font-normal">Menor</th>
                <th className="py-2 pr-4 text-right font-normal">Mediana</th>
                <th
                  className="py-2 pr-4 text-right font-normal"
                  title="Preço atual em relação à mediana"
                >
                  vs. mediana
                </th>
                <th
                  className="py-2 pr-4 text-right font-normal"
                  title="Porcentagem das observações com preço igual ou menor que o atual"
                >
                  Percentil
                </th>
                <th className="py-2 font-normal">Último registro</th>
              </tr>
            </thead>
            <tbody>
              {products.map((p) => {
                const s = p.snapshot;
                const d = s?.data as SnapshotData | undefined;
                return (
                  <tr key={p.id} className={`border-b border-rule ${p.active ? "" : "text-muted"}`}>
                    <td className="py-2 pr-4">
                      <Link href={`/produtos/${p.id}`} className="hover:underline">
                        {p.title}
                      </Link>
                      {!p.active && <span className="ml-2 text-xs">(pausado)</span>}
                      {d && d.pendingSuspect > 0 && (
                        <span className="ml-2 text-xs text-up">{d.pendingSuspect} a revisar</span>
                      )}
                    </td>
                    <td className="py-2 pr-4 text-right whitespace-nowrap">
                      {s && s.currentPriceCents === null && d?.unavailableSince ? (
                        <span className="text-muted">indisponível</span>
                      ) : (
                        <Money cents={s?.currentPriceCents} />
                      )}
                    </td>
                    <td className="py-2 pr-4 text-right">
                      <Change percent={d?.changeFromPreviousPercent} />
                    </td>
                    <td className="py-2 pr-4 text-right whitespace-nowrap">
                      <Money cents={s?.lowestPriceCents} />
                    </td>
                    <td className="py-2 pr-4 text-right whitespace-nowrap">
                      <Money cents={s?.medianPriceCents} />
                    </td>
                    <td className="py-2 pr-4 text-right">
                      <Change percent={d?.changeFromMedianPercent} />
                    </td>
                    <td className="py-2 pr-4 text-right tabular-nums">
                      {s?.percentile !== null && s?.percentile !== undefined ? (
                        formatPercentileLabel(Number(s.percentile))
                      ) : (
                        <span
                          className="text-muted"
                          title="Dados insuficientes (mínimo de 20 observações em 14 dias)"
                        >
                          —
                        </span>
                      )}
                    </td>
                    <td className="py-2 whitespace-nowrap text-muted">
                      <DateTime date={s?.lastObservedAt} />
                      {s && <span className="ml-1 text-xs">({s.pricedCount})</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p className="mt-3 text-xs text-muted">
            Percentil: porcentagem das observações com preço igual ou menor que o atual; aparece com
            pelo menos 20 observações em 14 dias. Entre parênteses, a quantidade de observações com
            preço.
          </p>
        </div>
      )}
    </>
  );
}
