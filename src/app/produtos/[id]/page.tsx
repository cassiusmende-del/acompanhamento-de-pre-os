import Link from "next/link";
import { notFound } from "next/navigation";
import {
  confirmObservationAction,
  excludeObservationAction,
  restoreObservationAction,
} from "@/app/actions";
import { inputClass, secondaryButtonClass } from "@/components/form";
import { DateTime, Money, sourceLabel } from "@/components/format";
import { toLocalDateTimeInput } from "@/domain/dates";
import { formatSignedBRL, formatSignedPercent, parseBRL } from "@/domain/money";
import {
  applyCorrections,
  buildChartSeries,
  buildSegments,
  computeProductAnalytics,
  DAY_MS,
  describe,
  readableBands,
} from "@/analytics";
import { PriceChart } from "@/components/PriceChart";
import { getDb } from "@/lib/db";
import { loadProductHistory } from "@/processing/process";
import {
  Behavior,
  Comparison,
  CurrentPrice,
  Distribution,
  KeyNumbers,
  LowPrices,
  Position,
  WindowMinimums,
} from "./analysis-sections";
import { EditProductForm } from "./EditProductForm";
import { ManualObservationForm } from "./ManualObservationForm";

export const dynamic = "force-dynamic";

const EVENT_LABELS: Record<string, string> = {
  FIRST_PRICE: "primeiro preço",
  PRICE_DROP: "queda",
  PRICE_INCREASE: "alta",
  PRICE_UNAVAILABLE: "ficou indisponível",
};

const EVENTS_SHOWN = 50;
const OBSERVATIONS_SHOWN = 30;

const CONDITION_LABELS: Record<string, string> = {
  NEW: "novo",
  USED: "usado",
  REFURBISHED: "recondicionado",
  UNKNOWN: "",
};

