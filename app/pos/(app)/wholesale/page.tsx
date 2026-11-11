import type { Metadata } from "next";
import Link from "next/link";
import { z } from "zod";
import { FilterChips, Pager, SearchForm } from "@/components/pos/list-controls";
import { Card, PageHeader, PageShell, ScrollTable, StatCard, StatGrid, TableHead, Th } from "@/components/pos/ui";
import { SellWholesaleButton, WholesalePriceForm } from "@/components/pos/wholesale-actions";
import { formatPesewas } from "@/lib/money";
import { plural } from "@/lib/pos/format";
import { requirePosUser } from "@/lib/server/pos/auth";
import { countWholesalePrices, listStockRows } from "@/lib/server/pos/stock";

export const metadata: Metadata = { title: "Wholesale" };

const PAGE_SIZE = 30;
const FILTERS = ["all", "with", "without"] as const;
const FILTER_LABELS: Record<(typeof FILTERS)[number], string> = { all: "All products", with: "With a wholesale price", without: "No wholesale price" };

const first = (v: unknown) => (Array.isArray(v) ? v[0] : v);
const paramsSchema = z.object({
  filter: z.preprocess(first, z.enum(FILTERS)).catch("all"),
  page: z.preprocess(first, z.coerce.number().int().min(1).max(10_000)).catch(1),
  q: z.preprocess(first, z.string().trim().max(100)).catch(""),
});

/**
 * Wholesale: every product with its retail and wholesale price and what is on
 * the shelf. The same products and the same stock as everywhere else; the
 * owner sets wholesale prices here.
 */
export default async function WholesalePage({ searchParams }: PageProps<"/pos/wholesale">) {
  const params = paramsSchema.parse(await searchParams);
  const user = await requirePosUser();
  const [{ rows, total }, counts] = await Promise.all([
    listStockRows({
      search: params.q,
      page: params.page,
      pageSize: PAGE_SIZE,
      order: "name",
      wholesale: params.filter === "all" ? undefined : params.filter,
    }),
    countWholesalePrices(),
  ]);
  const href = (changes: Partial<typeof params>) => {
    const next = { ...params, ...changes };
    const q = new URLSearchParams();
    if (next.filter !== "all") q.set("filter", next.filter);
    if (next.q) q.set("q", next.q);
    if (next.page > 1) q.set("page", String(next.page));
    const s = q.toString();
    return `/pos/wholesale${s ? `?${s}` : ""}`;
  };

  return (
    <PageShell>
      <PageHeader eyebrow="Sell" title="Wholesale">
        {user.canGiveDiscounts && <SellWholesaleButton />}
      </PageHeader>
      <p className="m-0 max-w-[680px] text-sm leading-[22px] text-pos-soft">
        The same products and shelf counts as Products and stock. A product with a wholesale price is sold at it when the till is
        switched to <strong>Wholesale</strong>; the others keep their normal price.
        {user.isOwner ? " Type a price and Save; leave it empty and Save to remove it." : " Only the owner can change wholesale prices."}
        {!user.canGiveDiscounts && " Selling at wholesale needs “Can give discounts” (ask the owner)."}
      </p>

      <StatGrid min={200}>
        <StatCard label="With a wholesale price" value={counts.with.toLocaleString("en-US")} tone="good" />
        <StatCard label="No wholesale price" value={counts.without.toLocaleString("en-US")} />
      </StatGrid>

      <Card label="Wholesale prices">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-pos-paper-deep px-[18px] py-3.5">
          <SearchForm
            action="/pos/wholesale"
            id="ws-q"
            label="Search products"
            placeholder="Product name, code or barcode"
            value={params.q}
            hidden={params.filter !== "all" ? { filter: params.filter } : {}}
          />
          <FilterChips
            label="Show"
            options={FILTERS.map((f) => ({ value: f, name: FILTER_LABELS[f] }))}
            current={params.filter}
            href={(filter) => href({ filter, page: 1 })}
          />
        </div>

        {rows.length === 0 ? (
          <p className="m-0 px-5 py-12 text-center text-sm text-pos-soft">
            {params.q || params.filter !== "all" ? "No products match." : "No products yet."}
          </p>
        ) : (
          <ScrollTable minWidth={800}>
            <TableHead>
              <Th>Product</Th>
              <Th align="right">In the shop</Th>
              <Th align="right">Warehouse</Th>
              <Th align="right">Retail price</Th>
              <Th align="right">Wholesale price</Th>
              <Th align="right">Off retail</Th>
            </TableHead>
            <tbody>
              {rows.map((r) => {
                const off = r.wholesalePrice !== null ? r.price - r.wholesalePrice : null;
                return (
                  <tr key={r.variantId} className="pos-row border-t border-pos-paper-deep">
                    <td className="py-3 pl-[18px] pr-3">
                      <span className="flex flex-col">
                        <Link href={`/pos/products/${r.productId}`} className="font-semibold text-pos-ink no-underline hover:underline">
                          {r.productName}
                        </Link>
                        <span className="text-xs text-pos-muted">
                          {[r.sku, r.choices.length ? plural(r.choices.length, (r.choiceName ?? "choice").toLowerCase()) : null]
                            .filter(Boolean)
                            .join(" · ") || "—"}
                        </span>
                      </span>
                    </td>
                    <td className={`px-3 py-3 text-right tabular-nums ${r.onHand > 0 ? "" : "text-pos-rust"}`}>{r.onHand.toLocaleString("en-US")}</td>
                    <td className={`px-3 py-3 text-right tabular-nums ${r.warehouseOnHand > 0 ? "font-bold" : "text-pos-muted"}`}>
                      {r.warehouseOnHand.toLocaleString("en-US")}
                    </td>
                    <td className="whitespace-nowrap px-3 py-3 text-right tabular-nums">{formatPesewas(r.price)}</td>
                    <td className="whitespace-nowrap px-3 py-3 text-right tabular-nums">
                      {user.isOwner ? (
                        <WholesalePriceForm productId={r.productId} price={r.wholesalePrice} name={r.productName} />
                      ) : r.wholesalePrice !== null ? (
                        <span className="font-bold text-pos-green-ink">{formatPesewas(r.wholesalePrice)}</span>
                      ) : (
                        <span className="text-pos-muted">None</span>
                      )}
                    </td>
                    <td className="whitespace-nowrap py-3 pl-3 pr-[18px] text-right tabular-nums text-pos-soft">
                      {off === null ? "—" : off > 0 ? `${formatPesewas(off)} (${Math.round((off / Math.max(r.price, 1)) * 100)}%)` : off < 0 ? "Above retail" : "Same"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </ScrollTable>
        )}
        <Pager page={params.page} pageSize={PAGE_SIZE} total={total} href={(page) => href({ page })} />
      </Card>
    </PageShell>
  );
}
