import { describe, expect, it } from "vitest";
import {
  movementLabel,
  shelfBarPercent,
  shelfText,
  signedQty,
  statesForFilter,
  stockState,
  tileClass,
  tileCode,
  toStockState,
  variantName,
} from "./stock";

describe("stockState", () => {
  it("matches the database view", () => {
    expect(stockState(-4, 2)).toBe("recount");
    expect(stockState(0, 2)).toBe("out");
    expect(stockState(2, 2)).toBe("low");
    expect(stockState(3, 2)).toBe("ok");
    expect(stockState(1, 0)).toBe("ok");
  });
});

describe("statesForFilter", () => {
  it("puts sold-out items under Low or out", () => {
    expect(statesForFilter("low")).toEqual(["low", "out"]);
    expect(statesForFilter("recount")).toEqual(["recount"]);
    expect(statesForFilter("all")).toHaveLength(4);
  });
});

describe("toStockState", () => {
  it("falls back to out for anything unexpected", () => {
    expect(toStockState("ok")).toBe("ok");
    expect(toStockState(null)).toBe("out");
    expect(toStockState("weird")).toBe("out");
  });
});

describe("shelfText", () => {
  it("uses the design's wording", () => {
    expect(shelfText(-4, 0)).toBe("-4 (sold before stock arrived)");
    expect(shelfText(3, 4)).toBe("3 on shelf · alert at 4");
  });
});

describe("shelfBarPercent", () => {
  it("is empty below zero and full well above the alert level", () => {
    expect(shelfBarPercent(-2, 2)).toBe(0);
    expect(shelfBarPercent(0, 2)).toBe(0);
    expect(shelfBarPercent(3, 4)).toBe(20);
    expect(shelfBarPercent(200, 4)).toBe(100);
    expect(shelfBarPercent(15, 10)).toBe(50);
  });
});

describe("signedQty", () => {
  it("shows a sign", () => {
    expect(signedQty(4)).toBe("+4");
    expect(signedQty(-2)).toBe("−2");
    expect(signedQty(0)).toBe("0");
  });
});

describe("movementLabel", () => {
  it("names every kind", () => {
    expect(movementLabel("count")).toBe("Count");
    expect(movementLabel("purchase")).toBe("Delivery received");
  });
});

describe("tiles", () => {
  it("picks the same tile for the same category", () => {
    expect(tileClass("Baking")).toBe(tileClass("Baking"));
    expect(tileClass(null)).toBe("bg-pos-paper-deep");
  });

  it("uses the code, or initials of the name", () => {
    expect(tileCode("rdcm", "Metal rolling donut cutter")).toBe("RDCM");
    expect(tileCode(null, "Metal rolling donut cutter")).toBe("MRD");
    expect(tileCode(null, "2-in-1 Slicer")).toBe("2S");
    expect(tileCode(null, "—")).toBe("—");
  });
});

describe("variantName", () => {
  it("adds the option in brackets", () => {
    expect(variantName("Blender 1.5L", "Black")).toBe("Blender 1.5L (Black)");
    expect(variantName("Funnel", null)).toBe("Funnel");
  });
});
