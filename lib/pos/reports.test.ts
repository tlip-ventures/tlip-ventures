import { describe, expect, it } from "vitest";
import { percent, reportRange } from "./reports";

const now = new Date("2026-11-11T15:00:00Z"); // a Wednesday

describe("reportRange", () => {
  it("covers today, the week from Monday, this and last month, and the year", () => {
    const iso = (p: Parameters<typeof reportRange>[0]) => {
      const r = reportRange(p, now);
      return [r.from.toISOString().slice(0, 10), r.to.toISOString().slice(0, 10), r.label];
    };
    expect(iso("today")).toEqual(["2026-11-11", "2026-11-12", "11 Nov 2026"]);
    expect(iso("week")).toEqual(["2026-11-09", "2026-11-16", "9 Nov 2026 – 15 Nov 2026"]);
    expect(iso("month")).toEqual(["2026-11-01", "2026-12-01", "1 Nov 2026 – 30 Nov 2026"]);
    expect(iso("last_month")).toEqual(["2026-10-01", "2026-11-01", "1 Oct 2026 – 31 Oct 2026"]);
    expect(iso("year")).toEqual(["2026-01-01", "2027-01-01", "1 Jan 2026 – 31 Dec 2026"]);
  });

  it("takes picked dates in either order, last day included", () => {
    const r = reportRange("custom", now, "2026-10-20", "2026-10-05");
    expect(r.from.toISOString()).toBe("2026-10-05T00:00:00.000Z");
    expect(r.to.toISOString()).toBe("2026-10-21T00:00:00.000Z");
    expect([r.first, r.last, r.period]).toEqual(["2026-10-05", "2026-10-20", "custom"]);
  });

  it("falls back to this month when the dates are missing or wrong", () => {
    expect(reportRange("custom", now, "2026-02-30", "2026-03-01").period).toBe("month");
    expect(reportRange("custom", now, undefined, "2026-03-01").first).toBe("2026-11-01");
  });
});

describe("percent", () => {
  it("rounds, and shows a dash when there is nothing to divide by", () => {
    expect(percent(1, 3)).toBe("33%");
    expect(percent(5, 0)).toBe("—");
  });
});
