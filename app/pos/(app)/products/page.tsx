import type { Metadata } from "next";
import Link from "next/link";
import { z } from "zod";
import { CountIcon, PlusIcon, WarningIcon } from "@/components/pos/icons";
import { FilterChips, Pager, SearchForm } from "@/components/pos/list-controls";
import { ProductTile } from "@/components/pos/product-tile";
import { RecountButton } from "@/components/pos/stock-dialogs";
import { ButtonLink, Card, PageHeader, PageShell, Pill, ScrollTable, StatCard, StatGrid, TableHead, Th } from "@/components/pos/ui";
import { WebsiteSwitch } from "@/components/pos/website-switch";
import { formatPesewas } from "@/lib/money";
import {
  shelfBarPercent,
  shelfText,
  STOCK_FILTER_LABELS,
  STOCK_FILTERS,
  STOCK_PILLS,
  variantName,
  type StockFilter,
} from "@/lib/pos/stock";
import { requirePosUser } from "@/lib/server/pos/auth";
import { getStockSummary, listStockRows, STOCK_PAGE_SIZE } from "@/lib/server/pos/stock";

export const metadata: Metadata = { title: "Products and stock" };

const first = (v: unknown) => (Array.isArray(v) ? v[0] : v);
const paramsSchema = z.object({
  filter: z.preprocess(first, z.enum(STOCK_FILTERS)).catch("all"),
  page: z.preprocess(first, z.coerce.number().int().min(1).max(10_000)).catch(1),
  q: z.preprocess(first, z.string().trim().max(100)).catch(""),
});

