import "server-only";
import { pageRange } from "@/lib/pagination";
import type { ExpenseMethod } from "@/lib/pos/expenses";
import { requireOwner } from "./auth";
import { getPeopleNames } from "./stock";

export const EXPENSES_PAGE_SIZE = 30;

export type ExpenseCategory = { id: number; name: string; isActive: boolean };

/** The kinds of expense, in their order (hidden ones last). Owner only. */
export async function listExpenseCategories(): Promise<ExpenseCategory[]> {
  const { supabase } = await requireOwner();
  const { data, error } = await supabase
    .from("expense_categories")
    .select("id, name, is_active, sort_order")
    .order("is_active", { ascending: false })
    .order("sort_order")
    .order("name");
  if (error) throw new Error(`Could not load the kinds of expense: ${error.message}`);
  return data.map((c) => ({ id: c.id, name: c.name, isActive: c.is_active }));
}

export type ExpenseRow = {
  id: string;
  spentOn: string;
  categoryId: number;
  category: string;
  amount: number;
  method: ExpenseMethod;
  payee: string | null;
  note: string | null;
  by: string;
  cancelled: { at: string; reason: string | null } | null;
};

/** Expenses paid in a stretch of time (days from `from` up to `to`), newest first. */
export async function listExpenses(options: { from: Date; to: Date; categoryId?: number; page?: number }) {
  const { supabase } = await requireOwner();
  const { from, to } = pageRange(options.page ?? 1, EXPENSES_PAGE_SIZE);
  let query = supabase
    .from("expenses")
    .select("id, spent_on, category_id, amount, method, payee, note, created_by, cancelled_at, cancel_reason, expense_categories(name)", {
      count: "exact",
    })
    .gte("spent_on", options.from.toISOString().slice(0, 10))
    .lt("spent_on", options.to.toISOString().slice(0, 10))
    .order("spent_on", { ascending: false })
    .order("created_at", { ascending: false });
  if (options.categoryId) query = query.eq("category_id", options.categoryId);
  const [{ data, count, error }, people] = await Promise.all([query.range(from, to), getPeopleNames()]);
  if (error?.code === "PGRST103") return { rows: [] as ExpenseRow[], total: count ?? 0 };
  if (error) throw new Error(`Could not load expenses: ${error.message}`);
  const rows: ExpenseRow[] = data.map((e) => ({
    id: e.id,
    spentOn: e.spent_on,
    categoryId: e.category_id,
    category: e.expense_categories?.name ?? "Other",
    amount: e.amount,
    method: e.method,
    payee: e.payee,
    note: e.note,
    by: (e.created_by && people.get(e.created_by)) || "Someone no longer here",
    cancelled: e.cancelled_at ? { at: e.cancelled_at, reason: e.cancel_reason } : null,
  }));
  return { rows, total: count ?? 0 };
}

export type ExpenseSummary = {
  total: number;
  count: number;
  byMethod: Record<ExpenseMethod, number>;
  byCategory: { name: string; total: number }[];
};

/** Totals for a stretch of time: all, by way of paying and by kind (cancelled ones left out). */
export async function getExpenseSummary(from: Date, to: Date): Promise<ExpenseSummary> {
  const { supabase } = await requireOwner();
  const { data, error } = await supabase.rpc("pos_expense_summary", { p_from: from.toISOString(), p_to: to.toISOString() });
  if (error) throw new Error(`Could not load the expense totals: ${error.message}`);
  const raw = data as unknown as { total: number; count: number; by_method: Record<ExpenseMethod, number>; by_category: { name: string; total: number }[] };
  return { total: raw.total, count: raw.count, byMethod: raw.by_method, byCategory: raw.by_category };
}

/** Expense totals for consecutive stretches: bounds are n + 1 times for n totals. */
export async function getExpenseTotals(bounds: Date[]): Promise<number[]> {
  const { supabase } = await requireOwner();
  const { data, error } = await supabase.rpc("pos_expense_totals", { p_bounds: bounds.map((b) => b.toISOString()) });
  if (error) throw new Error(`Could not load the expense totals: ${error.message}`);
  return data;
}
