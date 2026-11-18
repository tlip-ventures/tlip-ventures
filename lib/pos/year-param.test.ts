import { describe, expect, it } from "vitest";
import { parseYear, yearChoices } from "./year-param";

describe("year choice", () => {
  const now = new Date("2026-11-18T10:00:00Z");
  it("offers this year and the four before", () => expect(yearChoices(now)).toEqual([2026, 2025, 2024, 2023, 2022]));
  it("reads a year on offer, else this year", () => {
    expect(parseYear("2024", now)).toBe(2024);
    expect(parseYear(["2025"], now)).toBe(2025);
    expect(parseYear("2030", now)).toBe(2026);
    expect(parseYear("abc", now)).toBe(2026);
    expect(parseYear(undefined, now)).toBe(2026);
  });
});
