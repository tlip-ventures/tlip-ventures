import { describe, expect, it } from "vitest";
import { cleanIds, recordId, toggleId } from "./saved-ids";

const a = "00000000-0000-4000-8000-00000000000a";
const b = "00000000-0000-4000-8000-00000000000b";
const c = "00000000-0000-4000-8000-00000000000c";

describe("toggleId", () => {
  it("saves new ids at the front and removes saved ones", () => {
    expect(toggleId([], a)).toEqual([a]);
    expect(toggleId([a], b)).toEqual([b, a]);
    expect(toggleId([b, a], a)).toEqual([b]);
  });

  it("drops the oldest when full", () => {
    expect(toggleId([b, a], c, 2)).toEqual([c, b]);
  });
});

describe("recordId", () => {
  it("moves a viewed product to the front without repeating it", () => {
    expect(recordId([], a)).toEqual([a]);
    expect(recordId([a, b], b)).toEqual([b, a]);
    expect(recordId([a, b, c], c, 2)).toEqual([c, a]);
  });

  it("keeps the last 12 by default", () => {
    const many = Array.from({ length: 12 }, (_, i) => `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`);
    const next = recordId(many, a);
    expect(next).toHaveLength(12);
    expect(next[0]).toBe(a);
    expect(next).not.toContain(many[11]);
  });
});

describe("cleanIds", () => {
  it("keeps valid, unique ids up to the limit", () => {
    expect(cleanIds([a, a, "nope", 5, null, b, c], 2)).toEqual([a, b]);
  });

  it("returns an empty list for anything that is not a list", () => {
    expect(cleanIds("x", 5)).toEqual([]);
    expect(cleanIds(undefined, 5)).toEqual([]);
  });
});
