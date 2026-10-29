import { describe, expect, it } from "vitest";
import {
  addLine,
  cartCount,
  cartTotal,
  markProblems,
  refreshLines,
  removeLine,
  setLineQty,
  type CartLine,
  type NewCartLine,
} from "./cart";

const blender: NewCartLine = {
  variantId: "v-blender-black",
  productId: "p-blender",
  slug: "blender-1-5l",
  productName: "Blender 1.5L",
  optionValues: "Black",
  unitPrice: 45000,
  image: null,
};
const stool: NewCartLine = { ...blender, variantId: "v-stool", productId: "p-stool", productName: "Stool", optionValues: null, unitPrice: 12000 };

describe("addLine", () => {
  it("adds a new line with quantity 1", () => {
    expect(addLine([], blender)).toEqual([{ ...blender, qty: 1, problem: null }]);
  });

  it("raises the quantity of an existing line, capped at 99", () => {
    let lines = addLine([], blender, 2);
    lines = addLine(lines, blender, 3);
    expect(lines).toHaveLength(1);
    expect(lines[0].qty).toBe(5);
    expect(addLine(lines, blender, 500)[0].qty).toBe(99);
  });

  it("stops at 50 different lines", () => {
    let lines: CartLine[] = [];
    for (let i = 0; i < 50; i++) lines = addLine(lines, { ...blender, variantId: `v${i}` });
    expect(addLine(lines, stool)).toBe(lines);
  });
});

describe("setLineQty and removeLine", () => {
  it("keeps quantities between 1 and 99", () => {
    const lines = addLine([], blender);
    expect(setLineQty(lines, blender.variantId, 0)[0].qty).toBe(1);
    expect(setLineQty(lines, blender.variantId, 150)[0].qty).toBe(99);
    expect(setLineQty(lines, blender.variantId, 4)[0].qty).toBe(4);
  });

  it("removes a line", () => {
    const lines = addLine(addLine([], blender), stool);
    expect(removeLine(lines, blender.variantId).map((l) => l.variantId)).toEqual(["v-stool"]);
  });
});

describe("refreshLines", () => {
  it("takes current prices, marks out-of-stock and missing variants", () => {
    const lines = addLine(addLine(addLine([], blender), stool), { ...blender, variantId: "v-gone" });
    const refreshed = refreshLines(lines, [
      { ...blender, unitPrice: 47000, inStock: true },
      { ...stool, inStock: false },
    ]);
    expect(refreshed.map((l) => [l.variantId, l.unitPrice, l.problem])).toEqual([
      ["v-blender-black", 47000, null],
      ["v-stool", 12000, "out_of_stock"],
      ["v-gone", 45000, "unavailable"],
    ]);
  });

  it("clears a problem once the variant is back in stock", () => {
    const lines = markProblems(addLine([], stool), { "v-stool": "out_of_stock" });
    expect(refreshLines(lines, [{ ...stool, inStock: true }])[0].problem).toBeNull();
  });
});

describe("cartCount and cartTotal", () => {
  it("counts items and totals only orderable lines", () => {
    const lines = markProblems(addLine(addLine([], blender, 2), stool, 3), { "v-stool": "out_of_stock" });
    expect(cartCount(lines)).toBe(5);
    expect(cartTotal(lines)).toBe(90000);
    expect(cartTotal([])).toBe(0);
  });
});
