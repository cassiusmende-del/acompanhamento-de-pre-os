import type { ReactNode } from "react";
import type { PriceBucket, ProductAnalytics, Sentence } from "@/analytics";
import { DateOnly, DateTime, Money } from "@/components/format";
import { inputClass, secondaryButtonClass } from "@/components/form";
import { formatDate, formatDaysAgo, formatDurationDays } from "@/domain/dates";
import {
  formatBRL,
  formatDecimal,
  formatPercentileLabel,
  formatShare,
  formatSignedBRL,
  formatSignedPercent,
} from "@/domain/money";

/*
 * Seções de análise da página do produto. Apenas apresentação: todos os números vêm de
 * `computeProductAnalytics` (src/analytics), que é puro e testado.
 */

function SectionTitle({ children, aside }: { children: ReactNode; aside?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
      <h2 className="font-semibold">{children}</h2>
      {aside && <div className="text-xs text-muted">{aside}</div>}
    </div>
  );
}

function Signed({ cents, percent }: { cents: number; percent: number }) {
  const rounded = Math.round(percent * 10) / 10;
  const tone = rounded < 0 ? "text-down" : rounded > 0 ? "text-up" : "";
  return (
    <span className={`tabular-nums ${tone}`}>
      {formatSignedBRL(cents)} <span className="text-muted">({formatSignedPercent(percent)})</span>
    </span>
  );
}

// ---------------------------------------------------------------------------
// Preço atual + números principais
// ---------------------------------------------------------------------------

export function CurrentPrice({
  a,
  now,
  sellerName,
  sourceLabel,
}: {
  a: ProductAnalytics;
  now: Date;
  sellerName: string | null;
  sourceLabel: string | null;
}) {
  if (a.counts.priced === 0 && !a.unavailableSince) {
    return <p className="mt-6 text-muted">Nenhum preço registrado ainda.</p>;
  }
  return (
    <section className="mt-6">
      {a.current ? (
        <>
          <p className="text-4xl font-semibold [font-variant-numeric:normal]">
            {formatBRL(a.current.priceCents)}
          </p>
          <p className="mt-1 text-sm text-muted">
            preço atual · <DateTime date={a.current.observedAt} /> (
            {formatDaysAgo(a.current.observedAt, now)}){sellerName && ` · ${sellerName}`}
            {sourceLabel && ` · via ${sourceLabel}`}
          </p>
          {a.current.stale && (
            <p className="mt-1 text-sm text-up">
              O último registro tem mais de {a.config.maxValidityDays} dias; o preço pode ter mudado
              desde então.
            </p>
          )}
        </>
      ) : (
        <>
          <p className="text-4xl font-semibold text-muted">indisponível</p>
          <p className="mt-1 text-sm text-muted">
            desde <DateTime date={a.unavailableSince} />
            {a.lastPriced && (
              <>
                {" "}
                · último preço registrado: <Money cents={a.lastPriced.priceCents} /> em{" "}
                <DateOnly date={a.lastPriced.observedAt} />
              </>
            )}
          </p>
        </>
      )}
    </section>
  );
}

