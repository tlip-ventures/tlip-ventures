import type { Metadata } from "next";
import { z } from "zod";
import { MoneyCards, PeriodSwitch, RecentSales, RestockCard, SalesChart, TopBarTools, WebsiteOrders, type Alert } from "@/components/pos/dashboard";
import { PageShell } from "@/components/pos/ui";
import { formatPesewas } from "@/lib/money";
import { formatLongDay, plural } from "@/lib/pos/format";
import { greeting, PERIODS } from "@/lib/pos/periods";
import { requirePosUser } from "@/lib/server/pos/auth";
import { getMoneyOwed, getPeriodFigures, getWebsiteOrders } from "@/lib/server/pos/dashboard";
import { listRecords } from "@/lib/server/pos/records";
import { getStockSummary, listStockRows } from "@/lib/server/pos/stock";

export const metadata: Metadata = { title: "Dashboard" };

const paramsSchema = z.object({
  period: z.preprocess((v) => (Array.isArray(v) ? v[0] : v), z.enum(PERIODS)).catch("week"),
});

export default async function DashboardPage({ searchParams }: PageProps<"/pos">) {
  const { period } = paramsSchema.parse(await searchParams);
  const user = await requirePosUser();
  const now = new Date();
  const [figures, owed, web, recent, attention, summary] = await Promise.all([
    getPeriodFigures(period, now),
    getMoneyOwed(),
    getWebsiteOrders(),
    listRecords("sales", { page: 1, pageSize: 5 }),
    listStockRows({ filter: "all", order: "attention", page: 1, pageSize: 5 }),
    getStockSummary(),
  ]);
  const restock = attention.rows.filter((r) => r.state !== "ok");
  const restockTotal = summary.low + summary.recount;

  const alerts: Alert[] = [];
  if (web.total) alerts.push({ href: "#website-orders", text: `${plural(web.total, "website order")} waiting on WhatsApp` });
  if (summary.recount) alerts.push({ href: "/pos/products?filter=recount", text: `${plural(summary.recount, "product")} to recount` });
  if (summary.low) alerts.push({ href: "/pos/products?filter=low", text: `${plural(summary.low, "product")} sold out or running low` });
  if (owed.customers.total) alerts.push({ href: "/pos/sales?filter=unpaid", text: `Customers owe you ${formatPesewas(owed.customers.total)}` });

  return (
    <PageShell>
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1.5">
          <span className="text-[13px] leading-[18px] text-pos-muted">{formatLongDay(now)}</span>
          <h1 className="m-0 font-pos-display text-[32px] font-normal leading-[1.05] tracking-[-0.01em] md:text-[40px]">
            {greeting(now)}. Here is the shop.
          </h1>
        </div>
        <TopBarTools alerts={alerts} />
      </header>

      <section aria-labelledby="tv-money" className="flex flex-col gap-3.5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="tv-money" className="m-0 text-[13px] font-semibold uppercase leading-[18px] tracking-[0.14em] text-pos-muted">
            Money
          </h2>
          <PeriodSwitch current={period} />
        </div>
        <MoneyCards figures={figures} owed={owed} />
      </section>

      <div className="grid gap-3.5" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(min(420px, 100%), 1fr))" }}>
        <SalesChart figures={figures} showPurchases={user.isOwner} />
        <RestockCard rows={restock} total={restockTotal} isOwner={user.isOwner} />
      </div>

      <div className="flex flex-wrap items-start gap-3.5">
        <WebsiteOrders orders={web.orders} total={web.total} />
        <RecentSales rows={recent.rows} />
      </div>
    </PageShell>
  );
}
