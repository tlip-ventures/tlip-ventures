import { describe, expect, it } from "vitest";
import {
  addToBasket,
  basketLineKey,
  basketLineName,
  basketQty,
  basketTotals,
  cashOptions,
  changeDue,
  draftDeliveryFee,
  setBasketQty,
  tileStock,
  type NewBasketLine,
} from "./basket";

const kettle: NewBasketLine = { variantId: "k", name: "Electric kettle", choice: null, sku: "KTL18", unitPrice: 28000, maxQty: 3 };
const pan: NewBasketLine = { variantId: "p", name: "Frying pan", choice: null, sku: "NSF28", unitPrice: 16000, maxQty: 11 };
const matBeige: NewBasketLine = { variantId: "m", name: "Room Door Mat", choice: "Beige", sku: null, unitPrice: 3500, maxQty: 4 };
const matTaupe: NewBasketLine = { ...matBeige, choice: "Taupe" };

describe("basket", () => {
  it("adds and stops at what is on the shelf", () => {
    let lines = addToBasket([], kettle);
    lines = addToBasket(lines, kettle);
    lines = addToBasket(lines, kettle);
    lines = addToBasket(lines, kettle);
    expect(basketQty(lines, "k")).toBe(3);
    expect(lines).toHaveLength(1);
  });

  it("never adds an out-of-stock item", () => {
    expect(addToBasket([], { ...kettle, maxQty: 0 })).toEqual([]);
    expect(addToBasket([], { ...kettle, maxQty: -4 })).toEqual([]);
  });

  it("sets quantities within the shelf and removes at 0", () => {
    const lines = addToBasket(addToBasket([], kettle), pan);
    expect(basketQty(setBasketQty(lines, basketLineKey(kettle), 10), "k")).toBe(3);
    expect(setBasketQty(lines, basketLineKey(kettle), 0).map((l) => l.variantId)).toEqual(["p"]);
  });

  it("keeps colours as separate lines that share one shelf", () => {
    let lines = addToBasket([], matBeige, 3);
    lines = addToBasket(lines, matTaupe, 3);
    expect(lines.map((l) => [basketLineName(l), l.qty])).toEqual([
      ["Room Door Mat (Beige)", 3],
      ["Room Door Mat (Taupe)", 1],
    ]);
    expect(basketQty(lines, "m")).toBe(4);
    // Full: no more of any colour.
    expect(addToBasket(lines, matTaupe)).toEqual(lines);
    expect(setBasketQty(lines, basketLineKey(matTaupe), 5).map((l) => l.qty)).toEqual([3, 1]);
    // Fewer Beige frees room for Taupe.
    lines = setBasketQty(lines, basketLineKey(matBeige), 1);
    expect(setBasketQty(lines, basketLineKey(matTaupe), 5).map((l) => l.qty)).toEqual([1, 3]);
  });

  it("totals in pesewas and caps the discount", () => {
    const lines = addToBasket(addToBasket(addToBasket([], kettle), pan), pan);
    expect(basketTotals(lines)).toEqual({ items: 3, subtotal: 60000, discount: 0, delivery: 0, total: 60000 });
    expect(basketTotals(lines, 2050).total).toBe(57950);
    expect(basketTotals(lines, 999999).total).toBe(0);
    // A delivery fee comes on top and the discount never eats into it.
    expect(basketTotals(lines, 2050, 3000)).toEqual({ items: 3, subtotal: 60000, discount: 2050, delivery: 3000, total: 60950 });
    expect(basketTotals(lines, 999999, 3000).total).toBe(3000);
  });
});

describe("tileStock", () => {
  it("uses the design's words", () => {
    expect(tileStock(0, 0)).toMatchObject({ text: "Out of stock", canAdd: false });
    expect(tileStock(-4, 0)).toMatchObject({ text: "Out of stock", canAdd: false });
    expect(tileStock(3, 1)).toMatchObject({ text: "Only 2 left", tone: "low" });
    expect(tileStock(14, 1)).toMatchObject({ text: "13 in stock", tone: "ok" });
    expect(tileStock(2, 2)).toMatchObject({ canAdd: false });
  });
});

describe("cash", () => {
  it("offers exact, then the next 50 and 100 cedis", () => {
    expect(cashOptions(44000)).toEqual([44000, 45000, 50000]);
    expect(cashOptions(45000)).toEqual([45000, 50000, 55000]);
    expect(cashOptions(125050)).toEqual([125050, 130000, 135000]);
    expect(cashOptions(50000)).toEqual([50000, 55000, 60000]);
  });

  it("works out change", () => {
    expect(changeDue(44000, 50000)).toBe(6000);
    expect(changeDue(44000, 44000)).toBe(0);
    expect(changeDue(44000, 40000)).toBeNull();
    expect(changeDue(44000, null)).toBe(0);
  });
});

describe("draftDeliveryFee", () => {
  it("reads the fee typed at the till", () => {
    expect(draftDeliveryFee("collect", "30")).toBe(0);
    expect(draftDeliveryFee("delivery", "")).toBe(0);
    expect(draftDeliveryFee("delivery", "30")).toBe(3000);
    expect(draftDeliveryFee("delivery", "12.50")).toBe(1250);
    expect(draftDeliveryFee("delivery", "abc")).toBeNull();
  });
});
