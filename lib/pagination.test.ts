import { describe, expect, it } from "vitest";
import { PAGE_SIZE, pageCount, pageRange } from "./pagination";

describe("pageRange", () => {
  it("returns inclusive zero-based ranges of 24", () => {
    expect(PAGE_SIZE).toBe(24);
    expect(pageRange(1)).toEqual({ from: 0, to: 23 });
    expect(pageRange(2)).toEqual({ from: 24, to: 47 });
    expect(pageRange(3, 10)).toEqual({ from: 20, to: 29 });
  });

  it("rejects pages below 1 or fractional pages", () => {
    expect(() => pageRange(0)).toThrow(RangeError);
    expect(() => pageRange(1.5)).toThrow(RangeError);
  });
});

describe("pageCount", () => {
  it("rounds up and never returns 0", () => {
    expect(pageCount(0)).toBe(1);
    expect(pageCount(1)).toBe(1);
    expect(pageCount(24)).toBe(1);
    expect(pageCount(25)).toBe(2);
    expect(pageCount(1000)).toBe(42);
  });
});
