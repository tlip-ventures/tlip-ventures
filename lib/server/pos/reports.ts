import "server-only";
import { requireOwner } from "./auth";
import { getPeopleNames } from "./stock";

type ByMethod = Partial<Record<"cash" | "momo" | "bank", number>>;

type RawOverview = {
  sales: {
    count: number;
    items: number;
    qty: number;
    discount: number;
    delivery: number;
    deliveries: number;
    shop: number;
    website: number;
    imported: number;
    profit: number;
    missing_costs: number;
    cancelled_count: number;
    cancelled_value: number;
    wholesale_count: number;
    wholesale_items: number;
    retail_items: number;
    /** Retail price less wholesale price on items sold at wholesale. */
    wholesale_off: number;
  };
  by_staff: { user_id: string | null; count: number; total: number }[];
  money_in: ByMethod;
  refunds_out: ByMethod;
  suppliers_out: ByMethod;
  purchases: { count: number; total: number };
  returns: { count: number; total: number };
  invoices: { count: number; total: number; sold: number };
  customers_new: number;
  now: {
    customers_owe: number;
    customers_owing: number;
    suppliers_owed: number;
    stock_units: number;
    stock_cost: number;
    stock_price: number;
    stock_no_cost: number;
    out_of_stock: number;
    low_stock: number;
    recount: number;
    invoices_open: number;
    invoices_open_total: number;
    deliveries_waiting: number;
  };
};

const sumMethods = (m: ByMethod) => (m.cash ?? 0) + (m.momo ?? 0) + (m.bank ?? 0);

/** Owner: everything for one stretch of time, and where things stand now. */
export async function getReportOverview(from: Date, to: Date) {
  const { supabase } = await requireOwner();
  const [{ data, error }, people] = await Promise.all([
    supabase.rpc("pos_report_overview", { p_from: from.toISOString(), p_to: to.toISOString() }),
    getPeopleNames(),
  ]);
  if (error) throw new Error(`Could not load the report: ${error.message}`);
  const raw = data as unknown as RawOverview;
  return {
    ...raw,
    moneyInTotal: sumMethods(raw.money_in),
    refundsOutTotal: sumMethods(raw.refunds_out),
    suppliersOutTotal: sumMethods(raw.suppliers_out),
    byStaff: raw.by_staff.map((s) => ({
      name: (s.user_id && people.get(s.user_id)) || "Someone no longer here",
      count: s.count,
      total: s.total,
    })),
  };
}

export type ReportOverview = Awaited<ReturnType<typeof getReportOverview>>;
