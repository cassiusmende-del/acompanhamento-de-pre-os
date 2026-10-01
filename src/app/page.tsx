import Link from "next/link";
import { DateTime, Money } from "@/components/format";
import { getDb } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function ProductsPage() {
  const products = await getDb().product.findMany({
    orderBy: [{ active: "desc" }, { title: "asc" }],
    select: {
      id: true,
      title: true,
      asin: true,
      active: true,
      _count: { select: { observations: true } },
      observations: {
        orderBy: { observedAt: "desc" },
        take: 1,
        select: { observedAt: true, status: true, priceCents: true },
      },
    },
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
                <th className="py-2 pr-4 font-normal">Último registro</th>
                <th className="py-2 pr-4 text-right font-normal">Preço</th>
                <th className="py-2 text-right font-normal">Observações</th>
              </tr>
            </thead>
            <tbody>
              {products.map((p) => {
                const last = p.observations[0];
                return (
                  <tr key={p.id} className="border-b border-rule">
                    <td className="py-2 pr-4">
                      <Link href={`/produtos/${p.id}`} className="hover:underline">
                        {p.title}
                      </Link>
                      <span className="ml-2 text-xs text-muted">{p.asin}</span>
                      {!p.active && <span className="ml-2 text-xs text-muted">(pausado)</span>}
                    </td>
                    <td className="py-2 pr-4 text-muted">
                      <DateTime date={last?.observedAt} />
                    </td>
                    <td className="py-2 pr-4 text-right">
                      {last && last.status !== "OK" ? (
                        <span className="text-muted">indisponível</span>
                      ) : (
                        <Money cents={last?.priceCents} />
                      )}
                    </td>
                    <td className="py-2 text-right tabular-nums">{p._count.observations}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p className="mt-3 text-xs text-muted">
            Comparações com o histórico (média, mínimos, percentil) chegam com as telas de análise.
          </p>
        </div>
      )}
    </>
  );
}
