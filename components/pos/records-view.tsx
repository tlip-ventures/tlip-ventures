import Link from "next/link";
import { formatPesewas } from "@/lib/money";
import { formatDay } from "@/lib/pos/format";
import {
  paidByText,
  paymentPill,
  purchaseStatusPill,
  RECORD_FILTER_LABELS,
  RECORD_FILTERS,
  RECORD_PERIOD_LABELS,
  RECORD_PERIODS,
  returnStatusPill,
  riderTerm,
  saleStatusPill,
  TAB_META,
  type RecordFilter,
  type RecordKind,
  type RecordPeriod,
} from "@/lib/pos/records";
import type { RiderTotals } from "@/lib/server/pos/deliveries";
import type { RecordRow, RecordsSummary } from "@/lib/server/pos/records";
import { DownloadIcon, MoreIcon, PlusIcon, ReturnsIcon } from "./icons";
import { FilterChips, Pager, SearchForm } from "./list-controls";
import { MarkOrderPaidButton, PaymentButton } from "./record-actions";
import { buttonClass, ButtonLink, Card, PageHeader, PageShell, Pill, ScrollTable, StatGrid, TableHead, Th } from "./ui";

/** rider: Sales only, one rider's deliveries ("" for every sale). */
export type RecordsParams = { q: string; filter: RecordFilter; period: RecordPeriod; rider: string; page: number };

const PATHS: Record<RecordKind, string> = { sales: "/pos/sales", purchases: "/pos/purchases", returns: "/pos/returns" };
const SETTLE_KIND = { sales: "sale", purchases: "purchase", returns: "refund" } as const;

function statusFor(row: RecordRow) {
  if (row.kind === "sales") return saleStatusPill(row.saleStatus!);
  if (row.kind === "purchases") return purchaseStatusPill(row.purchaseStatus!);
  return returnStatusPill(row.items ?? 0, row.restocked ?? 0);
}

