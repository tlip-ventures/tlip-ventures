import type { Metadata } from "next";
import Link from "next/link";
import { OrderTable } from "@/components/admin/order-table";
import { STATUS_LABELS, type OrderStatus } from "@/lib/order-status";
import { listOrders, orderCounts } from "@/lib/server/admin-orders";

export const metadata: Metadata = { title: "Admin" };

const TILES: { status: OrderStatus; hint: string }[] = [
  { status: "awaiting_whatsapp", hint: "Saved, waiting for the WhatsApp message" },
  { status: "confirmed", hint: "Confirmed, waiting for payment" },
  { status: "paid", hint: "Paid, ready to send out" },
  { status: "dispatched", hint: "On the way" },
];

export default async function AdminHome() {
  const [counts, recent] = await Promise.all([orderCounts(), listOrders({ page: 1 })]);

  return (
    <div className="space-y-8">
      <h1 className="text-3xl font-bold text-brand-green">Orders to follow up</h1>
      <ul className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {TILES.map(({ status, hint }) => (
          <li key={status}>
            <Link
              href={`/admin/orders?status=${status}`}
              className="flex h-full flex-col gap-1 rounded-lg border border-neutral-200 p-4 text-ink no-underline hover:border-brand-green"
            >
              <span className="text-3xl font-bold text-brand-green">{counts[status] ?? 0}</span>
              <span className="font-semibold">{STATUS_LABELS[status]}</span>
              <span className="text-sm text-neutral-700">{hint}</span>
            </Link>
          </li>
        ))}
      </ul>

      <section aria-labelledby="recent-heading" className="space-y-3">
        <div className="flex items-baseline justify-between">
          <h2 id="recent-heading" className="text-xl font-bold text-brand-green">
            Latest orders
          </h2>
          <Link href="/admin/orders" className="inline-flex min-h-11 items-center font-semibold">
            All orders
          </Link>
        </div>
        <OrderTable orders={recent.orders.slice(0, 10)} />
      </section>
    </div>
  );
}
