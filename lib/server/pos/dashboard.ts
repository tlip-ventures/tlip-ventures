import "server-only";
import { periodRange, type Period } from "@/lib/pos/periods";
import { requirePosUser } from "./auth";

export type PeriodFigures = {
  bars: { label: string; short: string; sales: number; purchases: number; profit: number | null; count: number }[];
  sales: number;
  purchases: number;
  count: number;
  /** Owner only. */
  profit: number | null;
  prevSales: number;
  /** Owner only: sale lines in the period with no cost recorded. */
  missingCosts: number | null;
  word: string;
  prevWord: string;
};

type RawFigures = {
  periods: { sales: number; count: number; purchases: number; profit: number | null }[];
  prev_sales: number;
  missing_costs: number | null;
};

/** Sales, purchases and profit for This week / This month / This year. */
export async function getPeriodFigures(period: Period, now = new Date()): Promise<PeriodFigures> {
  const { supabase } = await requirePosUser();
  const range = periodRange(period, now);
  const { data, error } = await supabase.rpc("pos_period_figures", {
    p_bounds: range.bounds.map((b) => b.toISOString()),
    p_prev_from: range.prevFrom.toISOString(),
    p_prev_to: range.prevTo.toISOString(),
  });
  if (error) throw new Error(`Could not load the figures: ${error.message}`);
  const raw = data as unknown as RawFigures;
  const bars = raw.periods.map((p, i) => ({ label: range.labels[i], short: range.shortLabels[i], ...p }));
  const sum = (pick: (b: (typeof bars)[number]) => number) => bars.reduce((n, b) => n + pick(b), 0);
  const owner = bars.length > 0 && bars[0].profit !== null;
  return {
    bars,
    sales: sum((b) => b.sales),
    purchases: sum((b) => b.purchases),
    count: sum((b) => b.count),
    profit: owner ? sum((b) => b.profit ?? 0) : null,
    prevSales: raw.prev_sales,
    missingCosts: raw.missing_costs,
    word: range.word,
    prevWord: range.prevWord,
  };
}

export type MoneyOwed = {
  customers: { total: number; sales: number };
  /** Owner only. */
  suppliers: { total: number; names: string[] } | null;
};

/** "Customers owe you" and "You owe suppliers". */
export async function getMoneyOwed(): Promise<MoneyOwed> {
  const { supabase, isOwner } = await requirePosUser();
  const [sales, purchases] = await Promise.all([
    supabase.from("pos_sales_list").select("owed").gt("owed", 0),
    isOwner ? supabase.from("pos_purchases_list").select("supplier_name, owed").gt("owed", 0) : null,
  ]);
  if (sales.error) throw new Error(`Could not load what customers owe: ${sales.error.message}`);
  if (purchases?.error) throw new Error(`Could not load supplier bills: ${purchases.error.message}`);

  let suppliers: MoneyOwed["suppliers"] = null;
  if (purchases) {
    // Suppliers you owe most first.
    const bySupplier = new Map<string, number>();
    for (const p of purchases.data) bySupplier.set(p.supplier_name!, (bySupplier.get(p.supplier_name!) ?? 0) + p.owed!);
    suppliers = {
      total: [...bySupplier.values()].reduce((n, v) => n + v, 0),
      names: [...bySupplier.entries()].sort((a, b) => b[1] - a[1]).map(([name]) => name),
    };
  }
  return {
    customers: { total: sales.data.reduce((n, s) => n + s.owed!, 0), sales: sales.data.length },
    suppliers,
  };
}

export type WebsiteOrder = {
  id: string;
  code: string;
  total: number;
  status: "pending" | "ordered";
  createdAt: string;
  name: string | null;
  phone: string | null;
};

/** Baskets sent from the shop site that haven't been paid yet (website sync). */
export async function getWebsiteOrders(): Promise<{ orders: WebsiteOrder[]; total: number }> {
  const { supabase } = await requirePosUser();
  // Makes any basket whose sale wasn't made at checkout (normally none).
  await supabase.rpc("pos_sync_website_orders");
  const { data, count, error } = await supabase
    .from("pos_sales_list")
    .select("id, code, total, status, created_at, customer_name, customer_phone", { count: "exact" })
    .eq("source", "website")
    .in("status", ["pending", "ordered"])
    .order("created_at", { ascending: false })
    .limit(4);
  if (error) throw new Error(`Could not load website orders: ${error.message}`);
  return {
    orders: data.map((o) => ({
      id: o.id!,
      code: o.code!,
      total: o.total!,
      status: o.status as "pending" | "ordered",
      createdAt: o.created_at!,
      name: o.customer_name,
      phone: o.customer_phone,
    })),
    total: count ?? 0,
  };
}

export type TopProduct = { name: string; qty: number; revenue: number; profit: number | null };

export async function getTopProducts(from: Date, to: Date, limit = 10): Promise<TopProduct[]> {
  const { supabase } = await requirePosUser();
  const { data, error } = await supabase.rpc("pos_top_products", { p_from: from.toISOString(), p_to: to.toISOString(), p_limit: limit });
  if (error) throw new Error(`Could not load best sellers: ${error.message}`);
  return data.map((r) => ({
    name: r.option_values ? `${r.product_name} (${r.option_values})` : r.product_name,
    qty: r.qty,
    revenue: r.revenue,
    profit: r.profit,
  }));
}

export type MonthFigures = { key: string; label: string; sales: number; count: number; purchases: number; profit: number | null };

/** The last twelve months, newest first, for Reports. */
export async function getMonthlyFigures(now = new Date()): Promise<{ months: MonthFigures[]; missingCosts: number | null }> {
  const { supabase } = await requirePosUser();
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth();
  const bounds = Array.from({ length: 13 }, (_, i) => new Date(Date.UTC(y, m - 11 + i, 1)));
  const { data, error } = await supabase.rpc("pos_period_figures", {
    p_bounds: bounds.map((b) => b.toISOString()),
    p_prev_from: bounds[0].toISOString(),
    p_prev_to: bounds[0].toISOString(),
  });
  if (error) throw new Error(`Could not load the months: ${error.message}`);
  const raw = data as unknown as RawFigures;
  const label = new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });
  const months = raw.periods.map((p, i) => ({
    key: bounds[i].toISOString().slice(0, 7),
    label: label.format(bounds[i]),
    ...p,
  }));
  return { months: months.reverse(), missingCosts: raw.missing_costs };
}
