import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { formatPesewas } from "@/lib/money";
import { getPublicOrder } from "@/lib/server/orders";

// Order links are private: keep them out of search engines.
export async function generateMetadata({ params }: PageProps<"/o/[token]">): Promise<Metadata> {
  const order = await getPublicOrder((await params).token);
  return { title: order ? `Order ${order.orderCode}` : "Order", robots: { index: false, follow: false } };
}

const dateFormat = new Intl.DateTimeFormat("en-GH", { dateStyle: "medium", timeStyle: "short", timeZone: "Africa/Accra" });

/** Public order page: order code, items and total only, never the customer's name, phone or location. */
export default async function OrderPage({ params }: PageProps<"/o/[token]">) {
  const order = await getPublicOrder((await params).token);
  if (!order) notFound();

  return (
    <div className="mx-auto w-full max-w-2xl space-y-6 px-4 pb-16 pt-6">
      <div className="space-y-1">
        <h1 className="text-3xl font-bold text-brand-green">Order {order.orderCode}</h1>
        <p className="text-sm text-neutral-700">Placed {dateFormat.format(new Date(order.createdAt))}</p>
      </div>

      <table className="w-full border-collapse text-left">
        <caption className="sr-only">Items in order {order.orderCode}</caption>
        <thead>
          <tr className="border-b border-neutral-300 text-sm text-neutral-700">
            <th scope="col" className="py-2 pr-3 font-semibold">
              Item
            </th>
            <th scope="col" className="py-2 pr-3 text-right font-semibold">
              Qty
            </th>
            <th scope="col" className="py-2 text-right font-semibold">
              Total
            </th>
          </tr>
        </thead>
        <tbody>
          {order.items.map((item, i) => (
            <tr key={i} className="border-b border-neutral-200 align-top">
              <td className="py-3 pr-3">
                <p className="font-semibold">{item.productName}</p>
                {item.optionValues && <p className="text-sm text-neutral-700">{item.optionValues}</p>}
                <p className="text-sm text-neutral-700">{formatPesewas(item.unitPrice)} each</p>
              </td>
              <td className="py-3 pr-3 text-right">{item.qty}</td>
              <td className="py-3 text-right font-semibold">{formatPesewas(item.lineTotal)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <th scope="row" colSpan={2} className="pt-4 text-lg font-semibold">
              Items total
            </th>
            <td className="pt-4 text-right text-lg font-bold">{formatPesewas(order.itemsTotal)}</td>
          </tr>
        </tfoot>
      </table>

      <p className="rounded-lg bg-brand-gold/15 px-4 py-3 text-sm leading-relaxed">
        Delivery and payment are agreed on WhatsApp. The items total does not include delivery.
      </p>

      <Link href="/products" className="inline-flex min-h-11 items-center font-semibold">
        Continue shopping
      </Link>
    </div>
  );
}
