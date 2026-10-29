import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { adminDate } from "@/components/admin/order-table";
import { StatusBadge } from "@/components/admin/status-badge";
import { formatPesewas } from "@/lib/money";
import { nextStatus, ORDER_STATUSES, STATUS_LABELS, type OrderStatus } from "@/lib/order-status";
import { formatGhanaPhone } from "@/lib/phone";
import { getOrder, getOrderSale } from "@/lib/server/admin-orders";
import { whatsappUrl } from "@/lib/whatsapp";
import { updateOrderStatus } from "../actions";

export const metadata: Metadata = { title: "Order" };

const PAID_STAGES: readonly OrderStatus[] = ["paid", "dispatched", "delivered"];

export default async function OrderPage({ params }: PageProps<"/admin/orders/[id]">) {
  const id = z.uuid().safeParse((await params).id);
  if (!id.success) notFound();
  const [order, sale] = await Promise.all([getOrder(id.data), getOrderSale(id.data)]);
  if (!order) notFound();

  const next = nextStatus(order.status);
  // Website sync: "paid" is set by Mark as paid in Stock and sales, which also
  // takes the items off the shelf; until then the database refuses it here.
  const salePaid = sale?.status === "completed" || sale?.status === "voided";
  const blocked = (status: OrderStatus) => {
    if (!sale || status === order.status || sale.status === "voided") return false;
    // Paid there: only dispatched and delivered from here. Not paid yet: not "paid" from here.
    return sale.status === "completed" ? !PAID_STAGES.includes(status) : PAID_STAGES.includes(status);
  };

  return (
    <div className="space-y-6">
      <Link href="/admin/orders" className="inline-flex min-h-11 items-center text-sm font-semibold">
        ← All orders
      </Link>

      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-3xl font-bold text-brand-green">{order.order_code}</h1>
        <StatusBadge status={order.status} />
      </div>
      <p className="text-sm text-neutral-700">
        Placed {adminDate.format(new Date(order.created_at))}
        {order.updated_at !== order.created_at && ` · updated ${adminDate.format(new Date(order.updated_at))}`}
      </p>

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="space-y-6">
          <section aria-labelledby="customer-heading" className="space-y-2 rounded-lg border border-neutral-200 p-4">
            <h2 id="customer-heading" className="text-lg font-bold text-brand-green">
              Customer
            </h2>
            <p className="text-lg font-semibold">{order.customer_name}</p>
            <p>{formatGhanaPhone(order.phone)}</p>
            {order.location && (
              <p>
                <span className="font-semibold">Location:</span> {order.location}
              </p>
            )}
            <div className="flex flex-wrap gap-3">
              <a
                href={whatsappUrl(order.phone, `Hi ${order.customer_name}, about your order ${order.order_code}: `)}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex min-h-11 items-center rounded-lg bg-brand-orange-dark px-4 text-base font-bold text-white no-underline hover:bg-brand-orange-deep"
              >
                WhatsApp customer
              </a>
              <a
                href={`tel:+${order.phone}`}
                className="inline-flex min-h-11 items-center rounded-lg border-2 border-brand-green px-4 font-semibold text-brand-green no-underline"
              >
                Call
              </a>
            </div>
            {order.notes && (
              <div className="pt-2">
                <h3 className="font-sans text-sm font-semibold text-neutral-700">Note from customer</h3>
                <p className="whitespace-pre-line">{order.notes}</p>
              </div>
            )}
          </section>

          <section aria-labelledby="items-heading" className="space-y-2">
            <h2 id="items-heading" className="text-lg font-bold text-brand-green">
              Items
            </h2>
            <ul className="divide-y divide-neutral-200 rounded-lg border border-neutral-200">
              {order.order_items.map((item) => {
                const slug = item.product_variants?.products?.slug;
                return (
                  <li key={item.id} className="flex justify-between gap-4 p-3">
                    <div>
                      <p className="font-semibold">
                        {item.qty} × {slug ? <Link href={`/products/${slug}`}>{item.product_name}</Link> : item.product_name}
                      </p>
                      {item.option_values && <p className="text-sm text-neutral-700">{item.option_values}</p>}
                      <p className="text-sm text-neutral-700">{formatPesewas(item.unit_price)} each</p>
                    </div>
                    <p className="font-semibold">{formatPesewas(item.line_total)}</p>
                  </li>
                );
              })}
              <li className="flex justify-between gap-4 p-3 text-lg">
                <span className="font-semibold">Items total</span>
                <span className="font-bold">{formatPesewas(order.items_total)}</span>
              </li>
            </ul>
            <p className="text-sm text-neutral-700">
              Prices are as they were when the order was placed. Delivery is agreed separately on WhatsApp.
            </p>
            <a href={`/o/${order.public_token}`} className="inline-flex min-h-11 items-center text-sm font-semibold">
              Public order page (no name, phone or location)
            </a>
          </section>
        </div>

        <section aria-labelledby="status-heading" className="h-fit space-y-4 rounded-lg border border-neutral-200 p-4">
          <h2 id="status-heading" className="text-lg font-bold text-brand-green">
            Status
          </h2>
          {next && sale && next === "paid" && !salePaid ? (
            <Link
              href={`/pos/sales/${sale.id}`}
              className="inline-flex min-h-11 w-full items-center justify-center rounded-lg bg-brand-green px-4 text-center font-bold text-white no-underline hover:bg-brand-green/90"
            >
              Mark as paid in Stock and sales
            </Link>
          ) : next && !blocked(next) && (
            <form action={updateOrderStatus}>
              <input type="hidden" name="orderId" value={order.id} />
              <input type="hidden" name="status" value={next} />
              <button
                type="submit"
                className="inline-flex min-h-11 w-full items-center justify-center rounded-lg bg-brand-green px-4 font-bold text-white hover:bg-brand-green/90"
              >
                Mark as {STATUS_LABELS[next].toLowerCase()}
              </button>
            </form>
          )}
          <form action={updateOrderStatus} className="space-y-2">
            <input type="hidden" name="orderId" value={order.id} />
            <label htmlFor="status" className="block text-sm font-semibold">
              Or set any status
            </label>
            <div className="flex gap-2">
              <select
                id="status"
                name="status"
                defaultValue={order.status}
                key={order.status}
                className="min-h-11 flex-1 rounded-lg border border-neutral-400 bg-white px-2 text-base"
              >
                {ORDER_STATUSES.map((status) => (
                  <option key={status} value={status} disabled={blocked(status)}>
                    {STATUS_LABELS[status]}
                  </option>
                ))}
              </select>
              <button type="submit" className="min-h-11 rounded-lg border-2 border-brand-green px-4 font-semibold text-brand-green">
                Save
              </button>
            </div>
          </form>
          <p className="text-xs text-neutral-700">
            Orders still awaiting WhatsApp after 48 hours become “Not sent” automatically. Every order is also a sale in{" "}
            <Link href={sale ? `/pos/sales/${sale.id}` : "/pos/sales"}>Stock and sales</Link>: marking it paid there takes the items off the
            shelf and sets it to Paid here. A paid order is cancelled there, not here.
          </p>
        </section>
      </div>
    </div>
  );
}
