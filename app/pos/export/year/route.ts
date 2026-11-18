import { realProfit } from "@/lib/pos/expenses";
import { buildXlsx, XLSX_TYPE, type XlsxCell } from "@/lib/pos/xlsx";
import { YEAR_COLUMNS, yearMonthRows, yearTotals } from "@/lib/pos/year";
import { parseYear } from "@/lib/pos/year-param";
import { getYearSummary } from "@/lib/server/pos/year";

/** Excel of the year summary: month by month with the year's total, then profit, money and expenses by kind. */
export async function GET(request: Request) {
  const year = parseYear(new URL(request.url).searchParams.get("year"));
  const { months, overview: r, expenses } = await getYearSummary(year);
  const s = r.sales;
  const t = yearTotals(months);
  const real = realProfit(s.profit, expenses.total);
  const money = (pesewas: number): XlsxCell => ({ pesewas });
  const blank: XlsxCell[] = [];
  const rows: XlsxCell[][] = [
    ...yearMonthRows(months),
    blank,
    ["Profit"],
    ["Item sales, after discounts", money(s.items)],
    ["Discounts given", money(s.discount)],
    ["Cost of the goods sold, and refunds", money(-(s.items - s.profit))],
    ["Profit on goods", money(s.profit)],
    ["Expenses", money(-expenses.total)],
    ["Real profit", money(real)],
    blank,
    ["Money in and out"],
    ["Cash taken", money(r.money_in.cash ?? 0)],
    ["Mobile Money taken", money(r.money_in.momo ?? 0)],
    ["Bank transfers taken", money(r.money_in.bank ?? 0)],
    ["Refunds paid out", money(-r.refundsOutTotal)],
    ["Paid to suppliers", money(-r.suppliersOutTotal)],
    ["Expenses paid", money(-expenses.total)],
    ["Taken out by you", money(-t.ownerOut)],
    ["Put in by you", money(t.ownerIn)],
    ["Left in the business", money(r.moneyInTotal - r.refundsOutTotal - r.suppliersOutTotal - expenses.total - t.ownerOut + t.ownerIn)],
    blank,
    ["Expenses by kind"],
    ...expenses.byCategory.map((c): XlsxCell[] => [c.name, money(c.total)]),
    ["Total expenses", money(expenses.total)],
  ];
  const file = buildXlsx(
    `Year ${year}`,
    YEAR_COLUMNS.map((c) => c.label),
    rows,
    YEAR_COLUMNS.map((c, i) => (i === 0 ? 34 : c.width)),
  );
  return new Response(file as BodyInit, {
    headers: {
      "Content-Type": XLSX_TYPE,
      "Content-Disposition": `attachment; filename="tlip-ventures-year-${year}.xlsx"`,
      "Cache-Control": "private, no-store",
    },
  });
}