export default async function ProductsAndStockPage({ searchParams }: PageProps<"/pos/products">) {
  const params = paramsSchema.parse(await searchParams);
  const user = await requirePosUser();
  const [{ rows, total }, summary] = await Promise.all([
    listStockRows({ search: params.q, filter: params.filter, page: params.page }),
    getStockSummary(),
  ]);

  const href = (changes: Partial<typeof params>) => {
    const next = { ...params, ...changes };
    const query = new URLSearchParams();
    if (next.filter !== "all") query.set("filter", next.filter);
    if (next.q) query.set("q", next.q);
    if (next.page > 1) query.set("page", String(next.page));
    const s = query.toString();
    return `/pos/products${s ? `?${s}` : ""}`;
  };

  return (
    <PageShell>
      <PageHeader eyebrow="Stock" title="Products and stock.">
        {user.canAdjustStock && (
          <ButtonLink href="/pos/count" kind="outline">
            <CountIcon />
            <span>Start a stock count</span>
          </ButtonLink>
        )}
        {user.isOwner && (
          <ButtonLink href="/pos/products/new">
            <PlusIcon size={16} />
            <span>Add product</span>
          </ButtonLink>
        )}
      </PageHeader>

      <StatGrid>
        <StatCard label="Products" value={summary.products.toLocaleString("en-US")} />
        {summary.value !== null && <StatCard label="Stock value at cost" value={formatPesewas(summary.value)} />}
        <StatCard label="Running low" value={summary.low.toLocaleString("en-US")} tone="warn" />
        <StatCard label="Need a recount" value={summary.recount.toLocaleString("en-US")} tone="gold" dark />
      </StatGrid>

      {summary.recount > 0 && (
        <div role="note" className="flex flex-wrap items-center gap-x-4 gap-y-3 rounded-[10px] border border-pos-peach-line bg-pos-peach px-[18px] py-3.5">
          <WarningIcon className="text-pos-rust" />
          <span className="flex-[1_1_360px] text-sm leading-[21px] text-pos-note-ink">
            <strong>
              {summary.recount} {summary.recount === 1 ? "product shows" : "products show"} less than zero on the shelf.
            </strong>{" "}
            They were sold before their delivery was recorded. Count them once and the numbers line up again. New sales can no longer go
            below zero.
          </span>
          <ButtonLink href={href({ filter: "recount", page: 1 })} kind="dark" size="sm" className="min-h-10">
            Show them
          </ButtonLink>
        </div>
      )}

      <Card label="Product list">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-pos-paper-deep px-[18px] py-3.5">
          <SearchForm
            action="/pos/products"
            id="st-q"
            label="Search products"
            placeholder="Search name or code"
            value={params.q}
            hidden={params.filter !== "all" ? { filter: params.filter } : {}}
          />
          <FilterChips<StockFilter>
            label="Stock filter"
            options={STOCK_FILTERS.map((f) => ({ value: f, name: STOCK_FILTER_LABELS[f] }))}
            current={params.filter}
            href={(filter) => href({ filter, page: 1 })}
          />
        </div>

        {rows.length === 0 ? (
          <p className="m-0 px-[18px] py-8 text-center text-sm text-pos-soft">No products match. Try another name or filter.</p>
        ) : (
          <>
            <ScrollTable minWidth={user.isOwner ? 940 : 840}>
              <TableHead>
                <Th>Product</Th>
                <Th>Category</Th>
                {user.isOwner && <Th align="right">Cost</Th>}
                <Th align="right">Price</Th>
                <Th>On the shelf</Th>
                <Th>On the website</Th>
                <Th>
                  <span className="sr-only">Actions</span>
                </Th>
              </TableHead>
              <tbody>
                {rows.map((r) => {
                  const name = variantName(r.productName, r.optionLabel);
                  const pill = STOCK_PILLS[r.state];
                  const productHref = `/pos/products/${r.productId}`;
                  return (
                    <tr key={r.variantId} className="pos-row border-t border-pos-paper-deep">
                      <td className="py-2.5 pl-[18px] pr-3">
                        <span className="flex items-center gap-3">
                          <ProductTile imageUrl={r.imageUrl} sku={r.sku} name={r.productName} category={r.topCategoryName} />
                          <span className="flex min-w-0 flex-col">
                            <Link href={productHref} className="font-semibold text-pos-ink no-underline hover:underline">
                              {name}
                            </Link>
                            <span className="text-xs text-pos-muted">{r.sku ?? "No code"}</span>
                          </span>
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-pos-soft">{r.categoryName ?? "—"}</td>
                      {user.isOwner && (
                        <td className="whitespace-nowrap px-3 py-2.5 text-right tabular-nums text-pos-soft">{r.cost === null ? "—" : formatPesewas(r.cost)}</td>
                      )}
                      <td className="whitespace-nowrap px-3 py-2.5 text-right font-semibold tabular-nums">{formatPesewas(r.price)}</td>
                      <td className="min-w-[230px] px-3 py-2.5">
                        <span className="flex flex-col gap-1.5">
                          <span className="flex justify-between gap-2 text-[13px]">
                            <span className={`whitespace-nowrap font-bold tabular-nums ${r.onHand < 0 ? "text-pos-rust" : ""}`}>
                              {shelfText(r.onHand, r.reorderLevel)}
                            </span>
                            <Pill className={pill.className}>{pill.label}</Pill>
                          </span>
                          <span aria-hidden="true" className="block h-1.5 overflow-hidden rounded-full bg-pos-paper-deep">
                            <span
                              className={`block h-full rounded-full ${r.state === "ok" ? "bg-pos-green" : "bg-pos-orange"}`}
                              style={{ width: `${shelfBarPercent(r.onHand, r.reorderLevel)}%` }}
                            />
                          </span>
                        </span>
                      </td>
                      <td className="px-3 py-2.5">
                        <WebsiteSwitch productId={r.productId} productName={r.productName} on={r.onWebsite} canEdit={user.isOwner} />
                      </td>
                      <td className="whitespace-nowrap py-2.5 pl-3 pr-[18px] text-right">
                        <span className="inline-flex items-center gap-1.5">
                          {r.state === "recount" && user.canAdjustStock && (
                            <RecountButton variantId={r.variantId} name={name} onHand={r.onHand} />
                          )}
                          {(r.state === "out" || r.state === "low") && user.isOwner && (
                            <ButtonLink href="/pos/purchases" kind="orange" size="sm" className="px-3">
                              Reorder
                            </ButtonLink>
                          )}
                          {(r.state === "ok" || !user.isOwner) && (
                            <ButtonLink href={productHref} kind="outline" size="sm" className="px-3">
                              {user.isOwner ? "Edit" : "View"}
                            </ButtonLink>
                          )}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </ScrollTable>
            <Pager page={params.page} pageSize={STOCK_PAGE_SIZE} total={total} href={(page) => href({ page })} />
          </>
        )}
      </Card>
    </PageShell>
  );
}
