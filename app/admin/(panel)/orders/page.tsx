import type { Metadata } from "next";
import Form from "next/form";
import Link from "next/link";
import { z } from "zod";
import { OrderTable } from "@/components/admin/order-table";
import { ORDER_STATUSES, STATUS_LABELS } from "@/lib/order-status";
import { pageCount } from "@/lib/pagination";
import { ADMIN_PAGE_SIZE, listOrders } from "@/lib/server/admin-orders";

export const metadata: Metadata = { title: "Orders" };

const first = (v: unknown) => (Array.isArray(v) ? v[0] : v);
const paramsSchema = z.object({
  status: z.preprocess(first, z.enum(ORDER_STATUSES).optional()).catch(undefined),
  page: z.preprocess(first, z.coerce.number().int().min(1).max(10_000)).catch(1),
  q: z.preprocess(first, z.string().trim().max(100)).catch(""),
});

export default async function OrdersPage({ searchParams }: PageProps<"/admin/orders">) {
  const params = paramsSchema.parse(await searchParams);
  const { orders, total } = await listOrders({ status: params.status, page: params.page, search: params.q });
  const pages = pageCount(total, ADMIN_PAGE_SIZE);

  const href = (changes: Partial<typeof params>) => {
    const next = { ...params, ...changes };
    const query = new URLSearchParams();
    if (next.status) query.set("status", next.status);
    if (next.q) query.set("q", next.q);
    if (next.page > 1) query.set("page", String(next.page));
    const s = query.toString();
    return `/admin/orders${s ? `?${s}` : ""}`;
  };
  const chip = (current: boolean) =>
    `inline-flex min-h-11 items-center rounded-full border px-4 text-sm font-semibold no-underline ${
      current ? "border-brand-green bg-brand-green text-white" : "border-neutral-300 text-ink hover:border-brand-green"
    }`;

  return (
    <div className="space-y-4">
      <h1 className="text-3xl font-bold text-brand-green">Orders</h1>

      <Form action="/admin/orders" className="flex max-w-md gap-2">
        {params.status && <input type="hidden" name="status" value={params.status} />}
        <label htmlFor="order-search" className="sr-only">
          Search orders
        </label>
        <input
          id="order-search"
          name="q"
          type="search"
          defaultValue={params.q}
          placeholder="Order code, name or phone"
          className="min-h-11 w-full rounded-lg border border-neutral-400 px-3 text-base"
        />
        <button type="submit" className="min-h-11 rounded-lg bg-brand-green px-4 font-semibold text-white">
          Search
        </button>
      </Form>

      <nav aria-label="Filter by status" className="-mx-4 overflow-x-auto px-4">
        <ul className="flex gap-2 whitespace-nowrap">
          <li>
            <Link href={href({ status: undefined, page: 1 })} aria-current={!params.status ? "true" : undefined} className={chip(!params.status)}>
              All
            </Link>
          </li>
          {ORDER_STATUSES.map((status) => (
            <li key={status}>
              <Link
                href={href({ status, page: 1 })}
                aria-current={params.status === status ? "true" : undefined}
                className={chip(params.status === status)}
              >
                {STATUS_LABELS[status]}
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      <p className="text-sm text-neutral-700">
        {total} {total === 1 ? "order" : "orders"}
      </p>
      <OrderTable orders={orders} />

      {pages > 1 && (
        <nav aria-label="Pages" className="flex items-center justify-between pt-4">
          {params.page > 1 ? (
            <Link href={href({ page: params.page - 1 })} className="inline-flex min-h-11 items-center font-semibold">
              ← Newer
            </Link>
          ) : (
            <span />
          )}
          <span className="text-sm">
            Page {params.page} of {pages}
          </span>
          {params.page < pages ? (
            <Link href={href({ page: params.page + 1 })} className="inline-flex min-h-11 items-center font-semibold">
              Older →
            </Link>
          ) : (
            <span />
          )}
        </nav>
      )}
    </div>
  );
}
