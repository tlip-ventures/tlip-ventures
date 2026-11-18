import { ReportSection as Section, type ReportRow as Row } from "@/components/pos/report-section";
import { Card, ScrollTable, StatCard, StatGrid, TableHead, Th } from "@/components/pos/ui";
import { formatPesewas } from "@/lib/money";
import { realProfit } from "@/lib/pos/expenses";
import { plural } from "@/lib/pos/format";
import { percent } from "@/lib/pos/reports";
import { yearTotals } from "@/lib/pos/year";
import type { YearSummary as YearData } from "@/lib/server/pos/year";

const num = (n: number) => n.toLocaleString("en-US");
const minus = (p: number) => (p ? `−${formatPesewas(p)}` : formatPesewas(0));

/** The year at a glance: profit, money in and out, expenses by kind, month by month. Screen and paper. */
export function YearSummary({ data }: { data: YearData }) {
  const { overview: r, expenses, months } = data;
  const s = r.sales;
  const t = yearTotals(months);
  const real = realProfit(s.profit, expenses.total);
  const costAndRefunds = s.items - s.profit;
  const left = r.moneyInTotal - r.refundsOutTotal - r.suppliersOutTotal - expenses.total;
  const leftInBusiness = left - t.ownerOut + t.ownerIn;

  return (
    <>
      <StatGrid min={190}>
        <StatCard label="Item sales" value={formatPesewas(s.items)} dark />
        <StatCard label="Profit on goods" value={formatPesewas(s.profit)} />
        <StatCard label="Expenses" value={formatPesewas(expenses.total)} />
        <StatCard label="Real profit" value={formatPesewas(real)} tone={real < 0 ? "warn" : "good"} />
      </StatGrid>

      {s.missing_costs > 0 && (
        <p className="m-0 text-[13px] font-semibold text-pos-rust">
          {plural(s.missing_costs, "item")} sold this year had no cost price, so the profit shows higher than it really is. Add the cost
          prices on the products to correct it.
        </p>
      )}

      <div className="grid gap-5 lg:grid-cols-2 print:grid-cols-2 print:gap-3 print:[&>section]:break-inside-avoid">
        <Section
          title="Profit"
          note="Sales of goods (delivery fees go to the riders), less what the goods cost, less running costs."
          rows={[
            ["Item sales, after discounts", formatPesewas(s.items)],
            ["Discounts given", formatPesewas(s.discount), "muted"],
            ["Cost of the goods sold, and refunds", minus(costAndRefunds)],
            ["Profit on goods", formatPesewas(s.profit), "bold"],
            ["Margin on goods", percent(s.profit, s.items), "muted"],
            ["Expenses", minus(expenses.total)],
            ["Real profit", formatPesewas(real), real < 0 ? "warn" : "good"],
            ["Real margin", percent(real, s.items), "muted"],
          ]}
        />
        <Section
          title="Money in and out"
          note="Payments made during the year, whatever day the sale or purchase was."
          rows={[
            ["Cash taken", formatPesewas(r.money_in.cash ?? 0)],
            ["Mobile Money taken", formatPesewas(r.money_in.momo ?? 0)],
            ["Bank transfers taken", formatPesewas(r.money_in.bank ?? 0)],
            ["Total taken in", formatPesewas(r.moneyInTotal), "bold"],
            ["Refunds paid out", minus(r.refundsOutTotal)],
            ["Paid to suppliers", minus(r.suppliersOutTotal)],
            ["Expenses paid", minus(expenses.total)],
            ["Left after costs", formatPesewas(left), left < 0 ? "warn" : "good"],
            ["Taken out by you", minus(t.ownerOut)],
            ["Put in by you", formatPesewas(t.ownerIn)],
            ["Left in the business", formatPesewas(leftInBusiness), "bold"],
          ]}
        />
        <Section
          title="Expenses by kind"
          note={`${num(expenses.count)} recorded, by the day each was paid.`}
          rows={[
            ...(expenses.byCategory.length ? expenses.byCategory.map((c): Row => [c.name, formatPesewas(c.total)]) : ([["No expenses recorded", "—", "muted"]] as Row[])),
            ["Total", formatPesewas(expenses.total), "bold"],
          ]}
        />
        <Section
          title="The year in numbers"
          rows={[
            ["Sales", num(s.count)],
            ["Items sold", num(s.qty)],
            ["Delivery fees (passed to riders)", formatPesewas(s.delivery)],
            ["Goods bought from suppliers", `${formatPesewas(r.purchases.total)} · ${plural(r.purchases.count, "delivery", "deliveries")}`],
            ["Returns", r.returns.count ? `${num(r.returns.count)} · ${formatPesewas(r.returns.total)} refunded` : "None"],
            ["New customers", num(r.customers_new)],
            ["Cancelled sales", s.cancelled_count ? `${num(s.cancelled_count)} · ${formatPesewas(s.cancelled_value)}` : "None", "muted"],
          ]}
        />
      </div>

      <Card label="Month by month" className="print:break-before-page print:[&_table]:!min-w-0 print:[&_table]:text-[10px] print:[&_td]:!px-1.5 print:[&_th]:!px-1.5">
        <div className="px-5 py-4">
          <h2 className="m-0 text-lg font-bold leading-6">Month by month</h2>
        </div>
        <ScrollTable minWidth={980}>
          <TableHead>
            <Th>Month</Th>
            <Th align="right">Item sales</Th>
            <Th align="right">Sales</Th>
            <Th align="right">Delivery fees</Th>
            <Th align="right">Purchases</Th>
            <Th align="right">Profit on goods</Th>
            <Th align="right">Expenses</Th>
            <Th align="right">Real profit</Th>
            <Th align="right">Taken out</Th>
            <Th align="right">Put in</Th>
          </TableHead>
          <tbody>
            {months.map((m) => {
              const monthReal = realProfit(m.profit ?? 0, m.expenses);
              return (
                <tr key={m.key} className="border-t border-pos-paper-deep">
                  <td className="py-2.5 pl-[18px] pr-3 font-semibold">{m.label}</td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-right tabular-nums">{formatPesewas(m.sales)}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-pos-soft">{num(m.count)}</td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-right tabular-nums text-pos-soft">{m.delivery ? formatPesewas(m.delivery) : "—"}</td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-right tabular-nums">{formatPesewas(m.purchases)}</td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-right tabular-nums">{formatPesewas(m.profit ?? 0)}</td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-right tabular-nums text-pos-soft">{m.expenses ? formatPesewas(m.expenses) : "—"}</td>
                  <td className={`whitespace-nowrap px-3 py-2.5 text-right font-semibold tabular-nums ${monthReal < 0 ? "text-pos-rust" : "text-pos-green-ink"}`}>
                    {formatPesewas(monthReal)}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-right tabular-nums text-pos-soft">{m.ownerOut ? formatPesewas(m.ownerOut) : "—"}</td>
                  <td className="whitespace-nowrap py-2.5 pl-3 pr-[18px] text-right tabular-nums text-pos-soft">{m.ownerIn ? formatPesewas(m.ownerIn) : "—"}</td>
                </tr>
              );
            })}
            <tr className="border-t-2 border-pos-ink font-bold">
              <td className="py-3 pl-[18px] pr-3">Year</td>
              <td className="whitespace-nowrap px-3 py-3 text-right tabular-nums">{formatPesewas(t.sales)}</td>
              <td className="px-3 py-3 text-right tabular-nums">{num(t.count)}</td>
              <td className="whitespace-nowrap px-3 py-3 text-right tabular-nums">{formatPesewas(t.delivery)}</td>
              <td className="whitespace-nowrap px-3 py-3 text-right tabular-nums">{formatPesewas(t.purchases)}</td>
              <td className="whitespace-nowrap px-3 py-3 text-right tabular-nums">{formatPesewas(t.profit)}</td>
              <td className="whitespace-nowrap px-3 py-3 text-right tabular-nums">{formatPesewas(t.expenses)}</td>
              <td className={`whitespace-nowrap px-3 py-3 text-right tabular-nums ${t.real < 0 ? "text-pos-rust" : "text-pos-green-ink"}`}>{formatPesewas(t.real)}</td>
              <td className="whitespace-nowrap px-3 py-3 text-right tabular-nums">{formatPesewas(t.ownerOut)}</td>
              <td className="whitespace-nowrap py-3 pl-3 pr-[18px] text-right tabular-nums">{formatPesewas(t.ownerIn)}</td>
            </tr>
          </tbody>
        </ScrollTable>
      </Card>
    </>
  );
}
