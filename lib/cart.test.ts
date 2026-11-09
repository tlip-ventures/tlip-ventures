import { describe, expect, it } from "vitest";
import {
  addLine,
  cartCount,
  lineKey,
  cartTotal,
  markProblems,
  refreshLines,
  removeLine,
  setLineQty,
  type CartLine,
  type NewCartLine,
} from "./cart";

const blender: NewCartLine = {
  variantId: "v-blender",
  productId: "p-blender",
  slug: "blender-1-5l",
  productName: "Blender 1.5L",
  optionValues: "Black",
  unitPrice: 45000,
  image: null,
};
const blenderRed: NewCartLine = { ...blender, optionValues: "Red" };
const stool: NewCartLine = { ...blender, variantId: "v-stool", productId: "p-stool", productName: "Stool", optionValues: null, unitPrice: 12000 };
/** What /api/cart returns for a line's variant: current details, no colour of its own. */
const fresh = (line: NewCartLine, inStock: boolean, choices: string[] = []) => ({
  variantId: line.variantId,
  productId: line.productId,
  slug: line.slug,
  productName: line.productName,
  unitPrice: line.unitPrice,
  image: line.image,
  inStock,
  choices,
});

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

  it("keeps two colours of one product (one stock entry) as two lines", () => {
    const lines = addLine(addLine(addLine([], blender), blenderRed, 2), blender);
    expect(lines.map((l) => [l.optionValues, l.qty])).toEqual([
      ["Black", 2],
      ["Red", 2],
    ]);
    expect(lineKey(lines[0])).not.toBe(lineKey(lines[1]));
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
    expect(setLineQty(lines, lineKey(blender), 0)[0].qty).toBe(1);
    expect(setLineQty(lines, lineKey(blender), 150)[0].qty).toBe(99);
    expect(setLineQty(lines, lineKey(blender), 4)[0].qty).toBe(4);
  });

  it("changes and removes only the colour asked for", () => {
    const lines = addLine(addLine(addLine([], blender), blenderRed), stool);
    expect(setLineQty(lines, lineKey(blenderRed), 3).map((l) => l.qty)).toEqual([1, 3, 1]);
    expect(removeLine(lines, lineKey(blender)).map((l) => l.optionValues)).toEqual(["Red", null]);
  });
});

describe("refreshLines", () => {
  it("takes current prices, marks out-of-stock and missing variants", () => {
    const lines = addLine(addLine(addLine([], blender), stool), { ...blender, variantId: "v-gone" });
    const refreshed = refreshLines(lines, [
      { ...fresh(blender, true, ["Black", "Red"]), unitPrice: 47000 },
      fresh(stool, false),
    ]);
    expect(refreshed.map((l) => [l.variantId, l.unitPrice, l.problem])).toEqual([
      ["v-blender", 47000, null],
      ["v-stool", 12000, "out_of_stock"],
      ["v-gone", 45000, "unavailable"],
    ]);
  });

  it("keeps the colour picked, in the product's spelling, and drops colours it no longer has", () => {
    const lines = addLine(addLine([], { ...blender, optionValues: "black" }), blenderRed);
    const refreshed = refreshLines(lines, [fresh(blender, true, ["Black", "Grey"])]);
    expect(refreshed.map((l) => [l.optionValues, l.problem])).toEqual([
      ["Black", null],
      ["Red", "unavailable"],
    ]);
  });

  it("needs a colour once the product has colours, and none when it has none", () => {
    expect(refreshLines(addLine([], stool), [fresh(stool, true, ["Grey"])])[0].problem).toBe("unavailable");
    expect(refreshLines(addLine([], blender), [fresh(blender, true)])[0].problem).toBe("unavailable");
  });

  it("clears a problem once the variant is back in stock", () => {
    const lines = markProblems(addLine([], stool), { [lineKey(stool)]: "out_of_stock" });
    expect(lines[0].problem).toBe("out_of_stock");
    expect(refreshLines(lines, [fresh(stool, true)])[0].problem).toBeNull();
  });
});

describe("cartCount and cartTotal", () => {
  it("counts items and totals only orderable lines", () => {
    const lines = markProblems(addLine(addLine([], blender, 2), stool, 3), { [lineKey(stool)]: "out_of_stock" });
    expect(cartCount(lines)).toBe(5);
    expect(cartTotal(lines)).toBe(90000);
    expect(cartTotal([])).toBe(0);
  });
});
