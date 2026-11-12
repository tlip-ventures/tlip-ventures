import type { Metadata } from "next";
import Link from "next/link";
import { z } from "zod";
import { FilterChips, Pager, SearchForm } from "@/components/pos/list-controls";
import { ProductTile } from "@/components/pos/product-tile";
import { MoveStockButton, RecountButton } from "@/components/pos/stock-dialogs";
import { ButtonLink, Card, PageHeader, PageShell, Pill, ScrollTable, StatCard, StatGrid, TableHead, Th } from "@/components/pos/ui";
import { formatPesewas } from "@/lib/money";
import { formatDayTime } from "@/lib/pos/format";
import { cartonsText, movementLabel, signedQty, STOCK_PILLS } from "@/lib/pos/stock";
import { requirePosUser } from "@/lib/server/pos/auth";
import { getWarehouseSummary, listPlaceMovements, listPlaces, listStockRows, STOCK_PAGE_SIZE } from "@/lib/server/pos/stock";

export const metadata: Metadata = { title: "Warehouse" };

const VIEWS = ["has", "bring", "all"] as const;
type View = (typeof VIEWS)[number];
const VIEW_LABELS: Record<View, string> = { has: "In the warehouse", bring: "Shop running low", all: "All products" };

const first = (v: unknown) => (Array.isArray(v) ? v[0] : v);
const paramsSchema = z.object({
  view: z.preprocess(first, z.enum(VIEWS)).catch("has"),
  page: z.preprocess(first, z.coerce.number().int().min(1).max(10_000)).catch(1),
  q: z.preprocess(first, z.string().trim().max(100)).catch(""),
});

