import Form from "next/form";
import Link from "next/link";
import { formatPesewas } from "@/lib/money";
import { formatDay, plural } from "@/lib/pos/format";
import { barHeight, chartTop, percentChange, PERIOD_LABELS, PERIODS, shortMoney, type Period } from "@/lib/pos/periods";
import { paymentPill, saleStatusPill } from "@/lib/pos/records";
import type { MoneyOwed, PeriodFigures, WebsiteOrder } from "@/lib/server/pos/dashboard";
import type { RecordRow } from "@/lib/server/pos/records";
import type { StockRow } from "@/lib/server/pos/stock";
import { BellIcon, ChatIcon, SearchIcon } from "./icons";
import { ProductTile } from "./product-tile";
import { MarkOrderPaidButton } from "./record-actions";
import { buttonClass, Pill, ScrollTable, TableHead, Th } from "./ui";

// The design's Dashboard (design/pos/dashboard.html), piece by piece.

const card = "flex flex-col rounded-[10px] border border-pos-card-line bg-white";
const sectionTitle = "m-0 text-lg font-bold leading-6";

export type Alert = { href: string; text: string };

/** Search and the bell in the top bar. The bell's list opens without JavaScript (popover). */
export function TopBarTools({ alerts }: { alerts: Alert[] }) {
  return (
    <div className="flex flex-wrap items-center gap-2.5">
      <Form action="/pos/search" role="search" className="w-[300px] max-w-full flex-[1_1_220px]">
        <label htmlFor="tv-q" className="sr-only">
          Search products, sales or customers
        </label>
        <div className="box-border flex h-11 items-center gap-2.5 rounded-md border border-pos-line bg-white px-3.5 text-pos-muted focus-within:border-pos-green">
          <SearchIcon size={18} />
          <input
            id="tv-q"
            name="q"
            type="search"
            placeholder="Search products, sales, customers"
            className="min-w-0 flex-1 border-0 bg-transparent text-sm text-pos-ink outline-none placeholder:text-pos-muted"
          />
        </div>
      </Form>
      <button
        type="button"
        popoverTarget="pos-alerts"
        aria-label={alerts.length ? `Notifications, ${alerts.length} new` : "Notifications, none"}
        className="relative flex h-11 w-11 flex-none items-center justify-center rounded-md border border-pos-line bg-white text-pos-ink"
      >
        <BellIcon />
        {alerts.length > 0 && <span className="absolute right-1.5 top-1.5 h-[9px] w-[9px] rounded-full border-2 border-white bg-pos-orange" />}
      </button>
      <div
        id="pos-alerts"
        popover="auto"
        className="fixed inset-auto right-4 top-20 m-0 w-[min(340px,calc(100vw-32px))] rounded-[10px] border border-pos-card-line bg-white p-0 text-pos-ink shadow-[0_24px_48px_rgba(17,17,17,0.12)] md:right-8"
      >
        <h2 className="m-0 border-b border-pos-paper-deep px-4 py-3 text-[15px] font-bold">Needs you</h2>
        {alerts.length ? (
          <ul className="m-0 list-none p-0">
            {alerts.map((a) => (
              <li key={a.href} className="border-b border-pos-paper-deep last:border-b-0">
                <Link href={a.href} className="flex min-h-11 items-center px-4 py-2 text-sm font-semibold no-underline hover:bg-pos-row-hover">
                  {a.text}
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="m-0 px-4 py-4 text-sm text-pos-soft">Nothing waiting. All caught up.</p>
        )}
      </div>
    </div>
  );
}

/** This week / This month / This year: links, so it works without JavaScript. */
export function PeriodSwitch({ current }: { current: Period }) {
  return (
    <nav aria-label="Period" className="flex rounded-lg bg-pos-paper-deep p-[3px]">
      {PERIODS.map((p) => {
        const on = p === current;
        return (
          <Link
            key={p}
            href={p === "week" ? "/pos" : `/pos?period=${p}`}
            aria-current={on ? "true" : undefined}
            scroll={false}
            className={`flex min-h-[38px] items-center rounded-md px-4 text-[13px] text-pos-ink no-underline hover:text-pos-ink ${
              on ? "bg-white font-bold shadow-[0_1px_2px_rgba(17,17,17,0.12)]" : "font-medium"
            }`}
          >
            {PERIOD_LABELS[p]}
          </Link>
        );
      })}
    </nav>
  );
}

const moneyFigure = "font-pos-display text-[38px] leading-none tabular-nums";
const moneyCard = "box-border flex min-h-[148px] flex-col gap-2.5 rounded-[10px] p-5";

export function MoneyCards({ figures, owed }: { figures: PeriodFigures; owed: MoneyOwed }) {
  const delta = percentChange(figures.sales, figures.prevSales);
  const supplierNames = owed.suppliers?.names ?? [];
  return (
    <div className="grid gap-3.5" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(min(230px, 100%), 1fr))" }}>
      <div className={`${moneyCard} bg-pos-forest text-pos-on-forest`}>
        <span className="text-[13px] font-semibold text-pos-on-forest-muted">Sales {figures.word}</span>
        <span className={moneyFigure}>{formatPesewas(figures.sales)}</span>
        <span className="text-[13px] leading-[18px] text-pos-on-forest-muted">
          {delta && (
            <>
              <span className="font-bold text-pos-gold">{delta}</span> on {figures.prevWord} ·{" "}
            </>
          )}
          {plural(figures.count, "sale")}
        </span>
      </div>
      {figures.profit !== null && (
        <div className={`${moneyCard} border border-pos-card-line bg-white`}>
          <span className="text-[13px] font-semibold text-pos-muted">Profit {figures.word}</span>
          <span className={moneyFigure}>{formatPesewas(figures.profit)}</span>
          <span className="text-[13px] leading-[18px] text-pos-muted">
            {figures.missingCosts
              ? `${plural(figures.missingCosts, "item")} sold with no cost price, so this is too high`
              : "After what you paid suppliers for those items"}
          </span>
        </div>
      )}
      <Link href="/pos/sales?filter=unpaid" className={`${moneyCard} border border-pos-card-line bg-white text-pos-ink no-underline hover:text-pos-ink`}>
        <span className="text-[13px] font-semibold text-pos-muted">Customers owe you</span>
        <span className={`${moneyFigure} text-pos-terracotta`}>{formatPesewas(owed.customers.total)}</span>
        <span className="text-[13px] leading-[18px] text-pos-muted">
          {owed.customers.sales ? `${plural(owed.customers.sales, "unpaid sale")} · ` : "Nothing unpaid · "}
          <span className="font-bold text-pos-green">Collect</span>
        </span>
      </Link>
      {owed.suppliers && (
        <Link href="/pos/purchases?filter=unpaid" className={`${moneyCard} border border-pos-card-line bg-white text-pos-ink no-underline hover:text-pos-ink`}>
          <span className="text-[13px] font-semibold text-pos-muted">You owe suppliers</span>
          <span className={moneyFigure}>{formatPesewas(owed.suppliers.total)}</span>
          <span className="text-[13px] leading-[18px] text-pos-muted">
            {supplierNames.length
              ? `${supplierNames.slice(0, 2).join(", ")}${supplierNames.length > 2 ? ` and ${supplierNames.length - 2} more` : ""} · `
              : "All bills paid · "}
            <span className="font-bold text-pos-green">See bills</span>
          </span>
        </Link>
      )}
    </div>
  );
}

/** Sales (green) and purchases (orange) side by side for each day, week or month. */
export function SalesChart({ figures, showPurchases }: { figures: PeriodFigures; showPurchases: boolean }) {
  const max = Math.max(0, ...figures.bars.map((b) => Math.max(b.sales, showPurchases ? b.purchases : 0)));
  const top = chartTop(max);
  const aria = showPurchases
    ? `Sales ${formatPesewas(figures.sales)} and purchases ${formatPesewas(figures.purchases)} ${figures.word}`
    : `Sales ${formatPesewas(figures.sales)} ${figures.word}`;
  return (
    <section aria-labelledby="tv-chart" className={`${card} gap-4 px-5 pb-4 pt-5`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="tv-chart" className={sectionTitle}>
          {showPurchases ? "Sales and purchases" : "Sales"}
        </h2>
        <div className="flex flex-wrap gap-4 text-[13px] text-pos-muted">
          <span className="flex items-center gap-1.5">
            <span className="h-3 w-3 rounded-[3px] bg-pos-green" />
            Sales {formatPesewas(figures.sales)}
          </span>
          {showPurchases && (
            <span className="flex items-center gap-1.5">
              <span className="h-3 w-3 rounded-[3px] bg-pos-orange" />
              Purchases {formatPesewas(figures.purchases)}
            </span>
          )}
        </div>
      </div>
      <div className="flex gap-2.5">
        <div aria-hidden="true" className="flex h-[220px] min-w-[52px] flex-col justify-between text-right text-[11px] tabular-nums text-pos-muted">
          <span>{shortMoney(top)}</span>
          <span>{shortMoney(top / 2)}</span>
          <span>GH₵ 0</span>
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <div role="img" aria-label={aria} className="relative flex h-[220px] items-end gap-1.5 border-b border-pos-line">
            <div aria-hidden="true" className="absolute inset-x-0 top-0 border-t border-dashed border-pos-card-line" />
            <div aria-hidden="true" className="absolute inset-x-0 top-1/2 border-t border-dashed border-pos-card-line" />
            {figures.bars.map((b) => (
              <div key={b.label} className="relative flex h-full min-w-0 flex-1 items-end justify-center gap-[3px]">
                <span
                  title={`${b.label} sales ${formatPesewas(b.sales)}`}
                  className="block w-[42%] max-w-[22px] rounded-t-[3px] bg-pos-green"
                  style={{ height: barHeight(b.sales, top, 1) }}
                />
                {showPurchases && (
                  <span
                    title={`${b.label} purchases ${formatPesewas(b.purchases)}`}
                    className="block w-[42%] max-w-[22px] rounded-t-[3px] bg-pos-orange"
                    style={{ height: barHeight(b.purchases, top, 0) }}
                  />
                )}
              </div>
            ))}
          </div>
          <div aria-hidden="true" className="flex gap-1.5">
            {figures.bars.map((b) => (
              <span key={b.label} className="min-w-0 flex-1 overflow-hidden whitespace-nowrap text-center text-[11px] leading-[14px] text-pos-muted">
                <span className="sm:hidden">{b.short}</span>
                <span className="hidden sm:inline">{b.label}</span>
              </span>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function restockPill(r: StockRow) {
  if (r.onHand < 0) return { label: `Oversold by ${-r.onHand}`, className: "bg-pos-tint-orange text-pos-rust" };
  if (r.onHand === 0) return { label: "Out of stock", className: "bg-pos-paper-deep text-pos-muted" };
  return { label: `${r.onHand} left`, className: "bg-pos-tint-orange text-pos-rust" };
}

export function RestockCard({ rows, total, isOwner }: { rows: StockRow[]; total: number; isOwner: boolean }) {
  return (
    <section aria-labelledby="tv-restock" className={`${card} overflow-hidden`}>
      <div className="flex items-center justify-between gap-3 bg-pos-peach px-5 py-4">
        <div className="flex flex-col gap-0.5">
          <h2 id="tv-restock" className={sectionTitle}>
            Restock soon
          </h2>
          <span className="text-[13px] text-pos-muted">
            {total ? `${plural(total, "item")} sold out or below their alert level` : "Everything is above its alert level"}
          </span>
        </div>
        {total > 0 && (
          <Link
            href="/pos/products?filter=low"
            className="inline-flex min-h-10 items-center whitespace-nowrap rounded-md bg-pos-ink px-3.5 text-[13px] font-bold text-white no-underline hover:bg-black hover:text-white"
          >
            {isOwner ? "Reorder all" : "See all"}
          </Link>
        )}
      </div>
      {rows.length === 0 ? (
        <p className="m-0 border-t border-pos-paper-deep px-5 py-6 text-sm text-pos-soft">Nothing to restock right now.</p>
      ) : (
        <ul className="m-0 flex list-none flex-col p-0">
          {rows.map((r) => {
            const pill = restockPill(r);
            const name = r.optionLabel ? `${r.productName} (${r.optionLabel})` : r.productName;
            return (
              <li key={r.variantId} className="pos-row flex min-h-14 items-center gap-3 border-t border-pos-paper-deep px-5 py-2">
                <ProductTile imageUrl={r.imageUrl} sku={r.sku} name={r.productName} category={r.topCategoryName} size={40} />
                <span className="flex min-w-0 flex-1 flex-col">
                  <Link href={`/pos/products/${r.productId}`} className="truncate text-sm font-semibold leading-5 text-pos-ink no-underline hover:underline">
                    {name}
                  </Link>
                  <span className="text-xs leading-4 text-pos-muted">Accra shop</span>
                </span>
                <Pill className={`px-2 py-[3px] ${pill.className}`}>{pill.label}</Pill>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function waLink(phone: string | null) {
  return phone ? `https://wa.me/${phone}` : null;
}

export function WebsiteOrders({ orders, total }: { orders: WebsiteOrder[]; total: number }) {
  return (
    <section
      id="website-orders"
      aria-labelledby="tv-web"
      className="box-border flex min-w-0 flex-[1_1_320px] flex-col gap-3.5 rounded-[10px] border border-pos-card-line bg-white p-5"
    >
      <div className="flex flex-col gap-1">
        <span className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-pos-green">
          <ChatIcon size={16} />
          From the website
        </span>
        <h2 id="tv-web" className={sectionTitle}>
          Orders waiting on WhatsApp
        </h2>
        <span className="text-[13px] leading-[18px] text-pos-muted">Baskets customers sent from the shop site. Confirm once they pay.</span>
      </div>
      {orders.length === 0 ? (
        <p className="m-0 rounded-lg border border-pos-paper-deep px-3.5 py-5 text-center text-sm text-pos-soft">No website orders waiting.</p>
      ) : (
        orders.map((o) => {
          const pill = saleStatusPill(o.status);
          const chat = waLink(o.phone);
          return (
            <div key={o.id} className="flex flex-col gap-2.5 rounded-lg border border-pos-paper-deep p-3.5">
              <div className="flex items-baseline justify-between gap-2">
                <Link href={`/pos/sales/${o.id}`} className="text-sm font-bold text-pos-ink no-underline hover:underline">
                  {o.code}
                </Link>
                <span className="text-base font-bold tabular-nums">{formatPesewas(o.total)}</span>
              </div>
              <div className="flex items-center justify-between gap-2 text-[13px] text-pos-muted">
                <span>
                  {o.name ?? "Online customer"} · {formatDay(o.createdAt)}
                </span>
                <Pill className={pill.className}>{pill.label}</Pill>
              </div>
              <div className="flex gap-2">
                {chat && (
                  <a href={chat} target="_blank" rel="noopener noreferrer" className={`${buttonClass("outline", "sm")} min-h-10 flex-1`}>
                    Open chat
                  </a>
                )}
                <MarkOrderPaidButton saleId={o.id} code={o.code} total={o.total} buttonKind="primary" className="min-h-10 flex-1" />
              </div>
            </div>
          );
        })
      )}
      {total > orders.length && (
        <Link href="/pos/sales?q=TV-" className="self-start text-[13px] font-bold">
          {plural(total - orders.length, "more order")}
        </Link>
      )}
    </section>
  );
}

export function RecentSales({ rows }: { rows: RecordRow[] }) {
  return (
    <section aria-labelledby="tv-recent" className="flex min-w-0 flex-[2.2_1_560px] flex-col overflow-hidden rounded-[10px] border border-pos-card-line bg-white">
      <div className="flex items-center justify-between gap-3 px-5 py-4">
        <h2 id="tv-recent" className={sectionTitle}>
          Recent sales
        </h2>
        <Link href="/pos/sales" className="inline-flex min-h-10 items-center text-[13px] font-bold no-underline">
          All sales
        </Link>
      </div>
      {rows.length === 0 ? (
        <p className="m-0 border-t border-pos-paper-deep px-5 py-8 text-center text-sm text-pos-soft">No sales yet. Ring one up at the till.</p>
      ) : (
        <ScrollTable minWidth={620}>
          <TableHead>
            <Th>Sale</Th>
            <Th>Customer</Th>
            <Th>Status</Th>
            <Th align="right">Total</Th>
            <Th align="right">Still owed</Th>
            <Th>Payment</Th>
          </TableHead>
          <tbody>
            {rows.map((s) => {
              const status = saleStatusPill(s.saleStatus!);
              const pay = paymentPill(s.paid, s.owed, s.cancelled);
              return (
                <tr key={s.id} className="pos-row border-t border-pos-paper-deep">
                  <td className="py-3 pl-[18px] pr-3 font-bold">
                    <Link href={`/pos/sales/${s.id}`} className="text-pos-ink no-underline hover:underline">
                      {s.code}
                    </Link>
                  </td>
                  <td className="p-3">{s.party}</td>
                  <td className="p-3">
                    <Pill className={`px-2 py-0.5 ${status.className}`}>{status.label}</Pill>
                  </td>
                  <td className="whitespace-nowrap p-3 text-right font-semibold tabular-nums">{formatPesewas(s.total)}</td>
                  <td className={`whitespace-nowrap p-3 text-right tabular-nums ${s.owed ? "text-pos-rust" : "text-pos-muted"}`}>
                    {s.owed ? formatPesewas(s.owed) : "—"}
                  </td>
                  <td className="py-3 pl-3 pr-[18px]">
                    <Pill className={`px-2 py-0.5 ${pay.className}`}>{pay.label}</Pill>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </ScrollTable>
      )}
    </section>
  );
}
