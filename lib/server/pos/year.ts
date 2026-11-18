import "server-only";
import { ownerMoneyByMonth, yearBounds, type YearMonth } from "@/lib/pos/year";
import { requireOwner } from "./auth";
import { getExpenseSummary, getExpenseTotals } from "./expenses";
import { getReportOverview } from "./reports";

type RawFigures = {
  periods: { sales: number; delivery: number; count: number; purchases: number; profit: number | null }[];
  missing_costs: number | null;
};

/** Everything for one calendar year (owner): the overview, expenses by kind, and month by month. */
export async function getYearSummary(year: number) {
  const { supabase } = await requireOwner();
  const bounds = yearBounds(year);
  const from = bounds[0];
  const to = bounds[12];
  const [figures, overview, expenses, monthExpenses, moves] = await Promise.all([
    supabase.rpc("pos_period_figures", { p_bounds: bounds.map((b) => b.toISOString()), p_prev_from: from.toISOString(), p_prev_to: from.toISOString() }),
    getReportOverview(from, to),
    getExpenseSummary(from, to),
    getExpenseTotals(bounds),
    supabase
      .from("money_moves")
      .select("kind, amount, moved_on")
      .in("kind", ["owner_out", "owner_in"])
      .is("cancelled_at", null)
      .gte("moved_on", `${year}-01-01`)
      .lt("moved_on", `${year + 1}-01-01`),
  ]);
  if (figures.error) throw new Error(`Could not load the months: ${figures.error.message}`);
  if (moves.error) throw new Error(`Could not load the money taken out: ${moves.error.message}`);
  const raw = figures.data as unknown as RawFigures;
  const owner = ownerMoneyByMonth(moves.data);
  const label = new Intl.DateTimeFormat("en-GB", { month: "long", timeZone: "UTC" });
  const months: YearMonth[] = raw.periods.map((p, i) => {
    const key = bounds[i].toISOString().slice(0, 7);
    return {
      key,
      label: label.format(bounds[i]),
      sales: p.sales,
      count: p.count,
      delivery: p.delivery,
      purchases: p.purchases,
      profit: p.profit,
      expenses: monthExpenses[i] ?? 0,
      ownerOut: owner.get(key)?.out ?? 0,
      ownerIn: owner.get(key)?.in ?? 0,
    };
  });
  return { year, months, missingCosts: raw.missing_costs, overview, expenses };
}

export type YearSummary = Awaited<ReturnType<typeof getYearSummary>>;
