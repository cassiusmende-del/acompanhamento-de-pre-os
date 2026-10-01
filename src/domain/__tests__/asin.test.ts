import { describe, expect, it } from "vitest";
import { parseAsin, productUrl } from "../asin";

describe("parseAsin", () => {
  it.each([
    ["B0BHJJ9Y77", "B0BHJJ9Y77"],
    [" b0bhjj9y77 ", "B0BHJJ9Y77"],
    [
      "https://www.amazon.com.br/Samsung-990-PRO/dp/B0BHJJ9Y77/ref=sr_1_1?keywords=ssd",
      "B0BHJJ9Y77",
    ],
    ["https://www.amazon.com.br/dp/B0BHJJ9Y77", "B0BHJJ9Y77"],
    ["amazon.com.br/gp/product/B0BHJJ9Y77?th=1", "B0BHJJ9Y77"],
    ["https://www.amazon.com.br/gp/aw/d/B0BHJJ9Y77", "B0BHJJ9Y77"],
    ["https://www.amazon.com.br/gp/offer-listing/B0BHJJ9Y77", "B0BHJJ9Y77"],
    ["https://www.amazon.com.br/exec/obidos/ASIN/8535914846", "8535914846"],
    ["https://www.amazon.com.br/s?k=ssd&asin=B0BHJJ9Y77", "B0BHJJ9Y77"],
  ])("%s", (input, asin) => {
    const r = parseAsin(input);
    expect(r).toMatchObject({ ok: true, asin });
  });

  it("identifica o marketplace e sinaliza outro país", () => {
    expect(parseAsin("https://www.amazon.com.br/dp/B0BHJJ9Y77")).toEqual({
      ok: true,
      asin: "B0BHJJ9Y77",
      marketplace: "amazon.com.br",
      otherMarketplace: false,
    });
    expect(parseAsin("https://www.amazon.com/dp/B0BHJJ9Y77")).toMatchObject({
      marketplace: "amazon.com",
      otherMarketplace: true,
    });
  });

  it("recusa link curto, outros sites e entradas sem ASIN", () => {
    expect(parseAsin("https://amzn.to/3abcdE")).toEqual({ ok: false, reason: "SHORT_LINK" });
    expect(parseAsin("https://www.mercadolivre.com.br/dp/B0BHJJ9Y77")).toEqual({
      ok: false,
      reason: "NOT_AMAZON",
    });
    expect(parseAsin("https://www.amazon.com.br/s?k=ssd")).toEqual({
      ok: false,
      reason: "NOT_FOUND",
    });
    expect(parseAsin("")).toEqual({ ok: false, reason: "EMPTY" });
    expect(parseAsin("B0BHJJ9Y7")).toEqual({ ok: false, reason: "NOT_FOUND" });
  });

  it("monta a URL canônica", () => {
    expect(productUrl("B0BHJJ9Y77")).toBe("https://www.amazon.com.br/dp/B0BHJJ9Y77");
  });
});
