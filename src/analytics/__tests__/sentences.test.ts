import { describe, expect, it } from "vitest";
import { DAY_MS } from "../config";
import { describe as describeProduct } from "../sentences";
import { computeProductAnalytics } from "../summary";
import type { ObservationInput } from "../types";
import { d, distributionSeries, obs, weeklySeries } from "./fixtures";

function texts(observations: ObservationInput[], now: Date, threshold?: number) {
  const a = computeProductAnalytics({ observations, now, lowPriceThresholdCents: threshold });
  return Object.fromEntries(describeProduct(a, now).map((s) => [s.key, s.text]));
}

describe("frases descritivas", () => {
  it("série semanal", () => {
    const t = texts(weeklySeries(), d("2026-09-12", 18));
    expect(t.from_previous).toBe(
      "Preço caiu 7,1% desde a observação anterior (R$ 699,90 → R$ 649,90).",
    );
    expect(t.from_average).toBe(
      "O preço atual está 9,2% abaixo da média das observações (R$ 715,61).",
    );
    expect(t.from_lowest).toBe("O preço atual é o menor preço já registrado.");
    expect(t.below).toBe("Nenhuma observação registrou preço abaixo do atual.");
    expect(t.rank).toBe("É o menor valor entre 6 valores diferentes observados.");
    expect(t.percentile).toBe(
      "Dados insuficientes para percentil: 7 observações em 42 dias (mínimo: 20 observações em 14 dias).",
    );
    expect(t.stale).toBeUndefined();
  });

  it("distribuição do enunciado", () => {
    const t = texts(distributionSeries(), d("2026-07-30", 18));
    expect(t.from_lowest).toBe(
      "O preço atual está 8,3% acima do menor preço registrado (R$ 599,00, há 5 dias).",
    );
    expect(t.below).toBe(
      "Já houve registros abaixo do preço atual: 1 de 60 observações (2%; 2% do tempo monitorado).",
    );
    expect(t.rank).toBe("É o 2º menor valor entre 5 valores diferentes observados.");
    expect(t.percentile).toMatch(
      /^Percentil 10: cerca de 10% das observações tiveram preço igual ou inferior ao atual\./,
    );
    expect(t.low_share).toBe(
      "O preço esteve em ou abaixo de R$ 649,00 (percentil 10 do histórico) em 10% das observações e 9% do tempo.",
    );
  });

  it("falsa promoção: preço acima da média e registros mais baixos", () => {
    const list = [
      ...Array.from({ length: 10 }, (_, i) =>
        obs(new Date(d("2026-08-01").getTime() + i * DAY_MS), 74900),
      ),
      obs("2026-08-11", 69900),
      obs("2026-08-12", 99900),
      obs("2026-08-13", 79900, { listPriceCents: 99900 }),
    ];
    const t = texts(list, d("2026-08-13", 18));
    expect(t.from_average).toMatch(/acima da média das observações/);
    expect(t.below).toMatch(/^Já houve registros abaixo do preço atual/);
  });

  it("produto indisponível e preço desatualizado", () => {
    const unavailable = texts([obs("2026-09-01", 50000), obs("2026-09-02", null)], d("2026-09-03"));
    expect(unavailable.unavailable).toBe(
      "Indisponível desde 02/09/2026. Último preço registrado: R$ 500,00, em 01/09/2026.",
    );
    const stale = texts([obs("2026-09-01", 50000), obs("2026-09-02", 49000)], d("2026-09-20"));
    expect(stale.stale).toBe("O registro mais recente é de 02/09/2026 (há 18 dias).");
  });

  it("promoção encerrada é descrita com limites de duração", () => {
    const start = d("2026-09-01").getTime();
    const prices = [...Array(9).fill(79900), 64900, 64900, 64900, 64900, 79900];
    const list = prices.map((p, i) => obs(new Date(start + i * DAY_MS), p));
    const t = texts(list, d("2026-09-15"), 65000);
    expect(t.low_last_episode).toBe(
      "Na última ocorrência em ou abaixo de R$ 650,00 (a partir de 10/09/2026), o preço permaneceu assim entre 3 dias e 5 dias.",
    );
  });

  it("nunca recomenda compra nem faz previsão", () => {
    const forbidden =
      /\bcompr|oportunidade|vai (cair|subir)|tende|deve (cair|subir)|previs|recomend|aproveite|barganha/i;
    let seed = 42;
    const random = () => (seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31;
    for (let run = 0; run < 200; run++) {
      const n = 1 + Math.floor(random() * 80);
      const start = d("2026-01-01").getTime();
      const list: ObservationInput[] = [];
      let t = start;
      for (let i = 0; i < n; i++) {
        t += Math.floor(random() * 5 * DAY_MS);
        list.push(
          obs(new Date(t), random() < 0.1 ? null : 50000 + Math.floor(random() * 40) * 1000),
        );
      }
      const now = new Date(t + Math.floor(random() * 15 * DAY_MS));
      const threshold = random() < 0.5 ? 60000 : undefined;
      for (const text of Object.values(texts(list, now, threshold))) {
        expect(text).not.toMatch(forbidden);
        expect(text).not.toMatch(/NaN|undefined|null|Infinity/);
      }
    }
  });
});
