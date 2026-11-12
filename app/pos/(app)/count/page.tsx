import type { Metadata } from "next";
import { z } from "zod";
import { CountInput, FinishCountForms, StartCountForm } from "@/components/pos/count-controls";
import { FilterChips, Pager, SearchForm } from "@/components/pos/list-controls";
import { ProductTile } from "@/components/pos/product-tile";
import { Card, Notice, PageHeader, PageShell, Pill, ScrollTable, StatCard, StatGrid, TableHead, Th } from "@/components/pos/ui";
import { formatDay, formatDayTime, plural } from "@/lib/pos/format";
import { signedQty } from "@/lib/pos/stock";
import { requirePosUser } from "@/lib/server/pos/auth";
import { getCountDifferences, getOpenCount, listRecentCounts } from "@/lib/server/pos/counts";
import { listPlaces, listStockRows, listTopCategories, STOCK_PAGE_SIZE, type Place } from "@/lib/server/pos/stock";

export const metadata: Metadata = { title: "Stock count" };

const first = (v: unknown) => (Array.isArray(v) ? v[0] : v);
const paramsSchema = z.object({
  place: z.preprocess(first, z.coerce.number().int().min(1).max(32767)).optional().catch(undefined),
  cat: z.preprocess(first, z.uuid()).optional().catch(undefined),
  page: z.preprocess(first, z.coerce.number().int().min(1).max(10_000)).catch(1),
  q: z.preprocess(first, z.string().trim().max(100)).catch(""),
  finished: z.preprocess(first, z.coerce.number().int().min(0)).optional().catch(undefined),
  cancelled: z.preprocess(first, z.literal("1")).optional().catch(undefined),
});

export default async function StockCountPage({ searchParams }: PageProps<"/pos/count">) {
  const params = paramsSchema.parse(await searchParams);
  const user = await requirePosUser();
  const [open, places] = await Promise.all([getOpenCount(), listPlaces()]);
  // The place on screen: the one asked for, else the one being counted, else the shop.
  const place =
    places.find((p) => p.id === params.place) ?? places.find((p) => p.id === open?.placeId) ?? places.find((p) => p.sells) ?? places[0];
  const where = placeWords(place);
  const openHere = open && open.placeId === place.id ? open : null;
  const openElsewhere = open && !openHere ? places.find((p) => p.id === open.placeId) : undefined;

  return (
    <PageShell>
      <PageHeader eyebrow="Stock" title="Stock count." />
      {places.length > 1 && (
        <FilterChips<string>
          label="Place to count"
          options={places.map((p) => ({ value: String(p.id), name: p.name }))}
          current={String(place.id)}
          href={(id) => `/pos/count?place=${id}`}
        />
      )}
      {params.finished !== undefined && (
        <Notice tone="good">
          {params.finished === 0
            ? `Count finished. Everything matched ${where.the}.`
            : `Count finished. The ${where.count} was corrected for ${plural(params.finished, "item")}.`}
        </Notice>
      )}
      {params.cancelled && <Notice tone="good">Count cancelled. Nothing in {where.the} was changed.</Notice>}
      {openHere ? (
        <OpenCount count={openHere} place={place} params={params} canCount={user.canAdjustStock} />
      ) : (
        <NoCount place={place} canCount={user.canAdjustStock} openElsewhere={openElsewhere} />
      )}
    </PageShell>
  );
}

/** "the shelf" and "shelf count" for the shop; "the warehouse" and "warehouse count" for the others. */
function placeWords(place: Place) {
  return place.sells
    ? { the: "the shelf", count: "shelf count", onIt: "on the shelf" }
    : { the: `the ${place.name.toLowerCase()}`, count: `${place.name.toLowerCase()} count`, onIt: `in the ${place.name.toLowerCase()}` };
}

