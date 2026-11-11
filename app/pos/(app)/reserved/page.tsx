import type { Metadata } from "next";
import Link from "next/link";
import { ChatIcon } from "@/components/pos/icons";
import { PaymentButton } from "@/components/pos/record-actions";
import { CollectedButton, ReservedDateButton } from "@/components/pos/reservation-actions";
import { ButtonLink, Card, PageHeader, PageShell, Pill, StatCard, StatGrid } from "@/components/pos/ui";
import { formatPesewas } from "@/lib/money";
import { DELIVERY_PILLS } from "@/lib/pos/deliveries";
import { formatDay, phoneText } from "@/lib/pos/format";
import { ghanaToday } from "@/lib/pos/invoices";
import { RESERVATION_DUE_CLASS, reservationDue, reservationDueText, reservationStockText } from "@/lib/pos/reservations";
import type { DeliveryStatus } from "@/lib/pos/deliveries";
import { requirePosUser } from "@/lib/server/pos/auth";
import { listOpenReservations } from "@/lib/server/pos/reservations";

export const metadata: Metadata = { title: "Reserved" };

/** Orders kept for customers to pick up or have delivered later. */
export default async function ReservedPage() {
  await requirePosUser();
  const rows = await listOpenReservations();
  const today = ghanaToday(new Date());
  const dueNow = rows.filter((r) => ["late", "today"].includes(reservationDue(r.until, today))).length;
  const owed = rows.reduce((n, r) => n + r.owed, 0);

  return (
    <PageShell>
      <PageHeader eyebrow="Sell" title="Reserved">
        <ButtonLink href="/pos/sell" kind="outline">
          Reserve an order
        </ButtonLink>
      </PageHeader>

      <StatGrid min={200}>
        <StatCard label="Waiting for the customer" value={rows.length.toLocaleString("en-US")} />
        <StatCard label="Due today or late" value={dueNow.toLocaleString("en-US")} tone={dueNow ? "warn" : "plain"} />
        <StatCard label="Still to pay" value={formatPesewas(owed)} tone="gold" dark />
      </StatGrid>

      <Card label="Reserved orders">
        {rows.length === 0 ? (
          <p className="m-0 px-5 py-12 text-center text-sm text-pos-soft">
            No orders are waiting. At the till, choose Reserve for later to keep an order for a customer.
          </p>
        ) : (
          <ul className="m-0 list-none p-0">
            {rows.map((r) => {
              const due = reservationDue(r.until, today);
              const delivery = r.deliveryAddress !== null;
              const deliveryPill = r.deliveryStatus ? DELIVERY_PILLS[r.deliveryStatus as DeliveryStatus] : null;
              return (
                <li
                  key={r.id}
                  className="flex flex-col gap-3 border-t border-pos-paper-deep px-5 py-4 first:border-t-0 md:flex-row md:items-start md:justify-between"
                >
                  <div className="flex min-w-0 flex-col gap-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <Link href={`/pos/sales/${r.id}`} className="font-bold text-pos-ink no-underline hover:underline">
                        {r.code}
                      </Link>
                      <Pill className={RESERVATION_DUE_CLASS[due]}>{reservationDueText(r.until, today, delivery)}</Pill>
                      <span className="text-[13px] text-pos-muted">Reserved {formatDay(r.createdAt)}</span>
                    </span>
                    <span className="text-[15px] font-semibold leading-[21px]">
                      {r.customerName ?? "Customer"}
                      {r.customerPhone && <span className="font-normal text-pos-soft"> · {phoneText(r.customerPhone)}</span>}
                    </span>
                    <span className="text-[13px] text-pos-soft">{r.items.join(", ") || "No items"}</span>
                    <span className="flex flex-wrap items-center gap-2 text-[13px]">
                      <span className="font-semibold text-pos-green-ink">{reservationStockText(r.status)}</span>
                      <span className="text-pos-muted">·</span>
                      {delivery ? (
                        <>
                          <span className="text-pos-soft">Deliver to {r.deliveryAddress}</span>
                          {deliveryPill && <Pill className={deliveryPill.className}>{deliveryPill.label}</Pill>}
                        </>
                      ) : (
                        <span className="text-pos-soft">Pick up in the shop</span>
                      )}
                    </span>
                  </div>
                  <div className="flex flex-col gap-2 md:items-end">
                    <span className="text-sm tabular-nums">
                      {formatPesewas(r.total)}
                      {r.paid > 0 && r.owed > 0 && <span className="text-pos-muted"> · {formatPesewas(r.paid)} paid</span>}
                    </span>
                    {r.owed > 0 ? (
                      <span className="text-[13px] font-bold tabular-nums text-pos-rust">{formatPesewas(r.owed)} to pay</span>
                    ) : (
                      <span className="text-[13px] font-bold text-pos-green-ink">Paid in full</span>
                    )}
                    <span className="flex flex-wrap gap-1.5 md:justify-end">
                      {r.customerPhone && (
                        <a
                          href={`https://wa.me/${r.customerPhone}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          aria-label={`WhatsApp ${r.customerName ?? "the customer"}`}
                          className="inline-flex min-h-9 items-center gap-1.5 rounded-md border border-pos-line bg-white px-3 text-[13px] font-semibold text-pos-ink no-underline hover:border-pos-muted max-md:min-h-11"
                        >
                          <ChatIcon size={15} />
                          Chat
                        </a>
                      )}
                      {r.owed > 0 && <PaymentButton kind="sale" id={r.id} owed={r.owed} code={r.code} />}
                      <ReservedDateButton saleId={r.id} code={r.code} until={r.until} today={today} />
                      {delivery ? (
                        <ButtonLink href="/pos/deliveries" kind="outline" size="sm" className="px-3">
                          Deliveries
                        </ButtonLink>
                      ) : (
                        <CollectedButton saleId={r.id} code={r.code} owed={r.owed} onShelf={r.status === "reserved"} />
                      )}
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </PageShell>
  );
}
