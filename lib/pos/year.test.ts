import { describe, expect, it } from "vitest";
import { ownerMoneyByMonth, yearBounds, yearMonthRows, yearTotals, type YearMonth } from "./year";

const month = (key: string, over: Partial<YearMonth> = {}): YearMonth => ({
  key,
  label: key,
  sales: 0,
  count: 0,
  delivery: 0,
  purchases: 0,
  profit: null,
  expenses: 0,
  ownerOut: 0,
  ownerIn: 0,
  ...over,
});

describe("year summary", () => {
  it("covers January to the next January", () => {
    const b = yearBounds(2026);
    expect(b).toHaveLength(13);
    expect(b[0].toISOString()).toBe("2026-01-01T00:00:00.000Z");
    expect(b[12].toISOString()).toBe("2027-01-01T00:00:00.000Z");
  });

  it("groups the owner's money by month and ignores moves between accounts", () => {
    const m = ownerMoneyByMonth([
      { kind: "owner_out", amount: 50000, moved_on: "2026-03-02" },
      { kind: "owner_out", amount: 10000, moved_on: "2026-03-30" },
      { kind: "owner_in", amount: 20000, moved_on: "2026-03-15" },
      { kind: "transfer", amount: 99999, moved_on: "2026-03-15" },
      { kind: "owner_in", amount: 5000, moved_on: "2026-04-01" },
    ]);
    expect(m.get("2026-03")).toEqual({ out: 60000, in: 20000 });
    expect(m.get("2026-04")).toEqual({ out: 0, in: 5000 });
  });

  it("adds up the year, with real profit after expenses", () => {
    const months = [
      month("2026-01", { sales: 100000, count: 3, profit: 30000, expenses: 10000, ownerOut: 5000 }),
      month("2026-02", { sales: 50000, count: 1, profit: null, expenses: 40000, ownerIn: 2000 }),
    ];
    const t = yearTotals(months);
    expect(t).toMatchObject({ sales: 150000, count: 4, profit: 30000, expenses: 50000, real: -20000, ownerOut: 5000, ownerIn: 2000 });
    const rows = yearMonthRows(months);
    expect(rows).toHaveLength(3);
    expect(rows[1][7]).toEqual({ pesewas: -40000 });
    expect(rows[2][0]).toBe("Year total");
    expect(rows[2][7]).toEqual({ pesewas: -20000 });
  });
});