async function NoCount({ place, canCount, openElsewhere }: { place: Place; canCount: boolean; openElsewhere?: Place }) {
  const recent = await listRecentCounts(place.id);
  const where = placeWords(place);
  return (
    <>
      <Card>
        <div className="flex flex-col gap-4 p-5">
          <div className="flex max-w-[640px] flex-col gap-2">
            <h2 className="m-0 text-lg font-bold leading-6">Count what is {where.onIt}</h2>
            <p className="m-0 text-sm leading-[22px] text-pos-soft">
              Start a count, then type how many of each item you find {where.onIt}. You can count one part today and another tomorrow:
              what you type is saved as you go. When you finish, the app corrects the {where.count} for every item that was different.
              {place.sells ? " Sales made while the count is open are kept." : " Items you don't count are left as they are."}
            </p>
          </div>
          {openElsewhere ? (
            <Notice tone="bad">
              A count of the {openElsewhere.name.toLowerCase()} is in progress. Finish or cancel it first (choose {openElsewhere.name}{" "}
              above); one count runs at a time.
            </Notice>
          ) : canCount ? (
            <StartCountForm placeId={place.id} placeName={place.name} />
          ) : (
            <Notice tone="bad">Only the owner, or staff the owner allows, can count stock.</Notice>
          )}
        </div>
      </Card>
      {recent.length > 0 && (
        <Card label="Past counts">
          <div className="px-5 py-4">
            <h2 className="m-0 text-lg font-bold leading-6">Past counts</h2>
          </div>
          <ScrollTable minWidth={560}>
            <TableHead>
              <Th>Started</Th>
              <Th>Note</Th>
              <Th>Result</Th>
              <Th>By</Th>
            </TableHead>
            <tbody>
              {recent.map((c) => (
                <tr key={c.id} className="border-t border-pos-paper-deep">
                  <td className="whitespace-nowrap py-3 pl-[18px] pr-3 text-pos-soft">{formatDay(c.createdAt)}</td>
                  <td className="px-3 py-3">{c.note ?? "—"}</td>
                  <td className="px-3 py-3">
                    {c.status === "cancelled" ? (
                      <Pill className="bg-pos-paper-deep text-pos-soft">Cancelled</Pill>
                    ) : (
                      <Pill className="bg-pos-tint-green text-pos-green-ink">
                        {c.changed === 0 ? "All matched" : `${plural(c.changed, "item")} corrected`}
                      </Pill>
                    )}
                  </td>
                  <td className="py-3 pl-3 pr-[18px] text-pos-soft">{c.by}</td>
                </tr>
              ))}
            </tbody>
          </ScrollTable>
        </Card>
      )}
    </>
  );
}

