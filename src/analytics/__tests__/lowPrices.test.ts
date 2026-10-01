import { describe, expect, it } from "vitest";
import { DAY_MS } from "../config";
import { applyCorrections } from "../corrections";
import { lowPriceEpisodes } from "../lowPrices";
import { d, obs } from "./fixtures";

const SEVEN_DAYS = 7 * DAY_MS;

function daily(from: string, prices: Array<number | null>) {
  const start = d(from).getTime();
  return prices.map((p, i) => obs(new Date(start + i * DAY_MS), p));
}

describe("lowPriceEpisodes", () => {
  it("promoção de 799 para 649 entre 10/09 e 14/09", () => {
    const list = daily("2026-09-01", [
      ...Array(9).fill(79900), // 01..09
      64900,
      64900,
      64900,
      64900, // 10..13
      79900, // 14
    ]);
    const [e, ...rest] = lowPriceEpisodes(
      applyCorrections(list),
      65000,
      SEVEN_DAYS,
      d("2026-09-20"),
    );
    expect(rest).toHaveLength(0);
    expect(e).toMatchObject({
      startAt: d("2026-09-10"),
      lastLowAt: d("2026-09-13"),
      endAt: d("2026-09-14"),
      endReason: "price_above",
      minPriceCents: 64900,
      observationCount: 4,
      priceBeforeCents: 79900,
      priceAfterCents: 79900,
    });
    expect(e.durationMinMs).toBe(3 * DAY_MS);
    expect(e.durationMaxMs).toBe(5 * DAY_MS);
  });

  it("indisponibilidade encerra o período sem inventar preço", () => {
    const list = daily("2026-09-01", [70000, 60000, null]);
    const [e] = lowPriceEpisodes(applyCorrections(list), 65000, SEVEN_DAYS, d("2026-09-10"));
    expect(e).toMatchObject({ endReason: "unavailable", priceAfterCents: null, durationMinMs: 0 });
    expect(e.durationMaxMs).toBe(2 * DAY_MS);
  });

  it("lacuna maior que a validade divide o período", () => {
    const list = [
      obs("2026-09-01", 70000),
      obs("2026-09-02", 60000),
      obs("2026-09-20", 60000),
      obs("2026-09-21", 70000),
    ];
    const episodes = lowPriceEpisodes(applyCorrections(list), 65000, SEVEN_DAYS, d("2026-09-25"));
    expect(episodes.map((e) => e.endReason)).toEqual(["gap", "price_above"]);
    expect(episodes[0].durationMaxMs).toBeNull();
    // o segundo começa após a lacuna: início desconhecido → sem limite máximo
    expect(episodes[1].durationMaxMs).toBeNull();
    expect(episodes[1].priceBeforeCents).toBeNull();
  });

  it("período em andamento e sem observação anterior", () => {
    const list = daily("2026-09-01", [60000, 59000]);
    const [e] = lowPriceEpisodes(applyCorrections(list), 65000, SEVEN_DAYS, d("2026-09-03"));
    expect(e).toMatchObject({
      endReason: "ongoing",
      minPriceCents: 59000,
      priceBeforeCents: null,
      durationMaxMs: null,
    });
  });

  it("período encerrado por falta de dados recentes", () => {
    const list = daily("2026-09-01", [60000]);
    const [e] = lowPriceEpisodes(applyCorrections(list), 65000, SEVEN_DAYS, d("2026-09-30"));
    expect(e.endReason).toBe("gap");
  });
});