/** The design's Sales / Purchases / Returns screen: one tab per record type. */
export function RecordsView({
  kind,
  params,
  rows,
  total,
  pageSize,
  summary,
  isOwner,
  riders = [],
}: {
  kind: RecordKind;
  params: RecordsParams;
  rows: RecordRow[];
  total: number;
  pageSize: number;
  summary: RecordsSummary;
  isOwner: boolean;
  /** Sales: each rider's deliveries in the period. */
  riders?: RiderTotals[];
}) {
  const m = TAB_META[kind];
  const base = PATHS[kind];
  const query = (changes: Partial<RecordsParams>) => {
    const next = { ...params, ...changes };
    const q = new URLSearchParams();
    if (next.period !== "all") q.set("period", next.period);
    if (next.filter !== "all") q.set("filter", next.filter);
    if (next.rider) q.set("rider", next.rider);
    if (next.q) q.set("q", next.q);
    if (next.page > 1) q.set("page", String(next.page));
    return q.toString();
  };
  const href = (changes: Partial<RecordsParams>) => {
    const s = query(changes);
    return `${base}${s ? `?${s}` : ""}`;
  };
  const exportQuery = query({ page: 1 });
  const deliveryPaid = summary.delivery_paid ?? 0;
  const tabs = (["sales", "purchases", "returns"] as const).filter((t) => isOwner || t !== "purchases");

  return (
    <PageShell>
      <PageHeader eyebrow="Records" title={m.heading}>
        <ButtonLink href={`/pos/print/${kind}${exportQuery ? `?${exportQuery}` : ""}`} kind="outline">
          <DownloadIcon />
          <span>Download PDF</span>
        </ButtonLink>
        <a href={`/pos/export/${kind}${exportQuery ? `?${exportQuery}` : ""}`} download className={buttonClass("outline")}>
          <DownloadIcon />
          <span>Excel</span>
        </a>
        <ButtonLink href={m.createHref}>
          <PlusIcon size={16} />
          <span>{m.create}</span>
        </ButtonLink>
      </PageHeader>

      <nav aria-label="Record type" className="flex gap-1 overflow-x-auto border-b border-pos-line">
        {tabs.map((t) => {
          const on = t === kind;
          return (
            <Link
              key={t}
              href={PATHS[t]}
              aria-current={on ? "page" : undefined}
              className={`-mb-px flex min-h-[46px] flex-none items-center gap-2 border-b-[3px] px-[18px] text-[15px] no-underline ${
                on ? "border-pos-green font-bold text-pos-ink hover:text-pos-ink" : "border-transparent font-medium text-pos-muted hover:text-pos-ink"
              }`}
            >
              <span>{TAB_META[t].heading}</span>
              <span className="box-border h-5 min-w-[22px] rounded-full bg-pos-paper-deep px-1.5 text-center text-xs font-bold leading-5 text-pos-soft">
                {summary.counts[t].toLocaleString("en-US")}
              </span>
            </Link>
          );
        })}
      </nav>

      {/* The cards below and the downloads follow the period chosen here. */}
      <FilterChips<RecordPeriod>
        label="Period"
        options={RECORD_PERIODS.map((p) => ({ value: p, name: RECORD_PERIOD_LABELS[p] }))}
        current={params.period}
        href={(period) => href({ period, page: 1 })}
      />

      <StatGrid min={200}>
        <div className="flex flex-col gap-1.5 rounded-[10px] border border-pos-card-line bg-white px-[18px] py-4">
          <span className="text-[13px] font-semibold text-pos-muted">Total value</span>
          <span className="font-pos-display text-[28px] leading-none tabular-nums">{formatPesewas(summary.total)}</span>
        </div>
        <div className="flex flex-col gap-1.5 rounded-[10px] border border-pos-card-line bg-white px-[18px] py-4">
          <span className="text-[13px] font-semibold text-pos-muted">{m.paidLabel}</span>
          <span className="font-pos-display text-[28px] leading-none tabular-nums text-pos-green-ink">{formatPesewas(summary.paid)}</span>
          {kind === "sales" && (
            <span className="text-[13px] tabular-nums text-pos-soft">
              Items {formatPesewas(summary.paid - deliveryPaid)} · Delivery {formatPesewas(deliveryPaid)}
            </span>
          )}
        </div>
        <div className="flex flex-col gap-1.5 rounded-[10px] border border-pos-card-line bg-white px-[18px] py-4">
          <span className="text-[13px] font-semibold text-pos-muted">{m.dueLabel}</span>
          <span className="font-pos-display text-[28px] leading-none tabular-nums text-pos-rust">{formatPesewas(summary.owed)}</span>
        </div>
        {kind === "sales" && (
          // Delivery money on its own, for the end-of-day count (already part of Total value).
          <div className="flex flex-col gap-1.5 rounded-[10px] border border-pos-card-line bg-white px-[18px] py-4">
            <span className="text-[13px] font-semibold text-pos-muted">Delivery fees</span>
            <span className="font-pos-display text-[28px] leading-none tabular-nums">{formatPesewas(summary.delivery)}</span>
            <span className="text-[13px] tabular-nums text-pos-soft">
              Collected {formatPesewas(deliveryPaid)}
              {summary.delivery - deliveryPaid > 0 ? ` · still owed ${formatPesewas(summary.delivery - deliveryPaid)}` : ""}
            </span>
          </div>
        )}
      </StatGrid>

      {kind === "sales" && riders.length > 0 && (
        <Card label="Deliveries by rider">
          <div className="flex flex-wrap items-baseline justify-between gap-2 px-5 py-4">
            <div className="flex flex-col gap-0.5">
              <h2 className="m-0 text-lg font-bold leading-6">Deliveries by rider</h2>
              <p className="m-0 text-[13px] text-pos-muted">
                {RECORD_PERIOD_LABELS[params.period]}. Choose a rider to see only their sales and add up their delivery fees.
              </p>
            </div>
            {params.rider && (
              <Link href={href({ rider: "", page: 1 })} className="inline-flex min-h-11 items-center text-[13px] font-bold md:min-h-8">
                Show every sale
              </Link>
            )}
          </div>
          <ScrollTable minWidth={660}>
            <TableHead>
              <Th>Rider</Th>
              <Th align="right">Deliveries</Th>
              <Th align="right">Delivered</Th>
              <Th align="right">Delivery fees</Th>
              <Th align="right">Sales total</Th>
              <Th align="right">Still to collect</Th>
            </TableHead>
            <tbody>
              {riders.map((r) => {
                const on = r.rider !== null && r.rider.toLowerCase() === params.rider.toLowerCase();
                return (
                  <tr key={r.rider ?? "-"} className={`pos-row border-t border-pos-paper-deep ${on ? "bg-pos-tint-green" : ""}`}>
                    <td className="py-3 pl-[18px] pr-3 font-semibold">
                      {r.rider ? (
                        <Link
                          href={href({ rider: r.rider, page: 1 })}
                          aria-current={on ? "true" : undefined}
                          className="text-pos-ink no-underline hover:underline"
                        >
                          {r.rider}
                        </Link>
                      ) : (
                        <span className="font-normal text-pos-muted">Not sent out yet</span>
                      )}
                    </td>
                    <td className="px-3 py-3 text-right tabular-nums">{r.deliveries.toLocaleString("en-US")}</td>
                    <td className="px-3 py-3 text-right tabular-nums text-pos-soft">{r.delivered.toLocaleString("en-US")}</td>
                    <td className="whitespace-nowrap px-3 py-3 text-right font-bold tabular-nums">{formatPesewas(r.fees)}</td>
                    <td className="whitespace-nowrap px-3 py-3 text-right tabular-nums">{formatPesewas(r.total)}</td>
                    <td className={`whitespace-nowrap py-3 pl-3 pr-[18px] text-right tabular-nums ${r.owed ? "font-bold text-pos-rust" : "text-pos-muted"}`}>
                      {r.owed ? formatPesewas(r.owed) : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </ScrollTable>
        </Card>
      )}

      <Card label={m.heading}>
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-pos-paper-deep px-[18px] py-3.5">
          <SearchForm
            action={base}
            id="sl-q"
            label="Search this list"
            placeholder={m.search}
            value={params.q}
            hidden={{
              ...(params.filter !== "all" ? { filter: params.filter } : {}),
              ...(params.period !== "all" ? { period: params.period } : {}),
              ...(params.rider ? { rider: params.rider } : {}),
            }}
          />
          <FilterChips<RecordFilter>
            label="Payment filter"
            options={RECORD_FILTERS.map((f) => ({ value: f, name: RECORD_FILTER_LABELS[f] }))}
            current={params.filter}
            href={(filter) => href({ filter, page: 1 })}
          />
        </div>
        {params.rider && (
          <div className="flex flex-wrap items-center gap-2 border-b border-pos-paper-deep px-[18px] py-2.5 text-[13px]">
            <span className="rounded-full bg-pos-tint-green px-3 py-1 font-semibold text-pos-green-ink">Rider: {params.rider}</span>
            <span className="text-pos-soft">Only this rider&rsquo;s deliveries; the cards above add up just these.</span>
            <Link href={href({ rider: "", page: 1 })} className="inline-flex min-h-11 items-center font-bold md:min-h-8">
              Show every sale
            </Link>
          </div>
        )}

        {rows.length > 0 ? (
          <>
            <ScrollTable minWidth={kind === "sales" ? 1340 : 860}>
              <TableHead>
                <Th>Date</Th>
                <Th>Reference</Th>
                <Th>{m.party}</Th>
                {kind === "sales" && <Th>Deliver to</Th>}
                <Th>Status</Th>
                {kind === "sales" && <Th align="right">Items</Th>}
                {kind === "sales" && <Th align="right">Delivery</Th>}
                <Th align="right">Total</Th>
                <Th align="right">Paid</Th>
                <Th align="right">Still owed</Th>
                <Th>Payment</Th>
                <Th>
                  <span className="sr-only">Actions</span>
                </Th>
              </TableHead>
              <tbody>
                {rows.map((r) => {
                  const status = statusFor(r);
                  const pay = paymentPill(r.paid, r.owed, r.cancelled);
                  const detail = `${base}/${r.id}`;
                  // Sales with a delivery fee: money paid and owed, items and delivery apart.
                  const split = kind === "sales" && (r.delivery ?? 0) > 0;
                  const deliveryPaidRow = r.deliveryPaid ?? 0;
                  const deliveryOwed = split && !r.cancelled ? Math.max(0, (r.delivery ?? 0) - deliveryPaidRow) : 0;
                  return (
                    <tr key={r.id} className="pos-row border-t border-pos-paper-deep">
                      <td className="whitespace-nowrap py-3.5 pl-[18px] pr-3 text-pos-soft">{formatDay(r.createdAt)}</td>
                      <td className="px-3 py-3.5 font-bold">
                        <Link href={detail} className="text-pos-ink no-underline hover:underline">
                          {r.code}
                        </Link>
                      </td>
                      <td className="min-w-[170px] px-3 py-3.5">
                        <span className="flex flex-col">
                          <span>{r.party}</span>
                          <span className="text-xs text-pos-muted">{r.sub}</span>
                        </span>
                      </td>
                      {kind === "sales" && (
                        <td className="min-w-[180px] max-w-[240px] px-3 py-3.5">
                          {r.deliverTo ? (
                            <span className="flex flex-col">
                              <span className="line-clamp-2 break-words" title={r.deliverTo}>
                                {r.deliverTo}
                              </span>
                              {r.rider && <span className="text-xs text-pos-muted">Rider: {r.rider}</span>}
                            </span>
                          ) : (
                            <span className="text-pos-muted">{r.fromWebsite ? "—" : "In the shop"}</span>
                          )}
                        </td>
                      )}
                      <td className="px-3 py-3.5">
                        <Pill className={status.className}>{status.label}</Pill>
                      </td>
                      {kind === "sales" && (
                        <td className="whitespace-nowrap px-3 py-3.5 text-right tabular-nums">{formatPesewas(r.total - (r.delivery ?? 0))}</td>
                      )}
                      {kind === "sales" && (
                        <td className={`whitespace-nowrap px-3 py-3.5 text-right tabular-nums ${r.delivery ? "" : "text-pos-muted"}`}>
                          {r.delivery ? formatPesewas(r.delivery) : "—"}
                          {r.delivery && r.deliveryIncluded ? <span className="block text-xs text-pos-muted">in the price</span> : null}
                        </td>
                      )}
                      <td className="whitespace-nowrap px-3 py-3.5 text-right font-semibold tabular-nums">{formatPesewas(r.total)}</td>
                      <td className="whitespace-nowrap px-3 py-3.5 text-right tabular-nums">
                        {formatPesewas(r.paid)}
                        {/* Delivery sales: what was paid for items and for delivery. */}
                        {split && r.paid > 0 && (
                          <span className="mt-0.5 flex flex-col text-xs text-pos-soft">
                            <span>Items {formatPesewas(r.paid - deliveryPaidRow)}</span>
                            <span>Delivery {formatPesewas(deliveryPaidRow)}</span>
                          </span>
                        )}
                      </td>
                      <td className={`whitespace-nowrap px-3 py-3.5 text-right tabular-nums ${r.owed ? "font-bold text-pos-rust" : "text-pos-muted"}`}>
                        {r.owed ? formatPesewas(r.owed) : "—"}
                        {split && r.owed > 0 && (
                          <span className="mt-0.5 flex flex-col text-xs font-normal">
                            <span>Items {formatPesewas(r.owed - deliveryOwed)}</span>
                            <span>Delivery {formatPesewas(deliveryOwed)}</span>
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-3.5">
                        <span className="flex flex-col items-start gap-1">
                          <Pill className={pay.className}>{pay.label}</Pill>
                          {/* Sales: how it was paid, under the pill. */}
                          {kind === "sales" && (r.paidBy || (r.owed > 0 && !r.cancelled)) && (
                            <span className="whitespace-nowrap text-xs text-pos-soft">{r.paidBy ? paidByText(r.paidBy) : "Pay later"}</span>
                          )}
                        </span>
                      </td>
                      <td className="whitespace-nowrap py-2 pl-3 pr-[18px] text-right">
                        <span className="inline-flex items-center gap-1.5">
                          {r.saleStatus === "ordered" || r.saleStatus === "pending" ? (
                            <MarkOrderPaidButton saleId={r.id} code={r.code} total={r.total} />
                          ) : (
                            r.owed > 0 && <PaymentButton kind={SETTLE_KIND[kind]} id={r.id} owed={r.owed} code={r.code} deliveryOwed={deliveryOwed} />
                          )}
                          <Link
                            href={detail}
                            aria-label={`More actions for ${r.code}`}
                            className="inline-flex h-11 w-11 items-center justify-center rounded-md text-pos-soft hover:bg-pos-paper-deep hover:text-pos-ink md:h-9 md:w-9"
                          >
                            <MoreIcon />
                          </Link>
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </ScrollTable>
            <Pager page={params.page} pageSize={pageSize} total={total} href={(page) => href({ page })} />
          </>
        ) : (
          <div className="flex flex-col items-center gap-3 px-6 py-14 text-center">
            <span className="flex h-14 w-14 items-center justify-center rounded-full bg-pos-paper-deep text-pos-soft">
              <ReturnsIcon />
            </span>
            <span className="font-pos-display text-[26px] leading-[1.1]">
              {params.q || params.filter !== "all" || params.period !== "all" || params.rider ? "Nothing here." : m.emptyTitle}
            </span>
            <span className="max-w-[420px] text-sm leading-[22px] text-pos-soft">
              {params.q || params.filter !== "all" || params.period !== "all" || params.rider ? "No records match this filter. Try All or All time." : m.emptyBody}
            </span>
          </div>
        )}
      </Card>
    </PageShell>
  );
}

/** Reads ?q=&filter=&period=&rider=&page= for the three lists. */
export function parseRecordsParams(raw: Record<string, string | string[] | undefined>): RecordsParams {
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
  const filter = one(raw.filter);
  const period = one(raw.period);
  const page = Number(one(raw.page));
  return {
    q: one(raw.q).trim().slice(0, 100),
    filter: (RECORD_FILTERS as readonly string[]).includes(filter) ? (filter as RecordFilter) : "all",
    period: (RECORD_PERIODS as readonly string[]).includes(period) ? (period as RecordPeriod) : "all",
    rider: riderTerm(one(raw.rider)),
    page: Number.isSafeInteger(page) && page >= 1 && page <= 10_000 ? page : 1,
  };
}