export default async function ProductPage({ params, searchParams }: PageProps<"/produtos/[id]">) {
  const { id } = await params;
  const { limite, obs } = await searchParams;
  const showAllObservations = obs === "todas";
  const thresholdInput = typeof limite === "string" ? limite.trim() : "";
  const userThreshold = thresholdInput ? parseBRL(thresholdInput) : null;
  const db = getDb();
  const product = await db.product.findUnique({
    where: { id },
    include: {
      observations: {
        orderBy: { observedAt: "desc" },
        include: { corrections: { orderBy: { createdAt: "desc" }, take: 1 } },
      },
      events: {
        where: { type: { not: "PRICE_UNCHANGED" } },
        orderBy: { occurredAt: "desc" },
        take: EVENTS_SHOWN + 1,
      },
    },
  });
  if (!product) notFound();

  const now = new Date();
  const history = await loadProductHistory(db, product.id);
  const analytics = computeProductAnalytics({
    ...history,
    now,
    lowPriceThresholdCents: userThreshold !== null && userThreshold > 0 ? userThreshold : null,
  });
  const sentences = describe(analytics, now);
  const segments = buildSegments(
    applyCorrections(
      history.observations.filter((o) => o.observedAt.getTime() <= now.getTime()),
      history.corrections,
    ),
    now,
    analytics.config.maxValidityDays * DAY_MS,
  );
  const chartSeries = buildChartSeries(segments, now);
  const distribution =
    analytics.median.byObservation !== null
      ? readableBands(segments, analytics.median.byObservation)
      : null;

  const observations = product.observations;
  const shownObservations = showAllObservations
    ? observations
    : observations.slice(0, OBSERVATIONS_SHOWN);
  // Último registro considerado na análise (ignora os excluídos; aplica preço corrigido).
  const latestEffective = observations.find((o) => o.corrections[0]?.action !== "EXCLUDE");
  const latest = latestEffective && {
    ...latestEffective,
    priceCents:
      latestEffective.corrections[0]?.action === "REPLACE_PRICE"
        ? latestEffective.corrections[0].newPriceCents
        : latestEffective.priceCents,
  };
  const excludedCount = observations.filter((o) => o.corrections[0]?.action === "EXCLUDE").length;
  const pendingSuspect = observations.filter((o) => o.suspect && !o.corrections[0]).length;
  const events = product.events.slice(0, EVENTS_SHOWN);

  return (
    <>
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h1 className="text-lg font-semibold">{product.title}</h1>
        <a
          href={product.url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm underline"
        >
          Abrir na Amazon
        </a>
      </div>
      <p className="mt-1 text-sm text-muted">
        ASIN {product.asin} · {product.marketplace}
        {!product.active && " · pausado"}
      </p>
      {product.notes && <p className="mt-2 whitespace-pre-line text-sm">{product.notes}</p>}

      {pendingSuspect > 0 && (
        <p className="mt-4 border-l-4 border-up pl-3 text-sm">
          {pendingSuspect === 1
            ? "1 registro com valor muito diferente do histórico recente aguarda revisão."
            : `${pendingSuspect} registros com valor muito diferente do histórico recente aguardam revisão.`}{" "}
          Até serem revisados, eles entram nos cálculos.{" "}
          <a href="#observacoes" className="underline">
            Revisar
          </a>
        </p>
      )}

      <CurrentPrice
        a={analytics}
        now={now}
        sellerName={latest?.status === "OK" ? latest.sellerName : null}
        sourceLabel={latest ? sourceLabel(latest.source) : null}
      />
      <KeyNumbers a={analytics} now={now} />
      <Behavior sentences={sentences} pendingSuspect={analytics.counts.pendingSuspect} />

      {analytics.counts.priced > 0 && (
        <section className="mt-8">
          <h2 className="mb-2 font-semibold">Histórico de preços</h2>
          <PriceChart
            series={chartSeries}
            now={now.getTime()}
            firstAt={analytics.firstObservedAt?.getTime() ?? null}
            lowestCents={analytics.lowest?.priceCents ?? null}
            medianCents={
              analytics.median.byObservation === null
                ? null
                : Math.round(analytics.median.byObservation)
            }
          />
        </section>
      )}

      <div className="mt-8 grid grid-cols-1 gap-8 lg:grid-cols-2">
        <Comparison a={analytics} />
        <WindowMinimums a={analytics} />
      </div>

      <div className="mt-8 grid grid-cols-1 gap-8 lg:grid-cols-2">
        <Position a={analytics} />
        {distribution && (
          <Distribution
            bands={distribution.bands}
            widthCents={distribution.width}
            currentCents={analytics.current?.priceCents ?? null}
            validityDays={analytics.config.maxValidityDays}
          />
        )}
      </div>

      <div id="preco-baixo" className="mt-8">
        <LowPrices a={analytics} productId={product.id} thresholdInput={thresholdInput} />
      </div>
      <section className="mt-8 border-t border-rule pt-4">
        <h2 className="font-semibold">Mudanças de preço</h2>
        {events.length === 0 ? (
          <p className="mt-2 text-sm text-muted">Nenhuma mudança registrada ainda.</p>
        ) : (
          <div className="mt-2 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-rule text-left text-muted">
                  <th className="py-2 pr-3 font-normal">Data</th>
                  <th className="py-2 pr-3 font-normal">Mudança</th>
                  <th className="py-2 pr-3 text-right font-normal">Anterior</th>
                  <th className="py-2 pr-3 text-right font-normal">Novo</th>
                  <th className="py-2 pr-3 text-right font-normal">Diferença</th>
                  <th className="py-2 font-normal" />
                </tr>
              </thead>
              <tbody>
                {events.map((e) => {
                  const percent = e.deltaPercent === null ? null : Number(e.deltaPercent);
                  const tone =
                    e.type === "PRICE_DROP"
                      ? "text-down"
                      : e.type === "PRICE_INCREASE"
                        ? "text-up"
                        : "";
                  return (
                    <tr key={e.id} className="border-b border-rule">
                      <td className="py-2 pr-3 whitespace-nowrap">
                        <DateTime date={e.occurredAt} />
                      </td>
                      <td className={`py-2 pr-3 ${tone}`}>{EVENT_LABELS[e.type] ?? e.type}</td>
                      <td className="py-2 pr-3 text-right whitespace-nowrap">
                        <Money cents={e.previousPriceCents} empty="" />
                      </td>
                      <td className="py-2 pr-3 text-right whitespace-nowrap">
                        <Money cents={e.newPriceCents} empty="" />
                      </td>
                      <td className={`py-2 pr-3 text-right whitespace-nowrap tabular-nums ${tone}`}>
                        {e.deltaCents !== null && percent !== null
                          ? `${formatSignedBRL(e.deltaCents)} (${formatSignedPercent(percent)})`
                          : ""}
                      </td>
                      <td className="py-2 text-xs text-muted">
                        {[
                          e.backInStock && "voltou a ficar disponível",
                          e.sellerChanged && "vendedor mudou",
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {product.events.length > EVENTS_SHOWN && (
              <p className="mt-2 text-xs text-muted">
                Mostrando as {EVENTS_SHOWN} mudanças mais recentes.
              </p>
            )}
          </div>
        )}
      </section>

      <section className="mt-8 border-t border-rule pt-4">
        <h2 className="font-semibold">Registrar preço manualmente</h2>
        <p className="mb-3 text-sm text-muted">
          Use quando a extensão não conseguir ler a página ou para registrar algo visto em outro
          dispositivo.
        </p>
        <ManualObservationForm productId={product.id} nowLocal={toLocalDateTimeInput(new Date())} />
      </section>

      <section id="observacoes" className="mt-8 border-t border-rule pt-4">
        <h2 className="font-semibold">
          Observações{" "}
          <span className="text-sm font-normal text-muted">
            ({observations.length}
            {excludedCount > 0 &&
              `; ${excludedCount} excluída${excludedCount === 1 ? "" : "s"} da análise`}
            )
          </span>
        </h2>
        {observations.length === 0 ? (
          <p className="mt-2 text-sm text-muted">
            Nenhuma observação ainda. Abra o produto na Amazon com a extensão instalada ou registre
            manualmente.
          </p>
        ) : (
          <div className="mt-2 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-rule text-left text-muted">
                  <th className="py-2 pr-3 font-normal">Data</th>
                  <th className="py-2 pr-3 text-right font-normal">Preço</th>
                  <th className="py-2 pr-3 text-right font-normal">“De”</th>
                  <th className="py-2 pr-3 text-right font-normal">Frete</th>
                  <th className="py-2 pr-3 font-normal">Cupom</th>
                  <th className="py-2 pr-3 font-normal">Vendedor</th>
                  <th className="py-2 pr-3 font-normal">Origem</th>
                  <th className="py-2 font-normal" />
                </tr>
              </thead>
              <tbody>
                {shownObservations.map((o) => {
                  const correction = o.corrections[0];
                  const excluded = correction?.action === "EXCLUDE";
                  const replaced = correction?.action === "REPLACE_PRICE";
                  const strike = excluded ? "line-through" : "";
                  const pending = o.suspect && !correction;
                  const confirmed = o.suspect && correction?.action === "CONFIRM";
                  return (
                    <tr
                      key={o.id}
                      className={`border-b border-rule align-top ${excluded ? "text-muted" : ""}`}
                    >
                      <td className={`py-2 pr-3 whitespace-nowrap ${strike}`}>
                        <DateTime date={o.observedAt} />
                      </td>
                      <td className={`py-2 pr-3 text-right whitespace-nowrap ${strike}`}>
                        {o.status === "OK" ? (
                          <>
                            <Money cents={replaced ? correction.newPriceCents : o.priceCents} />
                            {replaced && (
                              <span className="block text-xs text-muted">
                                corrigido; lido <Money cents={o.priceCents} />
                              </span>
                            )}
                          </>
                        ) : (
                          <span className="text-muted">
                            {o.status === "UNAVAILABLE" ? "indisponível" : "não encontrado"}
                          </span>
                        )}
                        {pending && (
                          <span className="block text-xs whitespace-normal text-up">
                            suspeito: {o.suspectReason}
                          </span>
                        )}
                        {confirmed && (
                          <span className="block text-xs text-muted">valor conferido</span>
                        )}
                        {o.pixPriceCents !== null && (
                          <span className="block text-xs text-muted">
                            Pix: <Money cents={o.pixPriceCents} />
                          </span>
                        )}
                        {o.primeExclusive && (
                          <span className="block text-xs text-muted">preço exclusivo Prime</span>
                        )}
                        {CONDITION_LABELS[o.condition] && (
                          <span className="block text-xs text-muted">
                            {CONDITION_LABELS[o.condition]}
                          </span>
                        )}
                      </td>
                      <td className={`py-2 pr-3 text-right ${strike}`}>
                        <Money cents={o.listPriceCents} empty="" />
                      </td>
                      <td className={`py-2 pr-3 text-right whitespace-nowrap ${strike}`}>
                        {o.shippingCents === 0 ? (
                          "grátis"
                        ) : (
                          <Money cents={o.shippingCents} empty="" />
                        )}
                      </td>
                      <td className={`py-2 pr-3 ${strike}`}>{o.couponText}</td>
                      <td className={`py-2 pr-3 ${strike}`}>{o.sellerName}</td>
                      <td className={`py-2 pr-3 ${strike}`}>{sourceLabel(o.source)}</td>
                      <td className="py-2">
                        {excluded ? (
                          <form
                            action={restoreObservationAction}
                            className="flex flex-col items-start gap-1"
                          >
                            <span className="text-xs">excluída: {correction.reason}</span>
                            <input type="hidden" name="observationId" value={o.id} />
                            <input type="hidden" name="productId" value={product.id} />
                            <button type="submit" className="text-xs underline">
                              Restaurar
                            </button>
                          </form>
                        ) : (
                          <div className="flex flex-col items-start gap-1">
                            {pending && (
                              <form action={confirmObservationAction}>
                                <input type="hidden" name="observationId" value={o.id} />
                                <input type="hidden" name="productId" value={product.id} />
                                <button type="submit" className="text-xs underline">
                                  Confirmar valor
                                </button>
                              </form>
                            )}
                            <details>
                              <summary className="cursor-pointer text-xs text-muted">
                                Excluir
                              </summary>
                              <form
                                action={excludeObservationAction}
                                className="mt-2 flex flex-col gap-2"
                              >
                                <input type="hidden" name="observationId" value={o.id} />
                                <input type="hidden" name="productId" value={product.id} />
                                <input
                                  name="reason"
                                  placeholder="Motivo (ex.: leitura errada)"
                                  className={`${inputClass} text-xs`}
                                />
                                <button type="submit" className={`${secondaryButtonClass} text-xs`}>
                                  Excluir da análise
                                </button>
                                <span className="text-xs text-muted">
                                  O registro original é mantido.
                                </span>
                              </form>
                            </details>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {observations.length > shownObservations.length && (
              <p className="mt-2 text-sm">
                Mostrando as {shownObservations.length} mais recentes de {observations.length}.{" "}
                <a href={`/produtos/${product.id}?obs=todas#observacoes`} className="underline">
                  Ver todas
                </a>
              </p>
            )}
          </div>
        )}
      </section>

      <section className="mt-8 border-t border-rule pt-4">
        <details>
          <summary className="cursor-pointer font-semibold">Editar produto</summary>
          <EditProductForm
            productId={product.id}
            title={product.title}
            notes={product.notes}
            targetIntervalHours={product.targetIntervalHours}
            active={product.active}
          />
        </details>
      </section>

      <p className="mt-8 text-sm">
        <Link href="/" className="underline">
          Voltar aos produtos
        </Link>
      </p>
    </>
  );
}