export function KeyNumbers({ a, now }: { a: ProductAnalytics; now: Date }) {
  if (a.counts.priced === 0) return null;
  const items: Array<{ label: string; value: ReactNode; note: ReactNode }> = [
    {
      label: "Menor",
      value: <Money cents={a.lowest?.priceCents} />,
      note: a.lowest ? formatDaysAgo(a.lowest.lastAt, now) : null,
    },
    {
      label: "Média",
      value: a.average.byObservation === null ? "—" : formatBRL(a.average.byObservation),
      note:
        a.average.byTime !== null
          ? `pelo tempo: ${formatBRL(a.average.byTime)}`
          : "das observações",
    },
    {
      label: "Mediana",
      value: a.median.byObservation === null ? "—" : formatBRL(a.median.byObservation),
      note:
        a.median.byTime !== null ? `pelo tempo: ${formatBRL(a.median.byTime)}` : "das observações",
    },
    {
      label: "Maior",
      value: <Money cents={a.highest?.priceCents} />,
      note: a.highest ? formatDaysAgo(a.highest.lastAt, now) : null,
    },
    {
      label: "Observações",
      value: String(a.counts.priced),
      note:
        a.firstObservedAt !== null
          ? `desde ${formatDate(a.firstObservedAt)}${a.counts.unavailable ? ` · ${a.counts.unavailable} ${a.counts.unavailable === 1 ? "indisponível" : "indisponíveis"}` : ""}`
          : null,
    },
  ];
  return (
    <dl className="mt-6 grid grid-cols-2 gap-x-6 gap-y-4 border-y border-rule py-4 sm:grid-cols-5">
      {items.map((i) => (
        <div key={i.label}>
          <dt className="text-xs tracking-wide text-muted uppercase">{i.label}</dt>
          <dd className="mt-0.5 text-lg font-semibold">{i.value}</dd>
          {i.note && <dd className="text-xs text-muted">{i.note}</dd>}
        </div>
      ))}
    </dl>
  );
}

