import { describe, expect, it } from "vitest";
import { listingQuery, parseListingParams, priceFilterLabel, PRICE_RANGES, slugSchema } from "./listing";

describe("parseListingParams", () => {
  it("uses defaults when nothing is given", () => {
    expect(parseListingParams({})).toEqual({ page: 1, sort: "newest", q: "", min: null, max: null });
  });

  it("reads valid values", () => {
    expect(parseListingParams({ page: "3", sort: "price-asc", q: "  kettle " })).toEqual({
      page: 3,
      sort: "price-asc",
      q: "kettle",
      min: null,
      max: null,
    });
  });

  it("falls back to defaults for bad values", () => {
    expect(parseListingParams({ page: "abc", sort: "cheapest" })).toEqual({
      page: 1,
      sort: "newest",
      q: "",
      min: null,
      max: null,
    });
    expect(parseListingParams({ page: "0" }).page).toBe(1);
    expect(parseListingParams({ page: "-2" }).page).toBe(1);
    expect(parseListingParams({ page: "1.5" }).page).toBe(1);
    expect(parseListingParams({ page: "99999999" }).page).toBe(1);
    expect(parseListingParams({ q: "x".repeat(101) }).q).toBe("");
  });

  it("takes the first of repeated parameters", () => {
    expect(parseListingParams({ page: ["2", "5"], sort: ["price-desc", "newest"] })).toMatchObject({
      page: 2,
      sort: "price-desc",
    });
  });
});

describe("price filter", () => {
  it("reads whole-cedi limits", () => {
    expect(parseListingParams({ min: "100", max: "300" })).toMatchObject({ min: 100, max: 300 });
    expect(parseListingParams({ max: "100" })).toMatchObject({ min: null, max: 100 });
    expect(parseListingParams({ min: "1000" })).toMatchObject({ min: 1000, max: null });
  });

  it("ignores bad or impossible limits", () => {
    expect(parseListingParams({ min: "abc", max: "-5" })).toMatchObject({ min: null, max: null });
    expect(parseListingParams({ min: "1.5" })).toMatchObject({ min: null });
    expect(parseListingParams({ min: "300", max: "100" })).toMatchObject({ min: null, max: null });
    expect(parseListingParams({ min: "0" })).toMatchObject({ min: null });
  });

  it("names the chips and other ranges", () => {
    for (const range of PRICE_RANGES) expect(priceFilterLabel(range.min, range.max)).toBe(range.label);
    expect(priceFilterLabel(50, 2500)).toBe("GH₵ 50 – GH₵ 2,500");
    expect(priceFilterLabel(null, 40)).toBe("Under GH₵ 40");
    expect(priceFilterLabel(2000, null)).toBe("GH₵ 2,000 and over");
    expect(priceFilterLabel(null, null)).toBeNull();
  });
});

describe("listingQuery", () => {
  it("leaves out defaults", () => {
    expect(listingQuery({})).toBe("");
    expect(listingQuery({ page: 1, sort: "newest", q: "" })).toBe("");
  });

  it("encodes values", () => {
    expect(listingQuery({ q: "pots & pans", sort: "price-asc", page: 2 })).toBe("?q=pots+%26+pans&sort=price-asc&page=2");
    expect(listingQuery({ min: 100, max: 300, sort: "price-asc" })).toBe("?min=100&max=300&sort=price-asc");
    expect(listingQuery({ min: null, max: 100 })).toBe("?max=100");
  });
});

describe("slugSchema", () => {
  it("accepts database-style slugs only", () => {
    expect(slugSchema.safeParse("blender-1-5l").success).toBe(true);
    expect(slugSchema.safeParse("Blender").success).toBe(false);
    expect(slugSchema.safeParse("a--b").success).toBe(false);
    expect(slugSchema.safeParse("../etc").success).toBe(false);
  });
});
