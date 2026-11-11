import "server-only";
import { formatDayTime } from "@/lib/pos/format";
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
  SALE_TYPE_LABELS,
  SALE_TYPES,
  saleStatusPill,
  TAB_META,
  type RecordFilter,
  type RecordPeriod,
  type SaleType,
} from "@/lib/pos/records";
import { STOCK_FILTER_LABELS, STOCK_FILTERS, STOCK_PILLS, type StockFilter } from "@/lib/pos/stock";
import type { XlsxCell } from "@/lib/pos/xlsx";
import { requirePosUser } from "./auth";
import { listRecords, type RecordRow } from "./records";
import { listStockRows, type StockRow } from "./stock";

// The Download PDF and Excel buttons: the same list as on screen (search and
// filter applied), every page of it, as rows of cells.

export const EXPORT_LISTS = ["sales", "purchases", "returns", "stock"] as const;
export type ExportList = (typeof EXPORT_LISTS)[number];

/** PostgREST returns at most 1,000 rows a request; a download takes up to this many. */
const BATCH = 1000;
const MAX_ROWS = 10_000;

export type ExportColumn = { label: string; width: number; align?: "right" };

export type ExportTable = {
  title: string;
  /** "Unpaid · search “ama”", for the printed heading. */
  scope: string;
  fileName: string;
  columns: ExportColumn[];
  rows: XlsxCell[][];
  /** Money totals under the table, e.g. ["Total", 1250000]. */
  totals: [string, number][];
  /** True when the list was longer than MAX_ROWS. */
  cut: boolean;
};

export type ExportParams = { q: string; filter: string; period: RecordPeriod; rider: string; type: SaleType };

export function parseExportParams(get: (name: string) => string | null): ExportParams {
  const period = get("period") ?? "all";
  return {
    q: (get("q") ?? "").trim().slice(0, 100),
    filter: get("filter") ?? "all",
    period: (RECORD_PERIODS as readonly string[]).includes(period) ? (period as RecordPeriod) : "all",
    rider: riderTerm(get("rider") ?? undefined),
    type: (SALE_TYPES as readonly string[]).includes(get("type") ?? "") ? (get("type") as SaleType) : "all",
  };
}

async function everyPage<T>(load: (page: number) => Promise<{ rows: T[]; total: number }>) {
  const rows: T[] = [];
  let total = 0;
  for (let page = 1; rows.length < MAX_ROWS; page++) {
    const r = await load(page);
    total = r.total;
    rows.push(...r.rows);
    if (r.rows.length < BATCH || rows.length >= total) break;
  }
  return { rows: rows.slice(0, MAX_ROWS), cut: total > MAX_ROWS };
}

const money = (pesewas: number): XlsxCell => ({ pesewas });

function scopeText(filterLabel: string | null, q: string) {
  return [filterLabel, q ? `search “${q}”` : null].filter(Boolean).join(" · ") || "Everything";
}

function stamp() {
  return new Date().toISOString().slice(0, 10);
}

