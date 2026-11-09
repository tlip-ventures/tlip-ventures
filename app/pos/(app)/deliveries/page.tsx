import type { Metadata } from "next";
import { z } from "zod";
import { FilterChips, Pager, SearchForm } from "@/components/pos/list-controls";
import { DeliveryList } from "@/components/pos/delivery-list";
import { ButtonLink, Card, PageHeader, PageShell, StatCard, StatGrid } from "@/components/pos/ui";
import { formatPesewas } from "@/lib/money";
import { DELIVERY_FILTER_LABELS, DELIVERY_FILTERS } from "@/lib/pos/deliveries";
import { requirePosUser } from "@/lib/server/pos/auth";
import { DELIVERIES_PAGE_SIZE, getDeliverySummary, listDeliveries, listRiders } from "@/lib/server/pos/deliveries";

export const metadata: Metadata = { title: "Deliveries" };

const first = (v: unknown) => (Array.isArray(v) ? v[0] : v);
const paramsSchema = z.object({
  filter: z.preprocess(first, z.enum(DELIVERY_FILTERS)).catch("open"),
  page: z.preprocess(first, z.coerce.number().int().min(1).max(10_000)).catch(1),
  q: z.preprocess(first, z.string().trim().max(100)).catch(""),
});

/** Sales the shop delivers: to send out, out with a rider, delivered. */
export default async function DeliveriesPage({ searchParams }: PageProps<"/pos/deliveries">) {
  const params = paramsSchema.parse(await searchParams);
  await requirePosUser();
  const [{ rows, total }, summary, riders] = await Promise.all([
    listDeliveries({ filter: params.filter, search: params.q, page: params.page }),
    getDeliverySummary(),
    listRiders(),
  ]);
  const href = (changes: Partial<typeof params>) => {
    const next = { ...params, ...changes };
    const q = new URLSearchParams();
    if (next.filter !== "open") q.set("filter", next.filter);
    if (next.q) q.set("q", next.q);
    if (next.page > 1) q.set("page", String(next.page));
    const s = q.toString();
    return `/pos/deliveries${s ? `?${s}` : ""}`;
  };

  return (
    <PageShell>
      <PageHeader eyebrow="Sell" title="Deliveries">
        <ButtonLink href="/pos/sell" kind="outline">
          New delivery sale
        </ButtonLink>
      </PageHeader>

      <StatGrid min={200}>
        <StatCard label="To deliver" value={summary.toDeliver.toLocaleString("en-US")} tone={summary.toDeliver ? "warn" : "plain"} />
        <StatCard label="Out for delivery" value={summary.out.toLocaleString("en-US")} />
        <StatCard label="To collect on delivery" value={formatPesewas(summary.toCollect)} tone="gold" dark />
      </StatGrid>

      <Card label="Deliveries">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-pos-paper-deep px-[18px] py-3.5">
          <SearchForm
            action="/pos/deliveries"
            id="dl-q"
            label="Search deliveries"
            placeholder="Sale, customer, area or rider"
            value={params.q}
            hidden={params.filter !== "open" ? { filter: params.filter } : {}}
          />
          <FilterChips
            label="Show"
            options={DELIVERY_FILTERS.map((f) => ({ value: f, name: DELIVERY_FILTER_LABELS[f] }))}
            current={params.filter}
            href={(filter) => href({ filter, page: 1 })}
          />
        </div>

        {rows.length === 0 ? (
          <p className="m-0 px-5 py-12 text-center text-sm text-pos-soft">
            {params.q || params.filter !== "open"
              ? "No deliveries match."
              : "Nothing waiting to go out. At the till, choose Delivery to add one."}
          </p>
        ) : (
          <DeliveryList rows={rows} riders={riders} />
        )}
        <Pager page={params.page} pageSize={DELIVERIES_PAGE_SIZE} total={total} href={(page) => href({ page })} />
      </Card>
    </PageShell>
  );
}
