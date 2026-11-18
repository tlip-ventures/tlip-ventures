// Expenses (owner): the shop's running costs. Pure helpers for the screens.

import type { Pesewas } from "@/lib/money";

export type ExpenseMethod = "cash" | "momo" | "bank";

export const EXPENSE_METHOD_LABELS: Record<ExpenseMethod, string> = {
  cash: "Cash",
  momo: "Mobile Money",
  bank: "Bank transfer",
};

/**
 * Real profit: what the goods made (item sales less what they cost, less
 * refunds) less the running costs paid in the same stretch of time.
 */
export function realProfit(goodsProfit: Pesewas, expenses: Pesewas): Pesewas {
  return goodsProfit - expenses;
}

/** "Rent · Landlord · November" for a list line; parts left out when empty. */
export function expenseLine(category: string, payee: string | null, note: string | null): string {
  return [category, payee, note].filter((part): part is string => Boolean(part && part.trim())).join(" · ");
}