export function Behavior({
  sentences,
  pendingSuspect,
}: {
  sentences: Sentence[];
  pendingSuspect: number;
}) {
  if (sentences.length === 0) return null;
  return (
    <section className="mt-6">
      <SectionTitle>Comportamento</SectionTitle>
      <ul className="mt-2 space-y-1 text-sm">
        {sentences.map((s) => (
          <li key={s.key} className="flex gap-2">
            <span aria-hidden className="text-muted">
              ·
            </span>
            <span>{s.text}</span>
          </li>
        ))}
      </ul>
      {pendingSuspect > 0 && (
        <p className="mt-2 text-xs text-up">
          Estes números incluem {pendingSuspect}{" "}
          {pendingSuspect === 1 ? "registro suspeito" : "registros suspeitos"} ainda não{" "}
          {pendingSuspect === 1 ? "revisado" : "revisados"}.
        </p>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Comparação e mínimos por período
// ---------------------------------------------------------------------------

export function Comparison({ a }: { a: ProductAnalytics }) {
  if (!a.current) return null;
  const rows: Array<[string, ProductAnalytics["changes"][keyof ProductAnalytics["changes"]]]> = [
    ["Observação anterior", a.changes.fromPrevious],
    ["Média", a.changes.fromAverage],
    ["Mediana", a.changes.fromMedian],
    ["Menor preço", a.changes.fromLowest],
    ["Maior preço", a.changes.fromHighest],
  ];
  return (
    <section>
      <SectionTitle>Comparação com o preço atual</SectionTitle>
      <div className="mt-2 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-rule text-left text-muted">
              <th className="py-1.5 pr-3 font-normal">Referência</th>
              <th className="py-1.5 pr-3 text-right font-normal">Valor</th>
              <th className="py-1.5 text-right font-normal">Atual em relação</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(([label, c]) => (
              <tr key={label} className="border-b border-rule">
                <td className="py-1.5 pr-3">{label}</td>
                <td className="py-1.5 pr-3 text-right whitespace-nowrap">
                  {c ? formatBRL(c.referenceCents) : <span className="text-muted">—</span>}
                </td>
                <td className="py-1.5 text-right whitespace-nowrap">
                  {c ? (
                    <Signed cents={c.deltaCents} percent={c.percent} />
                  ) : (
                    <span className="text-muted">—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

const WINDOW_LABELS: Record<number, string> = {
  7: "7 dias",
  30: "30 dias",
  90: "90 dias",
  180: "180 dias",
  365: "1 ano",
};

export function WindowMinimums({ a }: { a: ProductAnalytics }) {
  if (a.counts.priced === 0) return null;
  return (
    <section>
      <SectionTitle>Menor preço por período</SectionTitle>
      <div className="mt-2 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-rule text-left text-muted">
              <th className="py-1.5 pr-3 font-normal">Últimos</th>
              <th className="py-1.5 pr-3 text-right font-normal">Menor</th>
              <th className="py-1.5 font-normal">Cobertura</th>
            </tr>
          </thead>
          <tbody>
            {a.windows.map((w) => (
              <tr key={w.days} className="border-b border-rule align-top">
                <td className="py-1.5 pr-3 whitespace-nowrap">
                  {WINDOW_LABELS[w.days] ?? `${w.days} dias`}
                </td>
                <td className="py-1.5 pr-3 text-right whitespace-nowrap">
                  {w.minCents === null ? (
                    <span className="text-muted">sem dados</span>
                  ) : (
                    formatBRL(w.minCents)
                  )}
                </td>
                <td className="py-1.5 text-xs text-muted">
                  {w.status === "complete"
                    ? "período coberto"
                    : w.status === "partial"
                      ? `parcial: dados em ${formatDecimal(Math.min(w.coveredDays, w.days), 0)} de ${w.days} dias`
                      : "nenhum registro no período"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Posição e distribuição
// ---------------------------------------------------------------------------

export function Position({ a }: { a: ProductAnalytics }) {
  if (!a.current || !a.lowest || !a.highest) return null;
  const range = a.position.range;
  const p = a.position.percentile;
  const rank = a.position.rank;
  return (
    <section>
      <SectionTitle>Posição do preço atual no histórico</SectionTitle>
      <div className="mt-3">
        <div className="relative h-2 rounded-full bg-band" aria-hidden>
          {range !== null && (
            <span
              className="absolute top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-background bg-series-1"
              style={{ left: `${Math.min(100, Math.max(0, range))}%` }}
            />
          )}
        </div>
        <div className="mt-1 flex justify-between text-xs text-muted">
          <span>menor {formatBRL(a.lowest.priceCents)}</span>
          <span>maior {formatBRL(a.highest.priceCents)}</span>
        </div>
      </div>
      <dl className="mt-4 grid grid-cols-1 gap-4 text-sm sm:grid-cols-3">
        <div>
          <dt className="text-xs text-muted">Posição na faixa</dt>
          <dd className="text-lg font-semibold">
            {range === null ? "—" : `${formatDecimal(range, 0)}%`}
          </dd>
          <dd className="text-xs text-muted">
            {range === null ? "o preço nunca variou" : "0% = menor preço; 100% = maior"}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-muted">Percentil</dt>
          {p.status === "ok" ? (
            <>
              <dd className="text-lg font-semibold">{formatPercentileLabel(p.byObservation)}</dd>
              <dd className="text-xs text-muted">
                {formatShare(p.byObservation)} das observações foram iguais ou menores
                {p.byTime !== null && ` (${formatShare(p.byTime)} do tempo)`}
              </dd>
            </>
          ) : (
            <>
              <dd className="text-lg font-semibold text-muted">—</dd>
              <dd className="text-xs text-muted">
                {p.status === "insufficient"
                  ? `dados insuficientes: ${p.observations} de ${p.requiredObservations} observações, ${formatDecimal(p.spanDays, 0)} de ${p.requiredSpanDays} dias`
                  : "sem preço atual"}
              </dd>
            </>
          )}
        </div>
        <div>
          <dt className="text-xs text-muted">Entre os valores observados</dt>
          <dd className="text-lg font-semibold">{rank ? `${rank.rank}º menor` : "—"}</dd>
          {rank && (
            <dd className="text-xs text-muted">
              de {rank.distinctLevels} valores diferentes; {rank.observationsBelow} de{" "}
              {rank.totalObservations} observações abaixo do atual
            </dd>
          )}
        </div>
      </dl>
      <p className="mt-2 text-xs text-muted">
        Percentil: porcentagem das observações com preço igual ou menor que o atual. Descreve o
        histórico registrado; não indica se o preço vai cair ou subir.
      </p>
    </section>
  );
}

export function Distribution({
  bands,
  widthCents,
  currentCents,
  validityDays,
}: {
  bands: PriceBucket[];
  widthCents: number;
  currentCents: number | null;
  validityDays: number;
}) {
  if (bands.length < 2) return null;
  const maxObs = Math.max(...bands.map((b) => b.observations));
  const fmt = (c: number) =>
    `R$ ${Math.round(c / 100)
      .toString()
      .replace(/\B(?=(\d{3})+(?!\d))/g, ".")}`;
  return (
    <section>
      <SectionTitle aside={`faixas de ${fmt(widthCents)}`}>
        Frequência por faixa de preço
      </SectionTitle>
      <div className="mt-2 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-rule text-left text-muted">
              <th className="py-1.5 pr-3 font-normal">Faixa</th>
              <th className="py-1.5 pr-3 font-normal">
                <span className="sr-only">Proporção</span>
              </th>
              <th className="py-1.5 pr-3 text-right font-normal">Observações</th>
              <th className="py-1.5 pr-3 text-right font-normal">Dias</th>
              <th
                className="py-1.5 text-right font-normal"
                title="Quantas vezes o preço entrou nesta faixa"
              >
                Ocorrências
              </th>
            </tr>
          </thead>
          <tbody>
            {bands.map((b) => {
              const isCurrent =
                currentCents !== null && currentCents >= b.fromCents && currentCents < b.toCents;
              return (
                <tr key={b.fromCents} className="border-b border-rule">
                  <td className="py-1.5 pr-3 whitespace-nowrap tabular-nums">
                    {fmt(b.fromCents)} – {fmt(b.toCents - 1)}
                    {isCurrent && <span className="ml-2 text-xs text-muted">atual</span>}
                  </td>
                  <td className="w-1/3 py-1.5 pr-3">
                    <div
                      className={`h-3 rounded-r ${isCurrent ? "bg-series-1" : "bg-muted/40"}`}
                      style={{
                        width: `${Math.max(2, (b.observations / maxObs) * 100)}%`,
                        maxWidth: "100%",
                      }}
                    />
                  </td>
                  <td className="py-1.5 pr-3 text-right tabular-nums">{b.observations}</td>
                  <td className="py-1.5 pr-3 text-right tabular-nums">
                    {formatDecimal(b.timeMs / 86_400_000, 1)}
                  </td>
                  <td className="py-1.5 text-right tabular-nums">{b.episodes}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-xs text-muted">
        Dias: tempo em que o preço ficou na faixa (cada registro vale até o seguinte, até{" "}
        {validityDays} dias). Ocorrências: quantas vezes o preço entrou na faixa.
      </p>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Períodos de preço baixo
// ---------------------------------------------------------------------------

const END_LABELS: Record<string, string> = {
  price_above: "preço subiu",
  unavailable: "ficou indisponível",
  gap: "sem dados depois",
  ongoing: "em andamento",
};

export function LowPrices({
  a,
  productId,
  thresholdInput,
}: {
  a: ProductAnalytics;
  productId: string;
  thresholdInput: string;
}) {
  if (a.counts.priced === 0) return null;
  const lp = a.lowPrice;
  const episodes = [...lp.episodes].reverse();
  return (
    <section>
      <SectionTitle>Períodos de preço baixo</SectionTitle>
      <form
        method="get"
        action={`/produtos/${productId}#preco-baixo`}
        className="mt-2 flex flex-wrap items-end gap-2 text-sm"
      >
        <label className="flex flex-col gap-1">
          <span className="text-xs text-muted">Considerar baixo até (R$)</span>
          <input
            name="limite"
            defaultValue={thresholdInput}
            placeholder={
              lp.threshold.status === "ok" && lp.threshold.basis === "percentile"
                ? formatDecimal(lp.threshold.cents / 100, 2)
                : "650,00"
            }
            inputMode="decimal"
            className={`${inputClass} w-32`}
          />
        </label>
        <button type="submit" className={secondaryButtonClass}>
          Aplicar
        </button>
        {thresholdInput && (
          <a href={`/produtos/${productId}#preco-baixo`} className="pb-1.5 text-xs underline">
            voltar ao padrão
          </a>
        )}
      </form>

      {lp.threshold.status === "insufficient" ? (
        <p className="mt-3 text-sm text-muted">
          Sem um valor informado, o limite é o percentil {lp.threshold.percentile} do histórico, que
          exige pelo menos {a.config.percentileMinObservations} observações em{" "}
          {a.config.percentileMinSpanDays} dias. Informe um valor acima para ver os períodos.
        </p>
      ) : (
        <>
          <p className="mt-3 text-sm">
            Limite: {formatBRL(lp.threshold.cents)}{" "}
            <span className="text-muted">
              {lp.threshold.basis === "percentile"
                ? `(percentil ${lp.threshold.percentile}: os ${lp.threshold.percentile}% menores preços registrados)`
                : "(informado por você)"}
            </span>
            {lp.share && lp.share.byObservation !== null && (
              <>
                {" "}
                · em ou abaixo dele em {formatShare(lp.share.byObservation)} das observações
                {lp.share.byTime !== null && ` e ${formatShare(lp.share.byTime)} do tempo`}
              </>
            )}
          </p>
          {episodes.length === 0 ? (
            <p className="mt-2 text-sm text-muted">Nenhum registro em ou abaixo desse valor.</p>
          ) : (
            <div className="mt-2 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-rule text-left text-muted">
                    <th className="py-1.5 pr-3 font-normal">Início</th>
                    <th className="py-1.5 pr-3 font-normal">Duração</th>
                    <th className="py-1.5 pr-3 text-right font-normal">Menor</th>
                    <th className="py-1.5 pr-3 text-right font-normal">Antes</th>
                    <th className="py-1.5 pr-3 text-right font-normal">Depois</th>
                    <th className="py-1.5 font-normal">Fim</th>
                  </tr>
                </thead>
                <tbody>
                  {episodes.map((e) => (
                    <tr key={e.startAt.toISOString()} className="border-b border-rule">
                      <td className="py-1.5 pr-3 whitespace-nowrap">
                        <DateOnly date={e.startAt} />
                      </td>
                      <td className="py-1.5 pr-3 whitespace-nowrap">
                        {e.durationMaxMs !== null && e.durationMaxMs > e.durationMinMs
                          ? `${formatDurationDays(e.durationMinMs)} a ${formatDurationDays(e.durationMaxMs)}`
                          : `pelo menos ${formatDurationDays(e.durationMinMs)}`}
                        <span className="ml-1 text-xs text-muted">
                          ({e.observationCount}{" "}
                          {e.observationCount === 1 ? "registro" : "registros"})
                        </span>
                      </td>
                      <td className="py-1.5 pr-3 text-right whitespace-nowrap">
                        {formatBRL(e.minPriceCents)}
                      </td>
                      <td className="py-1.5 pr-3 text-right whitespace-nowrap">
                        <Money cents={e.priceBeforeCents} />
                      </td>
                      <td className="py-1.5 pr-3 text-right whitespace-nowrap">
                        <Money cents={e.priceAfterCents} />
                      </td>
                      <td className="py-1.5 text-xs whitespace-nowrap text-muted">
                        {END_LABELS[e.endReason]}
                        {e.endAt && <> em {formatDate(e.endAt)}</>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="mt-2 text-xs text-muted">
            Duração: o momento exato da mudança entre dois registros é desconhecido, por isso
            aparece como intervalo (do primeiro ao último registro baixo, até do registro anterior
            ao seguinte).
          </p>
        </>
      )}
    </section>
  );
}
