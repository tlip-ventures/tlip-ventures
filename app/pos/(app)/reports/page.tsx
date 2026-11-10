import type { Metadata } from "next";
import Form from "next/form";
import Link from "next/link";
import { z } from "zod";
import { FilterChips } from "@/components/pos/list-controls";
import { ReportSection as Section, type ReportRow as Row } from "@/components/pos/report-section";
import { buttonClass, Card, PageHeader, PageShell, ScrollTable, StatCard, StatGrid, TableHead, Th } from "@/components/pos/ui";
import { formatPesewas } from "@/lib/money";
import { plural } from "@/lib/pos/format";
import { percent, REPORT_PERIOD_LABELS, REPORT_PERIODS, reportRange } from "@/lib/pos/reports";
import { requireOwner } from "@/lib/server/pos/auth";
import { getMonthlyFigures, getTopProducts } from "@/lib/server/pos/dashboard";
import { getReportOverview } from "@/lib/server/pos/reports";

export const metadata: Metadata = { title: "Reports" };

const first = (v: unknown) => (Array.isArray(v) ? v[0] : v);
const paramsSchema = z.object({
  period: z.preprocess(first, z.enum(REPORT_PERIODS)).catch("month"),
  from: z.preprocess(first, z.string().max(10)).optional().catch(undefined),
  to: z.preprocess(first, z.string().max(10)).optional().catch(undefined),
});

const count = (n: number) => n.toLocaleString("en-US");