async function OpenCount({
  count,
  place,
  params,
  canCount,
}: {
  count: NonNullable<Awaited<ReturnType<typeof getOpenCount>>>;
  place: Place;
  params: z.infer<typeof paramsSchema>;
  canCount: boolean;
}) {
  const where = placeWords(place);
  const [{ rows, total }, categories, differences] = await Promise.all([
    listStockRows({ search: params.q, topCategoryId: params.cat, page: params.page }),
    listTopCategories(),
    getCountDifferences(count.lines),
  ]);
  const lines = new Map(count.lines.map((l) => [l.variantId, l]));

  const href = (changes: { cat?: string; page?: number; q?: string }) => {
    const next = { cat: params.cat, page: params.page, q: params.q, ...changes };
    const query = new URLSearchParams();
    query.set("place", String(place.id));
    if (next.cat) query.set("cat", next.cat);
    if (next.q) query.set("q", next.q);
    if (next.page && next.page > 1) query.set("page", String(next.page));
    const s = query.toString();
    return `/pos/count${s ? `?${s}` : ""}`;
  };

  return (
    <>
      <p className="m-0 text-sm text-pos-soft">
        Counting {where.the} · started {formatDayTime(count.createdAt)} by {count.by}
        {count.note ? ` · ${count.note}` : ""}
      </p>
      <StatGrid min={200}>
        <StatCard label="Counted so far" value={count.lines.length.toLocaleString("en-US")} />
        <StatCard label={`Different from ${where.the}`} value={differences.length.toLocaleString("en-US")} tone="warn" />
      </StatGrid>

      <Card label="Count list">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-pos-paper-deep px-[18px] py-3.5">
          <SearchForm
            action="/pos/count"
            id="ct-q"
            label="Search products to count"
            placeholder="Search name, code or scan"
            value={params.q}
            hidden={params.cat ? { place: String(place.id), cat: params.cat } : { place: String(place.id) }}
          />
          <FilterChips<string>
            label="Category"
            options={[{ value: "", name: "All" }, ...categories.map((c) => ({ value: c.id, name: c.name }))]}
            current={params.cat ?? ""}
            href={(cat) => href({ cat: cat || undefined, page: 1 })}
          />
        </div>
        {rows.length === 0 ? (
          <p className="m-0 px-[18px] py-8 text-center text-sm text-pos-soft">No products match. Try another name or category.</p>
        ) : (
          <>
            <ScrollTable minWidth={620}>
              <TableHead>
                <Th>Product</Th>
                <Th align="right">The app says</Th>
                <Th>Counted</Th>
                <Th align="right">Difference</Th>
              </TableHead>
              <tbody>
                {rows.map((r) => {
                  const name = r.productName;
                  const line = lines.get(r.variantId);
                  const diff = line ? line.counted - line.expected : null;
                  // What the app says is in this place now.
                  const says = place.sells ? r.onHand : r.warehouseOnHand;
                  return (
                    <tr key={r.variantId} className="border-t border-pos-paper-deep">
                      <td className="py-2 pl-[18px] pr-3">
                        <span className="flex items-center gap-3">
                          <ProductTile imageUrl={r.imageUrl} sku={r.sku} name={r.productName} category={r.topCategoryName} />
                          <span className="flex min-w-0 flex-col">
                            <span className="font-semibold">{name}</span>
                            <span className="text-xs text-pos-muted">{r.sku ?? "No code"}</span>
                          </span>
                        </span>
                      </td>
                      <td className={`px-3 py-2 text-right font-semibold tabular-nums ${says < 0 ? "text-pos-rust" : ""}`}>{says}</td>
                      <td className="px-3 py-2">
                        {canCount ? (
                          <CountInput countId={count.id} variantId={r.variantId} name={name} initial={line?.counted ?? null} />
                        ) : (
                          <span className="tabular-nums">{line?.counted ?? "—"}</span>
                        )}
                      </td>
                      <td className="py-2 pl-3 pr-[18px] text-right">
                        {diff === null ? (
                          <span className="text-pos-muted">—</span>
                        ) : diff === 0 ? (
                          <Pill className="bg-pos-tint-green text-pos-green-ink">Matches</Pill>
                        ) : (
                          <Pill className="bg-pos-tint-orange text-pos-rust">{signedQty(diff)}</Pill>
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

      <Card label="Differences">
        <div className="flex flex-col gap-1 px-5 py-4">
          <h2 className="m-0 text-lg font-bold leading-6">Before you finish</h2>
          <span className="text-[13px] text-pos-muted">
            {differences.length === 0
              ? `Everything you counted matches ${where.the}.`
              : differences.length === 1
                ? "This item will be corrected to what you counted."
                : `These ${plural(differences.length, "item")} will be corrected to what you counted.`}
          </span>
        </div>
        {differences.length > 0 && (
          <ScrollTable minWidth={520}>
            <TableHead>
              <Th>Product</Th>
              <Th align="right">The app says</Th>
              <Th align="right">Counted</Th>
              <Th align="right">Change</Th>
            </TableHead>
            <tbody>
              {differences.map((d) => (
                <tr key={d.variantId} className="border-t border-pos-paper-deep">
                  <td className="py-2.5 pl-[18px] pr-3 font-semibold">{d.productName}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{d.expected}</td>
                  <td className="px-3 py-2.5 text-right font-bold tabular-nums">{d.counted}</td>
                  <td className={`py-2.5 pl-3 pr-[18px] text-right font-bold tabular-nums ${d.counted < d.expected ? "text-pos-rust" : "text-pos-green-ink"}`}>
                    {signedQty(d.counted - d.expected)}
                  </td>
                </tr>
              ))}
            </tbody>
          </ScrollTable>
        )}
        {canCount && (
          <div className="border-t border-pos-paper-deep bg-pos-row-hover px-5 py-4">
            <FinishCountForms countId={count.id} placeId={place.id} placeName={place.name} differences={differences.length} />
          </div>
        )}
      </Card>
    </>
  );
}
