"use client";

import { useEffect, useMemo, useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceArea,
  ReferenceDot,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { clipChartSeries, niceTicks, priceExtent, type ChartSeries } from "@/analytics/chart";
import { formatDateTime, DISPLAY_TIME_ZONE } from "@/domain/dates";
import { formatBRL } from "@/domain/money";

const DAY_MS = 86_400_000;

const RANGES = [
  { key: "7", label: "7 dias", days: 7 },
  { key: "30", label: "30 dias", days: 30 },
  { key: "90", label: "90 dias", days: 90 },
  { key: "180", label: "180 dias", days: 180 },
  { key: "365", label: "1 ano", days: 365 },
  { key: "all", label: "Tudo", days: null },
] as const;

type RangeKey = (typeof RANGES)[number]["key"];

interface Colors {
  series: string;
  muted: string;
  rule: string;
  band: string;
  surface: string;
  text: string;
}

const LIGHT: Colors = {
  series: "#2a78d6",
  muted: "#6b6b6b",
  rule: "#e2e2e2",
  band: "#efefed",
  surface: "#ffffff",
  text: "#1a1a1a",
};

/** Lê as cores do tema (CSS) e acompanha a troca entre claro e escuro. */
function useThemeColors(): Colors {
  const [colors, setColors] = useState<Colors>(LIGHT);
  useEffect(() => {
    const read = () => {
      const css = getComputedStyle(document.documentElement);
      const v = (name: string, fallback: string) => css.getPropertyValue(name).trim() || fallback;
      setColors({
        series: v("--series-1", LIGHT.series),
        muted: v("--muted", LIGHT.muted),
        rule: v("--rule", LIGHT.rule),
        band: v("--band", LIGHT.band),
        surface: v("--background", LIGHT.surface),
        text: v("--foreground", LIGHT.text),
      });
    };
    read();
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    media.addEventListener("change", read);
    return () => media.removeEventListener("change", read);
  }, []);
  return colors;
}

const dayMonth = new Intl.DateTimeFormat("pt-BR", {
  timeZone: DISPLAY_TIME_ZONE,
  day: "2-digit",
  month: "2-digit",
});
const monthYear = new Intl.DateTimeFormat("pt-BR", {
  timeZone: DISPLAY_TIME_ZONE,
  month: "short",
  year: "2-digit",
});

function axisReais(cents: number): string {
  return `R$ ${Math.round(cents / 100)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ".")}`;
}

/** Rótulo de linha de referência com contorno da cor do fundo, legível sobre a linha do preço. */
function refLabel(text: string, below: boolean, colors: Colors) {
  function RefLabel(props: { viewBox?: { x?: number; y?: number } }) {
    const vb = props.viewBox ?? {};
    return (
      <text
        x={(vb.x ?? 0) + 6}
        y={(vb.y ?? 0) + (below ? 14 : -5)}
        fill={colors.muted}
        fontSize={12}
        stroke={colors.surface}
        strokeWidth={4}
        paintOrder="stroke"
        strokeLinejoin="round"
      >
        {text}
      </text>
    );
  }
  return RefLabel;
}

export interface PriceChartProps {
  series: ChartSeries;
  /** Momento do cálculo (fim do eixo). */
  now: number;
  /** Início do histórico (para o período "Tudo"). */
  firstAt: number | null;
  lowestCents: number | null;
  medianCents: number | null;
}

export function PriceChart({ series, now, firstAt, lowestCents, medianCents }: PriceChartProps) {
  const colors = useThemeColors();
  const [range, setRange] = useState<RangeKey>("all");

  const view = useMemo(() => {
    const days = RANGES.find((r) => r.key === range)?.days ?? null;
    const from = days === null ? (firstAt ?? now - DAY_MS) : now - days * DAY_MS;
    const clipped = clipChartSeries(series, from);
    const extent = priceExtent(clipped.points);
    let domain: [number, number] | null = null;
    let ticks: number[] = [];
    if (extent) {
      // Inclui menor preço e mediana do histórico inteiro para manter o contexto.
      const lo = Math.min(extent[0], lowestCents ?? extent[0], medianCents ?? extent[0]);
      const hi = Math.max(extent[1], medianCents ?? extent[1]);
      ticks = niceTicks(lo, hi);
      domain = [ticks[0], ticks[ticks.length - 1]];
    }
    return { from, to: now, clipped, domain, ticks, spanDays: (now - from) / DAY_MS };
  }, [range, series, now, firstAt, lowestCents, medianCents]);

  const last = [...view.clipped.points].reverse().find((p) => p.price !== null) ?? null;
  const lastIsCurrent =
    last !== null &&
    series.points.length > 0 &&
    series.points[series.points.length - 1].price !== null;

  const PLOT_HEIGHT = 260;
  // Evita sobrepor os rótulos de menor preço e mediana quando estão muito próximos.
  let lowestLabelBelow = false;
  if (view.domain && lowestCents !== null && medianCents !== null) {
    const pxPerCent = PLOT_HEIGHT / (view.domain[1] - view.domain[0]);
    lowestLabelBelow = Math.abs(medianCents - lowestCents) * pxPerCent < 16;
  }

  const tickFormatter = (t: number) =>
    view.spanDays > 200 ? monthYear.format(t) : dayMonth.format(t);
  const inBand = (t: number) => view.clipped.unavailable.some((b) => t >= b.from && t <= b.to);

  return (
    <div>
      <div role="group" aria-label="Período do gráfico" className="flex flex-wrap gap-1 text-sm">
        {RANGES.map((r) => {
          return (
            <button
              key={r.key}
              type="button"
              onClick={() => setRange(r.key)}
              aria-pressed={range === r.key}
              className={`rounded border px-2 py-0.5 ${
                range === r.key
                  ? "border-foreground font-semibold"
                  : "border-rule text-muted hover:border-foreground"
              }`}
            >
              {r.label}
            </button>
          );
        })}
      </div>

      {!view.domain ? (
        <p className="mt-4 text-sm text-muted">Nenhum preço registrado neste período.</p>
      ) : (
        <div className="mt-3 h-[300px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart
              data={view.clipped.points}
              margin={{ top: 20, right: 24, bottom: 0, left: 0 }}
            >
              <CartesianGrid vertical={false} stroke={colors.rule} strokeWidth={1} />
              <XAxis
                dataKey="t"
                type="number"
                scale="time"
                domain={[view.from, view.to]}
                tickFormatter={tickFormatter}
                tick={{ fill: colors.muted, fontSize: 12 }}
                axisLine={{ stroke: colors.rule }}
                tickLine={false}
                minTickGap={40}
              />
              <YAxis
                domain={view.domain}
                ticks={view.ticks}
                tickFormatter={axisReais}
                tick={{ fill: colors.muted, fontSize: 12 }}
                axisLine={false}
                tickLine={false}
                width={80}
                interval={0}
              />
              {view.clipped.unavailable.map((b) => (
                <ReferenceArea
                  key={b.from}
                  x1={b.from}
                  x2={b.to}
                  fill={colors.band}
                  fillOpacity={1}
                  stroke="none"
                  ifOverflow="hidden"
                />
              ))}
              {medianCents !== null && (
                <ReferenceLine
                  y={medianCents}
                  stroke={colors.muted}
                  strokeWidth={1}
                  label={refLabel(`mediana ${formatBRL(medianCents)}`, false, colors)}
                />
              )}
              {lowestCents !== null && (
                <ReferenceLine
                  y={lowestCents}
                  stroke={colors.muted}
                  strokeWidth={1}
                  label={refLabel(`menor ${formatBRL(lowestCents)}`, lowestLabelBelow, colors)}
                />
              )}
              <Tooltip
                cursor={{ stroke: colors.muted, strokeWidth: 1 }}
                isAnimationActive={false}
                content={({ active, payload, label }) => {
                  if (!active || label === undefined) return null;
                  const t = Number(label);
                  const price = payload?.[0]?.value as number | null | undefined;
                  return (
                    <div
                      className="rounded border px-2 py-1 text-sm shadow-sm"
                      style={{
                        background: colors.surface,
                        borderColor: colors.rule,
                        color: colors.text,
                      }}
                    >
                      <div className="font-semibold tabular-nums">
                        {price === null || price === undefined
                          ? inBand(t)
                            ? "indisponível"
                            : "sem dados"
                          : formatBRL(price)}
                      </div>
                      <div style={{ color: colors.muted }}>{formatDateTime(new Date(t))}</div>
                    </div>
                  );
                }}
              />
              <Line
                type="stepAfter"
                dataKey="price"
                stroke={colors.series}
                strokeWidth={2}
                strokeLinejoin="round"
                strokeLinecap="round"
                dot={false}
                activeDot={{ r: 4, fill: colors.series, stroke: colors.surface, strokeWidth: 2 }}
                connectNulls={false}
                isAnimationActive={false}
              />
              {last && (
                <ReferenceDot
                  x={last.t}
                  y={last.price as number}
                  r={4}
                  fill={colors.series}
                  stroke={colors.surface}
                  strokeWidth={2}
                  label={
                    lastIsCurrent
                      ? (props: { viewBox?: { x?: number; y?: number; width?: number } }) => {
                          const vb = props.viewBox ?? {};
                          const cx = (vb.x ?? 0) + (vb.width ?? 0) / 2;
                          return (
                            // Ancorado à direita do ponto para não ser cortado na borda do gráfico.
                            <text
                              x={cx + 6}
                              y={(vb.y ?? 0) - 6}
                              textAnchor="end"
                              fill={colors.text}
                              fontSize={12}
                            >
                              {formatBRL(last.price as number)}
                            </text>
                          );
                        }
                      : undefined
                  }
                />
              )}
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
      <p className="mt-2 text-xs text-muted">
        Cada preço vale até o registro seguinte (até 7 dias); depois disso a linha é interrompida
        por falta de dados. Faixas cinza: produto indisponível. Linhas horizontais: menor preço e
        mediana de todo o histórico.{" "}
        <a href="#observacoes" className="underline">
          Ver os dados em tabela
        </a>
        .
      </p>
    </div>
  );
}