/** Owner: everything in one place for a chosen stretch of time, and month by month. */
export default async function ReportsPage({ searchParams }: PageProps<"/pos/reports">) {
  await requireOwner();
  const params = paramsSchema.parse(await searchParams);
  const now = new Date();
  const range = reportRange(params.period, now, params.from, params.to);
  const [r, top, { months, missingCosts }] = await Promise.all([
    getReportOverview(range.from, range.to),
    getTopProducts(range.from, range.to, 15),
    getMonthlyFigures(now),
  ]);
  const s = r.sales;
  const withDelivery = s.items + s.delivery;
  const left = r.moneyInTotal - r.refundsOutTotal - r.suppliersOutTotal;
  const periodHref = (period: (typeof REPORT_PERIODS)[number]) =>
    period === "custom" ? `/pos/reports?period=custom&from=${range.first}&to=${range.last}` : period === "month" ? "/pos/reports" : `/pos/reports?period=${period}`;
  const monthHref = (key: string) => {
    const [y, m] = key.split("-").map(Number);
    const lastDay = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
    return `/pos/reports?period=custom&from=${key}-01&to=${lastDay}`;
  };

  return (
    <PageShell>
      <PageHeader eyebrow="People" title="Reports" />

      <div className="flex flex-col gap-3">
        <FilterChips
          label="Period"
          options={REPORT_PERIODS.map((p) => ({ value: p, name: REPORT_PERIOD_LABELS[p] }))}
          current={range.period}
          href={periodHref}
        />
        {range.period === "custom" && (
          <Form action="/pos/reports" className="flex flex-wrap items-end gap-2.5">
            <input type="hidden" name="period" value="custom" />
            <label className="flex flex-col gap-1 text-[13px] font-semibold text-pos-soft">
              <span>From</span>
              <input type="date" name="from" defaultValue={range.first} className="min-h-11 rounded-md border border-pos-line bg-white px-3 text-sm text-pos-ink" />
            </label>
            <label className="flex flex-col gap-1 text-[13px] font-semibold text-pos-soft">
              <span>To</span>
              <input type="date" name="to" defaultValue={range.last} className="min-h-11 rounded-md border border-pos-line bg-white px-3 text-sm text-pos-ink" />
            </label>
            <button type="submit" className={buttonClass("primary")}>
              Show
            </button>
          </Form>
        )}
        <p className="m-0 text-sm text-pos-soft">
          <strong className="text-pos-ink">{range.label}</strong> · Sales and profit count items after discounts; delivery fees are apart.
        </p>
      </div>

      <StatGrid min={190}>
        <StatCard label="Item sales" value={formatPesewas(s.items)} dark />
        <StatCard label="Delivery fees" value={formatPesewas(s.delivery)} />
        <StatCard label="Profit" value={formatPesewas(s.profit)} tone={s.profit < 0 ? "warn" : "good"} />
        <StatCard label="Money taken in" value={formatPesewas(r.moneyInTotal)} />
        <StatCard label="Customers owe you now" value={formatPesewas(r.now.customers_owe)} tone={r.now.customers_owe ? "warn" : "plain"} />
      </StatGrid>

      <div className="grid gap-5 lg:grid-cols-2">
        <Section
          title="Sales"
          href={range.period === "today" || range.period === "week" || range.period === "month" ? `/pos/sales?period=${range.period}` : "/pos/sales"}
          link="See the sales"
          rows={[
            ["Number of sales", count(s.count)],
            ["Items sold", count(s.qty)],
            ["Item sales", formatPesewas(s.items), "bold"],
            ["Delivery fees", `${formatPesewas(s.delivery)} · ${plural(s.deliveries, "delivery", "deliveries")}`],
            ["Total with delivery", formatPesewas(withDelivery)],
            ["Average sale", s.count ? formatPesewas(Math.round(withDelivery / s.count)) : "—"],
            ["Discounts given", formatPesewas(s.discount)],
            ["Retail sales", formatPesewas(s.retail_items)],
            ["Wholesale sales", s.wholesale_count ? `${count(s.wholesale_count)} · ${formatPesewas(s.wholesale_items)}` : "None"],
            ["Given off at wholesale prices", formatPesewas(s.wholesale_off), "muted"],
            ["Sold in the shop", formatPesewas(s.shop)],
            ["Website orders paid", formatPesewas(s.website)],
            ...(s.imported ? ([["From the old system", formatPesewas(s.imported)]] as Row[]) : []),
            ["Cancelled sales", s.cancelled_count ? `${count(s.cancelled_count)} · ${formatPesewas(s.cancelled_value)}` : "None", "muted"],
            ["New customers", count(r.customers_new)],
          ]}
        />

        <Section
          title="Profit"
          note={
            s.missing_costs
              ? `${plural(s.missing_costs, "item")} sold had no cost price, so the profit shown is higher than it really is.`
              : "Item sales less what the items cost, less refunds."
          }
          rows={[
            ["Item sales", formatPesewas(s.items)],
            ["Profit", formatPesewas(s.profit), s.profit < 0 ? "warn" : "good"],
            ["Margin", percent(s.profit, s.items)],
            ["Returns", r.returns.count ? `${count(r.returns.count)} · ${formatPesewas(r.returns.total)} refunded` : "None"],
          ]}
        />

        <Section
          title="Money in and out"
          note="Payments made in this period, whatever day the sale or purchase was."
          rows={[
            ["Cash taken", formatPesewas(r.money_in.cash ?? 0)],
            ["Mobile Money taken", formatPesewas(r.money_in.momo ?? 0)],
            ["Bank transfers taken", formatPesewas(r.money_in.bank ?? 0)],
            ["Total taken in", formatPesewas(r.moneyInTotal), "bold"],
            ["Refunds paid out", formatPesewas(r.refundsOutTotal)],
            ["Paid to suppliers", formatPesewas(r.suppliersOutTotal)],
            ["Left after refunds and suppliers", formatPesewas(left), left < 0 ? "warn" : "good"],
          ]}
        />

        <Section
          title="Owed right now"
          rows={[
            ["Customers owe you", `${formatPesewas(r.now.customers_owe)}${r.now.customers_owing ? ` · ${plural(r.now.customers_owing, "customer")}` : ""}`, r.now.customers_owe ? "warn" : undefined],
            ["You owe suppliers", formatPesewas(r.now.suppliers_owed), r.now.suppliers_owed ? "warn" : undefined],
            ["Purchases recorded in this period", `${count(r.purchases.count)} · ${formatPesewas(r.purchases.total)}`],
          ]}
          href="/pos/sales?filter=unpaid"
          link="Unpaid sales"
        />

        <Section
          title="Stock right now"
          note={r.now.stock_no_cost ? `${plural(r.now.stock_no_cost, "item")} on the shelf ${r.now.stock_no_cost === 1 ? "has" : "have"} no cost price, so the value at cost is lower than it really is.` : undefined}
          href="/pos/products"
          link="Products and stock"
          rows={[
            ["Units on the shelf", count(r.now.stock_units)],
            ["Value at cost", formatPesewas(r.now.stock_cost), "bold"],
            ["Value at selling price", formatPesewas(r.now.stock_price)],
            ["Out of stock", plural(r.now.out_of_stock, "item"), r.now.out_of_stock ? "warn" : undefined],
            ["Running low", plural(r.now.low_stock, "item")],
            ["Need a recount", plural(r.now.recount, "item")],
          ]}
        />

        <Section
          title="Invoices and deliveries"
          href="/pos/invoices"
          link="Invoices"
          rows={[
            ["Invoices made in this period", `${count(r.invoices.count)} · ${formatPesewas(r.invoices.total)}`],
            ["Of those, sold", `${count(r.invoices.sold)} (${percent(r.invoices.sold, r.invoices.count)})`],
            ["Open invoices now", `${count(r.now.invoices_open)} · ${formatPesewas(r.now.invoices_open_total)}`],
            ["Deliveries in this period", count(s.deliveries)],
            ["Deliveries not delivered yet", count(r.now.deliveries_waiting), r.now.deliveries_waiting ? "warn" : undefined],
          ]}
        />
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card label="Sales by staff">
          <div className="px-5 py-4">
            <h2 className="m-0 text-lg font-bold leading-6">Sales by staff</h2>
            <p className="m-0 text-[13px] text-pos-muted">Sales rung up at the till, delivery included.</p>
          </div>
          {r.byStaff.length === 0 ? (
            <p className="m-0 border-t border-pos-paper-deep px-5 py-6 text-sm text-pos-soft">No till sales in this period.</p>
          ) : (
            <ScrollTable minWidth={360}>
              <TableHead>
                <Th>Person</Th>
                <Th align="right">Sales</Th>
                <Th align="right">Value</Th>
              </TableHead>
              <tbody>
                {r.byStaff.map((p) => (
                  <tr key={p.name} className="pos-row border-t border-pos-paper-deep">
                    <td className="py-3 pl-[18px] pr-3 font-semibold">{p.name}</td>
                    <td className="px-3 py-3 text-right tabular-nums">{count(p.count)}</td>
                    <td className="whitespace-nowrap py-3 pl-3 pr-[18px] text-right font-semibold tabular-nums">{formatPesewas(p.total)}</td>
                  </tr>
                ))}
              </tbody>
            </ScrollTable>
          )}
        </Card>

        <Card label="Best sellers">
          <div className="px-5 py-4">
            <h2 className="m-0 text-lg font-bold leading-6">Best sellers</h2>
            <p className="m-0 text-[13px] text-pos-muted">By sales value, before discounts and returns.</p>
          </div>
          {top.length === 0 ? (
            <p className="m-0 border-t border-pos-paper-deep px-5 py-6 text-sm text-pos-soft">No sales in this period.</p>
          ) : (
            <ScrollTable minWidth={460}>
              <TableHead>
                <Th>Product</Th>
                <Th align="right">Sold</Th>
                <Th align="right">Sales</Th>
                <Th align="right">Profit</Th>
              </TableHead>
              <tbody>
                {top.map((t) => (
                  <tr key={t.name} className="pos-row border-t border-pos-paper-deep">
                    <td className="py-3 pl-[18px] pr-3 font-semibold">{t.name}</td>
                    <td className="px-3 py-3 text-right tabular-nums">{count(t.qty)}</td>
                    <td className="whitespace-nowrap px-3 py-3 text-right font-semibold tabular-nums">{formatPesewas(t.revenue)}</td>
                    <td className="whitespace-nowrap py-3 pl-3 pr-[18px] text-right tabular-nums">{t.profit === null ? "—" : formatPesewas(t.profit)}</td>
                  </tr>
                ))}
              </tbody>
            </ScrollTable>
          )}
        </Card>
      </div>

      <Card label="Month by month">
        <div className="px-5 py-4">
          <h2 className="m-0 text-lg font-bold leading-6">Month by month</h2>
          <p className="m-0 text-[13px] text-pos-muted">
            The last 12 months. Choose a month to see everything for it above.
            {missingCosts ? ` ${plural(missingCosts, "item")} sold in these months had no cost price, so profit shows higher than it really is.` : ""}
          </p>
        </div>
        <ScrollTable minWidth={720}>
          <TableHead>
            <Th>Month</Th>
            <Th align="right">Item sales</Th>
            <Th align="right">Number</Th>
            <Th align="right">Delivery fees</Th>
            <Th align="right">Purchases</Th>
            <Th align="right">Profit</Th>
            <Th align="right">Margin</Th>
          </TableHead>
          <tbody>
            {months.map((m) => {
              const lastDay = new Date(Date.UTC(Number(m.key.slice(0, 4)), Number(m.key.slice(5, 7)), 0)).toISOString().slice(0, 10);
              const on = range.period !== "today" && range.first === `${m.key}-01` && range.last === lastDay;
              return (
                <tr key={m.key} className={`pos-row border-t border-pos-paper-deep ${on ? "bg-pos-tint-green" : ""}`}>
                  <td className="py-3 pl-[18px] pr-3 font-semibold">
                    <Link href={monthHref(m.key)} aria-current={on ? "true" : undefined} className="text-pos-ink no-underline hover:underline">
                      {m.label}
                    </Link>
                  </td>
                  <td className="whitespace-nowrap px-3 py-3 text-right font-semibold tabular-nums">{formatPesewas(m.sales)}</td>
                  <td className="px-3 py-3 text-right tabular-nums text-pos-soft">{count(m.count)}</td>
                  <td className="whitespace-nowrap px-3 py-3 text-right tabular-nums text-pos-soft">{m.delivery ? formatPesewas(m.delivery) : "—"}</td>
                  <td className="whitespace-nowrap px-3 py-3 text-right tabular-nums">{formatPesewas(m.purchases)}</td>
                  <td className={`whitespace-nowrap px-3 py-3 text-right font-semibold tabular-nums ${(m.profit ?? 0) < 0 ? "text-pos-rust" : "text-pos-green-ink"}`}>
                    {formatPesewas(m.profit ?? 0)}
                  </td>
                  <td className="py-3 pl-3 pr-[18px] text-right tabular-nums">{m.profit === null ? "—" : percent(m.profit, m.sales)}</td>
                </tr>
              );
            })}
          </tbody>
        </ScrollTable>
      </Card>
    </PageShell>
  );
}
