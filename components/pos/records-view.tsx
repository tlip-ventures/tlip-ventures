import Link from "next/link";
import { formatPesewas } from "@/lib/money";
import { formatDay } from "@/lib/pos/format";
import {
  paymentPill,
  purchaseStatusPill,
  RECORD_FILTER_LABELS,
  RECORD_FILTERS,
  returnStatusPill,
  saleStatusPill,
  TAB_META,
  type RecordFilter,
  type RecordKind,
} from "@/lib/pos/records";
import type { RecordRow, RecordsSummary } from "@/lib/server/pos/records";
import { DownloadIcon, MoreIcon, PlusIcon, ReturnsIcon } from "./icons";
import { FilterChips, Pager, SearchForm } from "./list-controls";
import { PaymentButton } from "./record-actions";
import { buttonClass, ButtonLink, Card, PageHeader, PageShell, Pill, ScrollTable, StatGrid, TableHead, Th } from "./ui";

export type RecordsParams = { q: string; filter: RecordFilter; page: number };

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
}: {
  kind: RecordKind;
  params: RecordsParams;
  rows: RecordRow[];
  total: number;
  pageSize: number;
  summary: RecordsSummary;
  isOwner: boolean;
}) {
  const m = TAB_META[kind];
  const base = PATHS[kind];
  const query = (changes: Partial<RecordsParams>) => {
    const next = { ...params, ...changes };
    const q = new URLSearchParams();
    if (next.filter !== "all") q.set("filter", next.filter);
    if (next.q) q.set("q", next.q);
    if (next.page > 1) q.set("page", String(next.page));
    return q.toString();
  };
  const href = (changes: Partial<RecordsParams>) => {
    const s = query(changes);
    return `${base}${s ? `?${s}` : ""}`;
  };
  const exportQuery = query({ page: 1 });
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

      <StatGrid min={200}>
        <div className="flex flex-col gap-1.5 rounded-[10px] border border-pos-card-line bg-white px-[18px] py-4">
          <span className="text-[13px] font-semibold text-pos-muted">Total value</span>
          <span className="font-pos-display text-[28px] leading-none tabular-nums">{formatPesewas(summary.total)}</span>
        </div>
        <div className="flex flex-col gap-1.5 rounded-[10px] border border-pos-card-line bg-white px-[18px] py-4">
          <span className="text-[13px] font-semibold text-pos-muted">{m.paidLabel}</span>
          <span className="font-pos-display text-[28px] leading-none tabular-nums text-pos-green-ink">{formatPesewas(summary.paid)}</span>
        </div>
        <div className="flex flex-col gap-1.5 rounded-[10px] border border-pos-card-line bg-white px-[18px] py-4">
          <span className="text-[13px] font-semibold text-pos-muted">{m.dueLabel}</span>
          <span className="font-pos-display text-[28px] leading-none tabular-nums text-pos-rust">{formatPesewas(summary.owed)}</span>
        </div>
      </StatGrid>

      <Card label={m.heading}>
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-pos-paper-deep px-[18px] py-3.5">
          <SearchForm
            action={base}
            id="sl-q"
            label="Search this list"
            placeholder={m.search}
            value={params.q}
            hidden={params.filter !== "all" ? { filter: params.filter } : {}}
          />
          <FilterChips<RecordFilter>
            label="Payment filter"
            options={RECORD_FILTERS.map((f) => ({ value: f, name: RECORD_FILTER_LABELS[f] }))}
            current={params.filter}
            href={(filter) => href({ filter, page: 1 })}
          />
        </div>

        {rows.length > 0 ? (
          <>
            <ScrollTable minWidth={860}>
              <TableHead>
                <Th>Date</Th>
                <Th>Reference</Th>
                <Th>{m.party}</Th>
                <Th>Status</Th>
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
                  return (
                    <tr key={r.id} className="pos-row border-t border-pos-paper-deep">
                      <td className="whitespace-nowrap py-3.5 pl-[18px] pr-3 text-pos-soft">{formatDay(r.createdAt)}</td>
                      <td className="px-3 py-3.5 font-bold">
                        <Link href={detail} className="text-pos-ink no-underline hover:underline">
                          {r.code}
                        </Link>
                      </td>
                      <td className="px-3 py-3.5">
                        <span className="flex flex-col">
                          <span>{r.party}</span>
                          <span className="text-xs text-pos-muted">{r.sub}</span>
                        </span>
                      </td>
                      <td className="px-3 py-3.5">
                        <Pill className={status.className}>{status.label}</Pill>
                      </td>
                      <td className="whitespace-nowrap px-3 py-3.5 text-right font-semibold tabular-nums">{formatPesewas(r.total)}</td>
                      <td className="whitespace-nowrap px-3 py-3.5 text-right tabular-nums">{formatPesewas(r.paid)}</td>
                      <td className={`whitespace-nowrap px-3 py-3.5 text-right tabular-nums ${r.owed ? "font-bold text-pos-rust" : "text-pos-muted"}`}>
                        {r.owed ? formatPesewas(r.owed) : "—"}
                      </td>
                      <td className="px-3 py-3.5">
                        <Pill className={pay.className}>{pay.label}</Pill>
                      </td>
                      <td className="whitespace-nowrap py-2 pl-3 pr-[18px] text-right">
                        <span className="inline-flex items-center gap-1.5">
                          {r.owed > 0 && <PaymentButton kind={SETTLE_KIND[kind]} id={r.id} owed={r.owed} code={r.code} />}
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
              {params.q || params.filter !== "all" ? "Nothing here." : m.emptyTitle}
            </span>
            <span className="max-w-[420px] text-sm leading-[22px] text-pos-soft">
              {params.q || params.filter !== "all" ? "No records match this filter. Try All." : m.emptyBody}
            </span>
          </div>
        )}
      </Card>
    </PageShell>
  );
}

/** Reads ?q=&filter=&page= for the three lists. */
export function parseRecordsParams(raw: Record<string, string | string[] | undefined>): RecordsParams {
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
  const filter = one(raw.filter);
  const page = Number(one(raw.page));
  return {
    q: one(raw.q).trim().slice(0, 100),
    filter: (RECORD_FILTERS as readonly string[]).includes(filter) ? (filter as RecordFilter) : "all",
    page: Number.isSafeInteger(page) && page >= 1 && page <= 10_000 ? page : 1,
  };
}