/** The warehouse: what is kept there, what to bring to the shop, and what came in or went out lately. */
export default async function WarehousePage({ searchParams }: PageProps<"/pos/warehouse">) {
  const params = paramsSchema.parse(await searchParams);
  const user = await requirePosUser();
  const places = await listPlaces();
  const shop = places.find((p) => p.sells);
  const store = places.find((p) => !p.sells);
  if (!shop || !store) {
    return (
      <PageShell>
        <PageHeader eyebrow="Stock" title="Warehouse" />
        <p className="m-0 text-sm text-pos-soft">No warehouse is set up.</p>
      </PageShell>
    );
  }

  const [{ rows, total }, summary, history] = await Promise.all([
    listStockRows({
      search: params.q,
      page: params.page,
      order: "name",
      warehouse: params.view === "all" ? undefined : params.view,
    }),
    getWarehouseSummary(),
    listPlaceMovements(store.id),
  ]);

  const href = (changes: Partial<typeof params>) => {
    const next = { ...params, ...changes };
    const q = new URLSearchParams();
    if (next.view !== "has") q.set("view", next.view);
    if (next.q) q.set("q", next.q);
    if (next.page > 1) q.set("page", String(next.page));
    const s = q.toString();
    return `/pos/warehouse${s ? `?${s}` : ""}`;
  };

  return (
    <PageShell>
      <PageHeader eyebrow="Stock" title={`${store.name}.`}>
        {user.canAdjustStock && (
          <ButtonLink href={`/pos/count?place=${store.id}`}>Count the {store.name.toLowerCase()}</ButtonLink>
        )}
        {user.isOwner && (
          <ButtonLink href="/pos/purchases/new" kind="outline">
            Record a delivery
          </ButtonLink>
        )}
        <ButtonLink href="/pos/products" kind="outline">
          Products and stock
        </ButtonLink>
      </PageHeader>

      <StatGrid min={190}>
        <StatCard label="Products here" value={summary.products.toLocaleString("en-US")} />
        <StatCard label="Units here" value={summary.units.toLocaleString("en-US")} />
        <StatCard label="Shop running low, some here" value={summary.toBring.toLocaleString("en-US")} tone={summary.toBring ? "warn" : "plain"} />
        {summary.value !== null && <StatCard label="Value at cost" value={formatPesewas(summary.value)} tone="gold" dark />}
      </StatGrid>

      <p className="m-0 text-[13px] leading-[19px] text-pos-soft">
        Everything is sold from the shop. Supplier deliveries arrive here unless you choose the shop. Bring stock to the shop before it
        runs out; the website counts the shop and the {store.name.toLowerCase()} together.
      </p>

      <Card label={`What is in the ${store.name.toLowerCase()}`}>
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-pos-paper-deep px-[18px] py-3.5">
          <SearchForm
            action="/pos/warehouse"
            id="wh-q"
            label="Search the warehouse"
            placeholder="Search name or code"
            value={params.q}
            hidden={params.view !== "has" ? { view: params.view } : {}}
          />
          <FilterChips<View>
            label="Show"
            options={VIEWS.map((v) => ({ value: v, name: VIEW_LABELS[v] }))}
            current={params.view}
            href={(view) => href({ view, page: 1 })}
          />
        </div>

        {rows.length === 0 ? (
          <p className="m-0 px-[18px] py-10 text-center text-sm text-pos-soft">
            {params.q
              ? "No products match."
              : params.view === "bring"
                ? "Nothing to bring over: the shop has enough of everything kept here."
                : params.view === "has"
                  ? `Nothing is in the ${store.name.toLowerCase()} yet. Use Count the ${store.name.toLowerCase()} to enter what is here, or choose All products and Recount one.`
                  : "No products yet."}
          </p>
        ) : (
          <>
            <ScrollTable minWidth={720}>
              <TableHead>
                <Th>Product</Th>
                <Th align="right">{store.name}</Th>
                <Th>In the shop</Th>
                <Th>
                  <span className="sr-only">Actions</span>
                </Th>
              </TableHead>
              <tbody>
                {rows.map((r) => {
                  const pill = STOCK_PILLS[r.state];
                  return (
                    <tr key={r.variantId} className="pos-row border-t border-pos-paper-deep">
                      <td className="py-2.5 pl-[18px] pr-3">
                        <span className="flex items-center gap-3">
                          <ProductTile imageUrl={r.imageUrl} sku={r.sku} name={r.productName} category={r.topCategoryName} />
                          <span className="flex min-w-0 flex-col">
                            <Link href={`/pos/products/${r.productId}`} className="font-semibold text-pos-ink no-underline hover:underline">
                              {r.productName}
                            </Link>
                            <span className="text-xs text-pos-muted">{r.sku ?? "No code"}</span>
                          </span>
                        </span>
                      </td>
                      <td className={`whitespace-nowrap px-3 py-2.5 text-right text-[15px] tabular-nums ${r.warehouseOnHand > 0 ? "font-bold" : "text-pos-muted"}`}>
                        <span className="flex flex-col items-end">
                          <span>{cartonsText(r.warehouseOnHand, r.unitsPerCarton)}</span>
                          {r.unitsPerCarton && r.warehouseOnHand >= r.unitsPerCarton && (
                            <span className="text-xs font-normal text-pos-muted">{r.warehouseOnHand.toLocaleString("en-US")} items</span>
                          )}
                        </span>
                      </td>
                      <td className="px-3 py-2.5">
                        <span className="flex flex-wrap items-center gap-2 text-[13px]">
                          <span className="font-bold tabular-nums">{r.onHand}</span>
                          <Pill className={pill.className}>{pill.label}</Pill>
                        </span>
                      </td>
                      <td className="whitespace-nowrap py-2.5 pl-3 pr-[18px] text-right">
                        {user.canAdjustStock && (
                          <span className="inline-flex gap-1.5">
                            {r.warehouseOnHand > 0 && (
                              <MoveStockButton
                                variantId={r.variantId}
                                name={r.productName}
                                places={[
                                  { ...shop, onHand: r.onHand },
                                  { ...store, onHand: r.warehouseOnHand },
                                ]}
                                from={store.id}
                                to={shop.id}
                                label="Bring to shop"
                                kind={r.state === "ok" ? "outline" : "green"}
                              />
                            )}
                            <RecountButton
                              variantId={r.variantId}
                              name={r.productName}
                              onHand={r.warehouseOnHand}
                              place={{ id: store.id, name: store.name }}
                              kind="outline"
                            />
                          </span>
                        )}
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

      <Card label={`Latest in the ${store.name.toLowerCase()}`}>
        <div className="flex flex-col gap-1 px-5 py-4">
          <h2 className="m-0 text-lg font-bold leading-6">Latest in the {store.name.toLowerCase()}</h2>
          <span className="text-[13px] text-pos-muted">Deliveries in, stock moved to or from the shop, counts and adjustments.</span>
        </div>
        {history.length === 0 ? (
          <p className="m-0 border-t border-pos-paper-deep px-5 py-8 text-center text-sm text-pos-soft">Nothing yet.</p>
        ) : (
          <ScrollTable minWidth={720}>
            <TableHead>
              <Th>Date</Th>
              <Th>Product</Th>
              <Th>What</Th>
              <Th align="right">Change</Th>
              <Th align="right">Left here</Th>
              <Th>By</Th>
            </TableHead>
            <tbody>
              {history.map((m) => (
                <tr key={m.id} className="border-t border-pos-paper-deep">
                  <td className="whitespace-nowrap py-3 pl-[18px] pr-3 text-pos-soft">{formatDayTime(m.createdAt)}</td>
                  <td className="px-3 py-3 font-semibold">
                    {m.productId ? (
                      <Link href={`/pos/products/${m.productId}`} className="text-pos-ink no-underline hover:underline">
                        {m.productName}
                      </Link>
                    ) : (
                      m.productName
                    )}
                  </td>
                  <td className="px-3 py-3">
                    <span className="flex flex-col">
                      <span>{movementLabel(m.kind)}</span>
                      {m.reason && <span className="text-xs text-pos-muted">{m.reason}</span>}
                    </span>
                  </td>
                  <td className={`px-3 py-3 text-right font-bold tabular-nums ${m.change < 0 ? "text-pos-rust" : "text-pos-green-ink"}`}>
                    {signedQty(m.change)}
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums">{m.balanceAfter}</td>
                  <td className="py-3 pl-3 pr-[18px] text-pos-soft">{m.by}</td>
                </tr>
              ))}
            </tbody>
          </ScrollTable>
        )}
      </Card>
    </PageShell>
  );
}
