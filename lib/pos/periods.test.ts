import { describe, expect, it } from "vitest";
import { barHeight, chartTop, greeting, percentChange, periodRange, shortMoney } from "./periods";

const now = new Date("2026-10-29T09:30:00Z"); // a Thursday

describe("periodRange", () => {
  it("week: the last seven days against the seven before", () => {
    const r = periodRange("week", now);
    expect(r.labels).toEqual(["Fri 23", "Sat 24", "Sun 25", "Mon 26", "Tue 27", "Wed 28", "Thu 29"]);
    expect(r.shortLabels).toEqual(["23", "24", "25", "26", "27", "28", "29"]);
    expect(r.bounds[0].toISOString()).toBe("2026-10-23T00:00:00.000Z");
    expect(r.bounds[7].toISOString()).toBe("2026-10-30T00:00:00.000Z");
    expect(r.prevFrom.toISOString()).toBe("2026-10-16T00:00:00.000Z");
    expect(r.prevTo.toISOString()).toBe("2026-10-23T00:00:00.000Z");
    expect([r.word, r.prevWord]).toEqual(["this week", "last week"]);
  });

  it("month: weeks of the month, against the same days of last month", () => {
    const r = periodRange("month", now);
    expect(r.labels).toEqual(["1–7", "8–14", "15–21", "22–28", "29–31"]);
    expect(r.bounds.at(-1)!.toISOString()).toBe("2026-11-01T00:00:00.000Z");
    expect(r.prevFrom.toISOString()).toBe("2026-09-01T00:00:00.000Z");
    expect(r.prevTo.toISOString()).toBe("2026-09-30T00:00:00.000Z");
    expect([r.word, r.prevWord]).toEqual(["in October", "1–29 Sep"]);
  });

  it("month: February and a short previous month", () => {
    expect(periodRange("month", new Date("2027-02-10T12:00:00Z")).labels).toEqual(["1–7", "8–14", "15–21", "22–28"]);
    const march = periodRange("month", new Date("2028-03-31T12:00:00Z"));
    expect(march.labels.at(-1)).toBe("29–31");
    expect(march.prevTo.toISOString()).toBe("2028-03-01T00:00:00.000Z"); // all 29 days of February 2028
    expect(march.prevWord).toBe("1–29 Feb");
    expect(periodRange("month", new Date("2026-11-01T08:00:00Z")).prevWord).toBe("1 Oct");
  });

  it("month: January compares with December", () => {
    const r = periodRange("month", new Date("2027-01-05T08:00:00Z"));
    expect(r.prevFrom.toISOString()).toBe("2026-12-01T00:00:00.000Z");
    expect(r.prevWord).toBe("1–5 Dec");
  });

  it("year: month by month so far, against last year to the same day", () => {
    const r = periodRange("year", now);
    expect(r.labels).toEqual(["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct"]);
    expect(r.bounds).toHaveLength(11);
    expect(r.bounds.at(-1)!.toISOString()).toBe("2026-11-01T00:00:00.000Z");
    expect(r.prevFrom.toISOString()).toBe("2025-01-01T00:00:00.000Z");
    expect(r.prevTo.toISOString()).toBe("2025-10-30T00:00:00.000Z");
    expect([r.word, r.prevWord]).toEqual(["in 2026", "2025 to 29 Oct"]);
  });
});

describe("percentChange", () => {
  it("shows the change, or nothing with nothing to compare", () => {
    expect(percentChange(112, 100)).toBe("+12%");
    expect(percentChange(95, 100)).toBe("−5%");
    expect(percentChange(100, 100)).toBe("0%");
    expect(percentChange(100, 0)).toBeNull();
  });
});

describe("chart scale", () => {
  it("rounds the top up to a tidy amount", () => {
    expect(chartTop(0)).toBe(100_000);
    expect(chartTop(215_000)).toBe(300_000); // GH₵ 2,150 → 3k
    expect(chartTop(931_000)).toBe(1_000_000); // GH₵ 9,310 → 10k
    expect(chartTop(3_629_000)).toBe(4_000_000); // GH₵ 36,290 → 40k
  });

  it("labels the axis", () => {
    expect(shortMoney(300_000)).toBe("GH₵ 3k");
    expect(shortMoney(150_000)).toBe("GH₵ 1.5k");
    expect(shortMoney(50_000)).toBe("GH₵ 500");
  });

  it("sizes bars", () => {
    expect(barHeight(0, 100_000, 1)).toBe("1%");
    expect(barHeight(0, 100_000, 0)).toBe("0%");
    expect(barHeight(50_000, 100_000, 1)).toBe("50%");
    expect(barHeight(100, 100_000, 0)).toBe("1%");
  });
});

describe("greeting", () => {
  it("follows Ghana time", () => {
    expect(greeting(new Date("2026-10-29T08:00:00Z"))).toBe("Good morning");
    expect(greeting(new Date("2026-10-29T13:00:00Z"))).toBe("Good afternoon");
    expect(greeting(new Date("2026-10-29T19:00:00Z"))).toBe("Good evening");
  });
});
