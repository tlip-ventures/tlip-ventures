import { describe, expect, it } from "vitest";
import { cardAddAction, discountPercent, optionLabel, priceSummary, variantPrice } from "./product";

const product = { price: 9000, compare_at_price: null };

describe("variantPrice", () => {
  it("uses the override when set, else the product price", () => {
    expect(variantPrice(product, { in_stock: true, price_override: null })).toBe(9000);
    expect(variantPrice(product, { in_stock: true, price_override: 12000 })).toBe(12000);
    expect(variantPrice(product, { in_stock: true, price_override: 0 })).toBe(0);
  });
});

describe("priceSummary", () => {
  it("gives a single price for a product with one variant", () => {
    expect(priceSummary(product, [{ in_stock: true, price_override: null }])).toEqual({
      min: 9000,
      max: 9000,
      compareAt: null,
      inStock: true,
    });
  });

  it("gives a range across in-stock variants", () => {
    const summary = priceSummary(product, [
      { in_stock: true, price_override: null },
      { in_stock: true, price_override: 12000 },
      { in_stock: false, price_override: 5000 },
    ]);
    expect(summary).toMatchObject({ min: 9000, max: 12000, inStock: true });
  });

  it("falls back to all variants when everything is out of stock", () => {
    const summary = priceSummary(product, [
      { in_stock: false, price_override: null },
      { in_stock: false, price_override: 12000 },
    ]);
    expect(summary).toMatchObject({ min: 9000, max: 12000, inStock: false });
  });

  it("falls back to the product price when there are no variants", () => {
    expect(priceSummary(product, [])).toEqual({ min: 9000, max: 9000, compareAt: null, inStock: false });
  });

  it("shows the compare-at price only when it is above every current price", () => {
    const onSale = { price: 89000, compare_at_price: 99000 };
    expect(priceSummary(onSale, [{ in_stock: true, price_override: null }]).compareAt).toBe(99000);
    expect(
      priceSummary(onSale, [
        { in_stock: true, price_override: null },
        { in_stock: true, price_override: 99000 },
      ]).compareAt,
    ).toBeNull();
  });
});

describe("optionLabel", () => {
  it("joins option values", () => {
    expect(optionLabel({ option1_value: "Black", option2_value: null })).toBe("Black");
    expect(optionLabel({ option1_value: "Black", option2_value: "Large" })).toBe("Black / Large");
    expect(optionLabel({ option1_value: null, option2_value: null })).toBeNull();
  });
});

describe("discountPercent", () => {
  it("rounds (1 − price / was price) × 100", () => {
    expect(discountPercent(125050, 148000)).toBe(16); // GH₵ 1,250.50 was GH₵ 1,480: 15.5% → 16
    expect(discountPercent(16000, 19500)).toBe(18); // 17.9% → 18
    expect(discountPercent(89000, 99000)).toBe(10);
    expect(discountPercent(5000, 10000)).toBe(50);
  });

  it("is null without a real discount", () => {
    expect(discountPercent(45000, null)).toBeNull();
    expect(discountPercent(45000, 45000)).toBeNull();
    expect(discountPercent(45000, 40000)).toBeNull();
    expect(discountPercent(45000, 0)).toBeNull();
    expect(discountPercent(99600, 100000)).toBeNull(); // 0.4% rounds to 0
  });
});

describe("cardAddAction", () => {
  const variant = (id: string, in_stock: boolean, extra: Partial<{ option1_value: string; price_override: number }> = {}) => ({
    id,
    in_stock,
    price_override: extra.price_override ?? null,
    option1_value: extra.option1_value ?? null,
    option2_value: null,
  });

  it("adds a single in-stock variant straight from the card", () => {
    expect(cardAddAction(product, [variant("v1", true)])).toEqual({
      kind: "add",
      variantId: "v1",
      optionValues: null,
      unitPrice: 9000,
    });
    expect(cardAddAction(product, [variant("v1", true, { option1_value: "Black", price_override: 9500 })])).toEqual({
      kind: "add",
      variantId: "v1",
      optionValues: "Black",
      unitPrice: 9500,
    });
  });

  it("sends products with several variants to the product page", () => {
    expect(cardAddAction(product, [variant("v1", true), variant("v2", false)])).toEqual({ kind: "choose" });
  });

  it("is out of stock when no variant is in stock (or there are none)", () => {
    expect(cardAddAction(product, [variant("v1", false), variant("v2", false)])).toEqual({ kind: "out_of_stock" });
    expect(cardAddAction(product, [])).toEqual({ kind: "out_of_stock" });
  });
});
