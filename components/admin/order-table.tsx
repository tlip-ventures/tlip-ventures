import Link from "next/link";
import { formatPesewas } from "@/lib/money";
import { formatGhanaPhone } from "@/lib/phone";
import type { OrderSummary } from "@/lib/server/admin-orders";
import { StatusBadge } from "./status-badge";

export const adminDate = new Intl.DateTimeFormat("en-GH", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Africa/Accra",
});

/** Orders as a list of cards on phones, a table-like grid on wider screens. */
export function OrderTable({ orders }: { orders: OrderSummary[] }) {
  if (orders.length === 0) {
    return <p className="rounded-lg bg-neutral-50 px-4 py-8 text-center">No orders here yet.</p>;
  }
  return (
    <ul className="divide-y divide-neutral-200 rounded-lg border border-neutral-200">
      {orders.map((order) => (
        <li key={order.id}>
          <Link
            href={`/admin/orders/${order.id}`}
            className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 p-3 text-ink no-underline hover:bg-neutral-50 sm:grid-cols-[7rem_1fr_9rem_8rem_10rem] sm:items-center"
          >
            <span className="font-bold text-brand-green">{order.order_code}</span>
            <span className="text-right font-semibold sm:order-4 sm:text-right">{formatPesewas(order.items_total)}</span>
            <span className="min-w-0 truncate sm:order-2">
              {order.customer_name} <span className="text-sm text-neutral-700">· {formatGhanaPhone(order.phone)}</span>
            </span>
            <span className="text-right sm:order-5">
              <StatusBadge status={order.status} />
            </span>
            <span className="col-span-2 text-sm text-neutral-700 sm:order-3 sm:col-span-1">
              {adminDate.format(new Date(order.created_at))}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
