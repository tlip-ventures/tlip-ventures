import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { SearchForm } from "@/components/pos/list-controls";
import { ProductTile } from "@/components/pos/product-tile";
import { Card, PageHeader, PageShell, Pill } from "@/components/pos/ui";
import { formatPesewas } from "@/lib/money";
import { formatDay, phoneText } from "@/lib/pos/format";
import { STOCK_PILLS, variantName } from "@/lib/pos/stock";
import { requirePosUser } from "@/lib/server/pos/auth";
import { listCustomers, listRecords } from "@/lib/server/pos/records";
import { listStockRows } from "@/lib/server/pos/stock";

export const metadata: Metadata = { title: "Search" };

const LIMIT = 8;

function Group({ title, more, children, empty }: { title: string; more: { href: string; count: number } | null; children: ReactNode; empty: boolean }) {
  return (
    <Card label={title}>
      <div className="flex items-center justify-between gap-3 px-5 py-4">
        <h2 className="m-0 text-lg font-bold leading-6">{title}</h2>
        {more && more.count > LIMIT && (
          <Link href={more.href} className="text-[13px] font-bold">
            All {more.count.toLocaleString("en-US")}
          </Link>
        )}
      </div>
      {empty ? <p className="m-0 border-t border-pos-paper-deep px-5 py-4 text-sm text-pos-soft">Nothing found.</p> : <ul className="m-0 list-none p-0">{children}</ul>}
    </Card>
  );
}

const row = "pos-row flex min-h-14 items-center gap-3 border-t border-pos-paper-deep px-5 py-2 text-sm";

/** The dashboard's search box: products, sales, customers (and purchases for the owner). */
export default async function SearchPage({ searchParams }: PageProps<"/pos/search">) {
  const raw = (await searchParams).q;
  const q = (Array.isArray(raw) ? raw[0] : raw ?? "").trim().slice(0, 100);
  const user = await requirePosUser();
  const enc = encodeURIComponent(q);

  const [products, sales, customers, purchases] = q
    ? await Promise.all([
        listStockRows({ search: q, page: 1, pageSize: LIMIT, order: "name" }),
        listRecords("sales", { search: q, page: 1, pageSize: LIMIT }),
        listCustomers(q, 1),
        user.isOwner ? listRecords("purchases", { search: q, page: 1, pageSize: LIMIT }) : null,
      ])
    : [null, null, null, null];

  return (
    <PageShell>
      <PageHeader eyebrow="Search" title={q ? `“${q}”` : "Search"} />
      <div className="max-w-[520px]">
        <SearchForm action="/pos/search" id="search-q" label="Search products, sales or customers" placeholder="Search products, sales, customers" value={q} />
      </div>
      {!q && <p className="m-0 text-sm text-pos-soft">Type a product name, SKU or barcode, a sale number like SL_1210, or a customer&apos;s name or phone.</p>}
      {products && sales && customers && (
        <div className="grid items-start gap-3.5" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(min(420px, 100%), 1fr))" }}>
          <Group title="Products" more={{ href: `/pos/products?q=${enc}`, count: products.total }} empty={products.rows.length === 0}>
            {products.rows.map((p) => {
              const pill = STOCK_PILLS[p.state];
              return (
                <li key={p.variantId} className={row}>
                  <ProductTile imageUrl={p.imageUrl} sku={p.sku} name={p.productName} category={p.topCategoryName} size={40} />
                  <span className="flex min-w-0 flex-1 flex-col">
                    <Link href={`/pos/products/${p.productId}`} className="truncate font-semibold text-pos-ink no-underline hover:underline">
                      {variantName(p.productName, p.optionLabel)}
                    </Link>
                    <span className="text-xs text-pos-muted">
                      {formatPesewas(p.price)} · {p.onHand} on shelf
                    </span>
                  </span>
                  <Pill className={pill.className}>{pill.label}</Pill>
                </li>
              );
            })}
          </Group>
          <Group title="Sales" more={{ href: `/pos/sales?q=${enc}`, count: sales.total }} empty={sales.rows.length === 0}>
            {sales.rows.map((s) => (
              <li key={s.id} className={row}>
                <span className="flex min-w-0 flex-1 flex-col">
                  <Link href={`/pos/sales/${s.id}`} className="font-bold text-pos-ink no-underline hover:underline">
                    {s.code}
                  </Link>
                  <span className="text-xs text-pos-muted">
                    {s.party} · {formatDay(s.createdAt)}
                  </span>
                </span>
                <span className="text-right tabular-nums">
                  <span className="block font-semibold">{formatPesewas(s.total)}</span>
                  {s.owed > 0 && <span className="block text-xs font-bold text-pos-rust">owes {formatPesewas(s.owed)}</span>}
                </span>
              </li>
            ))}
          </Group>
          <Group title="Customers" more={{ href: `/pos/customers?q=${enc}`, count: customers.total }} empty={customers.rows.length === 0}>
            {customers.rows.slice(0, LIMIT).map((c) => (
              <li key={c.id} className={row}>
                <span className="flex min-w-0 flex-1 flex-col">
                  <Link href={`/pos/sales?q=${encodeURIComponent(c.name)}`} className="font-semibold text-pos-ink no-underline hover:underline">
                    {c.name}
                  </Link>
                  <span className="text-xs text-pos-muted">{phoneText(c.phone) ?? "No phone number"}</span>
                </span>
                {c.owed > 0 && <span className="text-xs font-bold tabular-nums text-pos-rust">owes {formatPesewas(c.owed)}</span>}
              </li>
            ))}
          </Group>
          {purchases && (
            <Group title="Purchases" more={{ href: `/pos/purchases?q=${enc}`, count: purchases.total }} empty={purchases.rows.length === 0}>
              {purchases.rows.map((p) => (
                <li key={p.id} className={row}>
                  <span className="flex min-w-0 flex-1 flex-col">
                    <Link href={`/pos/purchases/${p.id}`} className="font-bold text-pos-ink no-underline hover:underline">
                      {p.code}
                    </Link>
                    <span className="text-xs text-pos-muted">
                      {p.party} · {formatDay(p.createdAt)}
                    </span>
                  </span>
                  <span className="text-right font-semibold tabular-nums">{formatPesewas(p.total)}</span>
                </li>
              ))}
            </Group>
          )}
        </div>
      )}
    </PageShell>
  );
}