/** null when the list doesn't exist or this person may not see it. */
export async function buildExport(list: string, params: ExportParams): Promise<ExportTable | null> {
  const user = await requirePosUser();
  if (!(EXPORT_LISTS as readonly string[]).includes(list)) return null;
  const kind = list as ExportList;
  if (kind === "purchases" && !user.isOwner) return null;

  if (kind === "stock") {
    const filter: StockFilter = (STOCK_FILTERS as readonly string[]).includes(params.filter) ? (params.filter as StockFilter) : "all";
    const { rows, cut } = await everyPage<StockRow>((page) => listStockRows({ search: params.q, filter, page, pageSize: BATCH }));
    const columns: ExportColumn[] = [
      { label: "Product", width: 36 },
      { label: "SKU", width: 14 },
      { label: "Barcode", width: 16 },
      { label: "Category", width: 22 },
      { label: "Price", width: 12, align: "right" },
      { label: "In the shop", width: 11, align: "right" },
      { label: "Warehouse", width: 11, align: "right" },
      { label: "Alert at", width: 10, align: "right" },
      { label: "Status", width: 14 },
      { label: "On the website", width: 14 },
    ];
    if (user.isOwner) columns.push({ label: "Cost", width: 12, align: "right" }, { label: "Stock value", width: 14, align: "right" });
    let value = 0;
    const cells = rows.map((r) => {
      const row: XlsxCell[] = [
        r.productName,
        r.sku,
        r.barcode,
        r.categoryName ?? r.topCategoryName,
        money(r.price),
        r.onHand,
        r.warehouseOnHand,
        r.reorderLevel,
        STOCK_PILLS[r.state].label,
        r.onWebsite ? "Yes" : "No",
      ];
      if (user.isOwner) {
        // Value of every place's stock (the shop and the warehouse).
        const units = Math.max(0, r.onHand) + Math.max(0, r.warehouseOnHand);
        const v = r.cost !== null && units > 0 ? r.cost * units : null;
        if (v) value += v;
        row.push(r.cost === null ? null : money(r.cost), v === null ? null : money(v));
      }
      return row;
    });
    return {
      title: "Products and stock",
      scope: scopeText(filter === "all" ? null : STOCK_FILTER_LABELS[filter], params.q),
      fileName: `stock-${stamp()}.xlsx`,
      columns,
      rows: cells,
      totals: user.isOwner ? [["Stock value at cost", value]] : [],
      cut,
    };
  }

  const filter: RecordFilter = (RECORD_FILTERS as readonly string[]).includes(params.filter) ? (params.filter as RecordFilter) : "all";
  const { rows, cut } = await everyPage<RecordRow>((page) => listRecords(kind, { search: params.q, filter, period: params.period, rider: kind === "sales" ? params.rider : "", type: kind === "sales" ? params.type : "all", page, pageSize: BATCH }));
  const meta = TAB_META[kind];
  const status = (r: RecordRow) =>
    kind === "sales"
      ? saleStatusPill(r.saleStatus!).label
      : kind === "purchases"
        ? purchaseStatusPill(r.purchaseStatus!).label
        : returnStatusPill(r.items ?? 0, r.restocked ?? 0).label;
  const live = rows.filter((r) => !r.cancelled);
  const sum = (pick: (r: RecordRow) => number) => live.reduce((n, r) => n + pick(r), 0);

  return {
    title: meta.heading,
    scope: scopeText(
      [
        params.period === "all" ? null : RECORD_PERIOD_LABELS[params.period],
        kind === "sales" && params.rider ? `Rider ${params.rider}` : null,
        kind === "sales" && params.type !== "all" ? SALE_TYPE_LABELS[params.type] : null,
        filter === "all" ? null : RECORD_FILTER_LABELS[filter],
      ]
        .filter(Boolean)
        .join(" · ") || null,
      params.q,
    ),
    fileName: `${kind}-${stamp()}.xlsx`,
    columns: [
      { label: "Date", width: 18 },
      { label: "Reference", width: 12 },
      ...(kind === "sales" ? ([{ label: "Wholesale", width: 11 }] as ExportColumn[]) : []),
      { label: meta.party, width: 28 },
      ...(kind === "sales" ? ([{ label: "Deliver to", width: 30 }] as ExportColumn[]) : []),
      { label: "Status", width: 14 },
      // Sales: items and delivery apart, then the total the customer pays.
      ...(kind === "sales"
        ? ([
            { label: "Items", width: 14, align: "right" },
            { label: "Delivery", width: 12, align: "right" },
            { label: "Delivery in price", width: 12 },
            { label: "Rider", width: 16 },
          ] as ExportColumn[])
        : []),
      { label: "Total", width: 14, align: "right" },
      { label: kind === "returns" ? "Refunded" : "Paid", width: 14, align: "right" },
      ...(kind === "sales"
        ? ([
            { label: "Items paid", width: 14, align: "right" },
            { label: "Delivery paid", width: 14, align: "right" },
          ] as ExportColumn[])
        : []),
      { label: "Still owed", width: 14, align: "right" },
      { label: "Payment", width: 12 },
      ...(kind === "sales" ? ([{ label: "Paid by", width: 16 }] as ExportColumn[]) : []),
    ],
    rows: rows.map((r) => [
      formatDayTime(r.createdAt),
      r.code,
      ...(kind === "sales" ? [r.wholesale ? "Yes" : ""] : []),
      r.party,
      ...(kind === "sales" ? [r.deliverTo ?? (r.fromWebsite ? "" : "In the shop")] : []),
      status(r),
      ...(kind === "sales" ? [money(r.total - (r.delivery ?? 0)), money(r.delivery ?? 0), r.delivery && r.deliveryIncluded ? "Yes" : "", r.rider ?? ""] : []),
      money(r.total),
      money(r.paid),
      ...(kind === "sales" ? [money(r.paid - (r.deliveryPaid ?? 0)), money(r.deliveryPaid ?? 0)] : []),
      money(r.owed),
      paymentPill(r.paid, r.owed, r.cancelled).label,
      ...(kind === "sales" ? [r.paidBy ? paidByText(r.paidBy) : r.owed > 0 && !r.cancelled ? "Pay later" : ""] : []),
    ]),
    totals: [
      ["Total value", sum((r) => r.total)],
      [meta.paidLabel, sum((r) => r.paid)],
      [meta.dueLabel, sum((r) => r.owed)],
      ...(kind === "sales"
        ? ([
            ["Delivery fees", sum((r) => r.delivery ?? 0)],
            ["Paid for items", sum((r) => r.paid - (r.deliveryPaid ?? 0))],
            ["Paid for delivery", sum((r) => r.deliveryPaid ?? 0)],
          ] as [string, number][])
        : []),
    ],
    cut,
  };
}
