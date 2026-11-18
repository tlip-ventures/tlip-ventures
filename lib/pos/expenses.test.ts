import { describe, expect, it } from "vitest";
import { expenseLine, realProfit } from "./expenses";

describe("realProfit", () => {
  it("takes the expenses off the profit on goods", () => {
    expect(realProfit(500000, 150000)).toBe(350000);
    expect(realProfit(100000, 150000)).toBe(-50000);
    expect(realProfit(0, 0)).toBe(0);
  });
});

describe("expenseLine", () => {
  it("joins the parts that are there", () => {
    expect(expenseLine("Rent", "Landlord", "November")).toBe("Rent · Landlord · November");
    expect(expenseLine("Transport", null, "  ")).toBe("Transport");
  });
});
