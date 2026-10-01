import { formatDate, formatDaysAgo, formatDurationDays } from "@/domain/dates";
import { formatBRL, formatDecimal, formatPercent } from "@/domain/money";
import type { ProductAnalytics } from "./summary";

/**
 * Frases descritivas geradas a partir das métricas. Cada frase só aparece quando a
 * métrica que a sustenta existe. Nenhuma frase recomenda compra nem faz previsão.
 */
export interface Sentence {
  key: string;
  text: string;
}

function pct(value: number): string {
  return formatPercent(Math.abs(value));
}

function sharePct(value: number): string {
  return formatPercent(value, 0);
}

export function describe(a: ProductAnalytics, now: Date = a.computedAt): Sentence[] {
  const out: Sentence[] = [];
  const add = (key: string, text: string) => out.push({ key, text });

  if (a.counts.priced === 0) {
    if (a.unavailableSince) {
      add(
        "unavailable",
        `Indisponível desde ${formatDate(a.unavailableSince)}. Nenhum preço registrado ainda.`,
      );
    } else {
      add("empty", "Nenhum preço registrado ainda.");
    }
    return out;
  }

  if (!a.current) {
    if (a.unavailableSince && a.lastPriced) {
      add(
        "unavailable",
        `Indisponível desde ${formatDate(a.unavailableSince)}. Último preço registrado: ${formatBRL(
          a.lastPriced.priceCents,
        )}, em ${formatDate(a.lastPriced.observedAt)}.`,
      );
    }
    return out;
  }

  const current = a.current;
  if (current.stale) {
    add(
      "stale",
      `O registro mais recente é de ${formatDate(current.observedAt)} (${formatDaysAgo(current.observedAt, now)}).`,
    );
  }

  const prev = a.changes.fromPrevious;
  if (prev) {
    if (prev.deltaCents < 0) {
      add(
        "from_previous",
        `Preço caiu ${pct(prev.percent)} desde a observação anterior (${formatBRL(prev.referenceCents)} → ${formatBRL(current.priceCents)}).`,
      );
    } else if (prev.deltaCents > 0) {
      add(
        "from_previous",
        `Preço subiu ${pct(prev.percent)} desde a observação anterior (${formatBRL(prev.referenceCents)} → ${formatBRL(current.priceCents)}).`,
      );
    } else {
      add(
        "from_previous",
        `Preço igual ao da observação anterior (${formatBRL(current.priceCents)}).`,
      );
    }
  } else {
    add("first", "Este é o primeiro preço registrado; ainda não há histórico para comparar.");
    return out;
  }

  const avg = a.changes.fromAverage;
  if (avg) {
    const direction =
      Math.round(avg.deltaCents) === 0
        ? "igual à média das observações"
        : `${pct(avg.percent)} ${avg.deltaCents < 0 ? "abaixo" : "acima"} da média das observações`;
    add("from_average", `O preço atual está ${direction} (${formatBRL(avg.referenceCents)}).`);
  }

  const low = a.changes.fromLowest;
  if (low && a.lowest) {
    if (low.deltaCents === 0) {
      const others = a.lowest.count - 1;
      add(
        "from_lowest",
        others > 0
          ? `O preço atual é igual ao menor preço já registrado, observado também em ${others} ${others === 1 ? "outra ocasião" : "outras ocasiões"}.`
          : "O preço atual é o menor preço já registrado.",
      );
    } else {
      add(
        "from_lowest",
        `O preço atual está ${pct(low.percent)} acima do menor preço registrado (${formatBRL(
          a.lowest.priceCents,
        )}, ${formatDaysAgo(a.lowest.lastAt, now)}).`,
      );
    }
  }

  const below = a.position.below;
  if (below && below.totalObservations > 0) {
    if (below.observations === 0) {
      add("below", "Nenhuma observação registrou preço abaixo do atual.");
    } else {
      const time = below.byTime !== null ? `; ${sharePct(below.byTime)} do tempo monitorado` : "";
      add(
        "below",
        `Já houve registros abaixo do preço atual: ${below.observations} de ${below.totalObservations} observações (${sharePct(
          below.byObservation ?? 0,
        )}${time}).`,
      );
    }
  }

  const rank = a.position.rank;
  if (rank && rank.distinctLevels > 1) {
    add(
      "rank",
      rank.rank === 1
        ? `É o menor valor entre ${rank.distinctLevels} valores diferentes observados.`
        : `É o ${rank.rank}º menor valor entre ${rank.distinctLevels} valores diferentes observados.`,
    );
  }

  const p = a.position.percentile;
  if (p.status === "ok") {
    const time =
      p.byTime !== null
        ? ` Considerando o tempo, o preço esteve igual ou abaixo do atual em ${sharePct(p.byTime)} do período monitorado.`
        : "";
    add(
      "percentile",
      `Percentil ${formatDecimal(p.byObservation, 0)}: cerca de ${sharePct(p.byObservation)} das observações tiveram preço igual ou inferior ao atual.${time}`,
    );
  } else if (p.status === "insufficient") {
    add(
      "percentile",
      `Dados insuficientes para percentil: ${p.observations} observações em ${formatDecimal(p.spanDays, 0)} dias (mínimo: ${p.requiredObservations} observações em ${p.requiredSpanDays} dias).`,
    );
  }

  const lp = a.lowPrice;
  if (lp.threshold.status === "ok") {
    const t = lp.threshold;
    const label =
      t.basis === "user"
        ? formatBRL(t.cents)
        : `${formatBRL(t.cents)} (percentil ${t.percentile} do histórico)`;
    if (lp.share) {
      const time = lp.share.byTime !== null ? ` e ${sharePct(lp.share.byTime)} do tempo` : "";
      add(
        "low_share",
        `O preço esteve em ou abaixo de ${label} em ${sharePct(lp.share.byObservation ?? 0)} das observações${time}.`,
      );
    }
    const lastEpisode = lp.episodes[lp.episodes.length - 1];
    if (lastEpisode) {
      add("low_last_episode", describeEpisodeDuration(lastEpisode, t.cents));
    }
  }

  return out;
}

function describeEpisodeDuration(
  e: ProductAnalytics["lowPrice"]["episodes"][number],
  thresholdCents: number,
): string {
  const start = formatDate(e.startAt);
  const limit = formatBRL(thresholdCents);
  if (e.endReason === "ongoing") {
    return `Desde ${start}, o preço está em ou abaixo de ${limit} (${e.observationCount} ${e.observationCount === 1 ? "observação" : "observações"}).`;
  }
  const min = formatDurationDays(e.durationMinMs);
  if (e.durationMaxMs !== null && e.durationMaxMs > e.durationMinMs) {
    return `Na última ocorrência em ou abaixo de ${limit} (a partir de ${start}), o preço permaneceu assim entre ${min} e ${formatDurationDays(e.durationMaxMs)}.`;
  }
  if (e.endReason === "gap") {
    return `Na última ocorrência em ou abaixo de ${limit} (a partir de ${start}), há registros por pelo menos ${min}; depois disso houve um período sem dados.`;
  }
  return `Na última ocorrência em ou abaixo de ${limit} (a partir de ${start}), o preço permaneceu assim por pelo menos ${min}.`;
}
