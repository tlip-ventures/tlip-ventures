import type { Metadata } from "next";
import Link from "next/link";
import { Card, PageHeader, PageShell, ScrollTable, StatCard, StatGrid, TableHead, Th } from "@/components/pos/ui";
import { formatPesewas } from "@/lib/money";
import { plural } from "@/lib/pos/format";
import { requireOwner } from "@/lib/server/pos/auth";
import { getMonthlyFigures, getTopProducts } from "@/lib/server/pos/dashboard";

export const metadata: Metadata = { title: "Reports" };

function margin(profit: number | null, sales: number) {
  return profit === null || sales <= 0 ? "—" : `${Math.round((profit / sales) * 100)}%`;
}

/** Owner: sales and profit month by month, and the best sellers of a month. */
export default async function ReportsPage({ searchParams }: PageProps<"/pos/reports">) {
  await requireOwner();
  const raw = (await searchParams).month;
  const wanted = Array.isArray(raw) ? raw[0] : raw;
  const now = new Date();
  const { months, missingCosts } = await getMonthlyFigures(now);
  const month = months.find((m) => m.key === wanted) ?? months[0];
  const [y, mo] = month.key.split("-").map(Number);
  const top = await getTopProducts(new Date(Date.UTC(y, mo - 1, 1)), new Date(Date.UTC(y, mo, 1)), 20);
  const year = months.reduce(
    (t, m) => ({ sales: t.sales + m.sales, purchases: t.purchases + m.purchases, profit: t.profit + (m.profit ?? 0) }),
    { sales: 0, purchases: 0, profit: 0 },
  );

  return (
    <PageShell>
      <PageHeader eyebrow="People" title="Reports" />
      <StatGrid>
        <StatCard label="Sales, last 12 months" value={formatPesewas(year.sales)} dark />
        <StatCard label="Profit, last 12 months" value={formatPesewas(year.profit)} tone="good" />
        <StatCard label="Margin" value={margin(year.profit, year.sales)} />
        <StatCard label="Bought from suppliers" value={formatPesewas(year.purchases)} />
      </StatGrid>
      {missingCosts ? (
        <p className="m-0 text-[13px] text-pos-soft">
          {plural(missingCosts, "item")} sold in these months had no cost price, so the profit shown is higher than it really is. Add costs on
          Products and stock, or record purchases, to fix future sales.
        </p>
      ) : null}

      <Card label="Month by month">
        <div className="px-5 py-4">
          <h2 className="m-0 text-lg font-bold leading-6">Month by month</h2>
          <p className="m-0 text-[13px] text-pos-muted">Profit is sales less what those items cost, less refunds. Choose a month to see its best sellers.</p>
        </div>
        <ScrollTable minWidth={640}>
          <TableHead>
            <Th>Month</Th>
            <Th align="right">Sales</Th>
            <Th align="right">Number</Th>
            <Th align="right">Purchases</Th>
            <Th align="right">Profit</Th>
            <Th align="right">Margin</Th>
          </TableHead>
          <tbody>
            {months.map((m) => {
              const on = m.key === month.key;
              return (
                <tr key={m.key} className={`pos-row border-t border-pos-paper-deep ${on ? "bg-pos-tint-green" : ""}`}>
                  <td className="py-3 pl-[18px] pr-3 font-semibold">
                    <Link href={`/pos/reports?month=${m.key}`} aria-current={on ? "true" : undefined} className="text-pos-ink no-underline hover:underline">
                      {m.label}
                    </Link>
                  </td>
                  <td className="whitespace-nowrap px-3 py-3 text-right font-semibold tabular-nums">{formatPesewas(m.sales)}</td>
                  <td className="px-3 py-3 text-right tabular-nums text-pos-soft">{m.count.toLocaleString("en-US")}</td>
                  <td className="whitespace-nowrap px-3 py-3 text-right tabular-nums">{formatPesewas(m.purchases)}</td>
                  <td className={`whitespace-nowrap px-3 py-3 text-right font-semibold tabular-nums ${(m.profit ?? 0) < 0 ? "text-pos-rust" : "text-pos-green-ink"}`}>
                    {formatPesewas(m.profit ?? 0)}
                  </td>
                  <td className="py-3 pl-3 pr-[18px] text-right tabular-nums">{margin(m.profit, m.sales)}</td>
                </tr>
              );
            })}
          </tbody>
        </ScrollTable>
      </Card>

      <Card label="Best sellers">
        <div className="px-5 py-4">
          <h2 className="m-0 text-lg font-bold leading-6">Best sellers in {month.label}</h2>
          <p className="m-0 text-[13px] text-pos-muted">By sales value, before discounts and returns.</p>
        </div>
        {top.length === 0 ? (
          <p className="m-0 border-t border-pos-paper-deep px-5 py-6 text-sm text-pos-soft">No sales in {month.label}.</p>
        ) : (
          <ScrollTable minWidth={560}>
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
                  <td className="px-3 py-3 text-right tabular-nums">{t.qty.toLocaleString("en-US")}</td>
                  <td className="whitespace-nowrap px-3 py-3 text-right font-semibold tabular-nums">{formatPesewas(t.revenue)}</td>
                  <td className="whitespace-nowrap py-3 pl-3 pr-[18px] text-right tabular-nums">{t.profit === null ? "—" : formatPesewas(t.profit)}</td>
                </tr>
              ))}
            </tbody>
          </ScrollTable>
        )}
      </Card>
    </PageShell>
  );
}
