// The year summary (owner): month rows, the year's totals, and the Excel rows.

import type { Pesewas } from "@/lib/money";
import { realProfit } from "./expenses";
import type { XlsxCell } from "./xlsx";

export type YearMonth = {
  key: string; // "2026-03"
  label: string; // "March 2026"
  sales: Pesewas; // item sales after discounts
  count: number;
  delivery: Pesewas;
  purchases: Pesewas;
  profit: Pesewas | null; // profit on goods; null when nothing sold
  expenses: Pesewas;
  ownerOut: Pesewas;
  ownerIn: Pesewas;
};

export type YearTotals = Omit<YearMonth, "key" | "label" | "profit"> & { profit: Pesewas; real: Pesewas };

/** January 1st of the year to January 1st of the next, month by month (13 bounds, UTC = Ghana time). */
export function yearBounds(year: number): Date[] {
  return Array.from({ length: 13 }, (_, i) => new Date(Date.UTC(year, i, 1)));
}

/** Money the owner took out and put in, by month ("2026-03"), from her money moves. */
export function ownerMoneyByMonth(moves: readonly { kind: string; amount: number; moved_on: string }[]): Map<string, { out: Pesewas; in: Pesewas }> {
  const byMonth = new Map<string, { out: Pesewas; in: Pesewas }>();
  for (const m of moves) {
    if (m.kind !== "owner_out" && m.kind !== "owner_in") continue;
    const key = m.moved_on.slice(0, 7);
    const row = byMonth.get(key) ?? { out: 0, in: 0 };
    if (m.kind === "owner_out") row.out += m.amount;
    else row.in += m.amount;
    byMonth.set(key, row);
  }
  return byMonth;
}

export function yearTotals(months: readonly YearMonth[]): YearTotals {
  const t = { sales: 0, count: 0, delivery: 0, purchases: 0, profit: 0, expenses: 0, ownerOut: 0, ownerIn: 0 };
  for (const m of months) {
    t.sales += m.sales;
    t.count += m.count;
    t.delivery += m.delivery;
    t.purchases += m.purchases;
    t.profit += m.profit ?? 0;
    t.expenses += m.expenses;
    t.ownerOut += m.ownerOut;
    t.ownerIn += m.ownerIn;
  }
  return { ...t, real: realProfit(t.profit, t.expenses) };
}

export const YEAR_COLUMNS = [
  { label: "Month", width: 16 },
  { label: "Item sales", width: 14 },
  { label: "Sales", width: 8 },
  { label: "Delivery fees", width: 14 },
  { label: "Purchases", width: 14 },
  { label: "Profit on goods", width: 16 },
  { label: "Expenses", width: 14 },
  { label: "Real profit", width: 14 },
  { label: "Taken out by you", width: 16 },
  { label: "Put in by you", width: 14 },
] as const;

const money = (pesewas: number): XlsxCell => ({ pesewas });

/** The month table for Excel: one row per month, then the year's total. */
export function yearMonthRows(months: readonly YearMonth[]): XlsxCell[][] {
  const t = yearTotals(months);
  const rows: XlsxCell[][] = months.map((m) => [
    m.label,
    money(m.sales),
    m.count,
    money(m.delivery),
    money(m.purchases),
    money(m.profit ?? 0),
    money(m.expenses),
    money(realProfit(m.profit ?? 0, m.expenses)),
    money(m.ownerOut),
    money(m.ownerIn),
  ]);
  rows.push(["Year total", money(t.sales), t.count, money(t.delivery), money(t.purchases), money(t.profit), money(t.expenses), money(t.real), money(t.ownerOut), money(t.ownerIn)]);
  return rows;
}
