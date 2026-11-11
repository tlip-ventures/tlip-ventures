import type { Database } from "@/lib/database.types";
import type { PaymentChoice } from "./basket";

// Labels and colours for the Sales / Purchases / Returns screen
// (design/pos/sales-purchases-returns.html).

export const RECORD_KINDS = ["sales", "purchases", "returns"] as const;
export type RecordKind = (typeof RECORD_KINDS)[number];

export const RECORD_FILTERS = ["all", "unpaid", "paid"] as const;
export type RecordFilter = (typeof RECORD_FILTERS)[number];

export const RECORD_FILTER_LABELS: Record<RecordFilter, string> = { all: "All", unpaid: "Unpaid", paid: "Paid" };

export type SaleStatus = Database["public"]["Enums"]["sale_status"];
export type PurchaseStatus = Database["public"]["Enums"]["purchase_status"];

/** The design's words and tints for each tab. */
export const TAB_META: Record<
  RecordKind,
  {
    heading: string;
    party: string;
    create: string;
    createHref: string;
    paidLabel: string;
    dueLabel: string;
    settle: string;
    search: string;
    emptyTitle: string;
    emptyBody: string;
  }
> = {
  sales: {
    heading: "Sales",
    party: "Customer",
    create: "New sale",
    createHref: "/pos/sell",
    paidLabel: "Collected",
    dueLabel: "Customers owe you",
    settle: "Mark paid",
    search: "Search by reference or customer",
    emptyTitle: "No sales yet.",
    emptyBody: "Sales rung up at the till show here, with what was paid and what customers still owe.",
  },
  purchases: {
    heading: "Purchases",
    party: "Supplier",
    create: "New purchase",
    createHref: "/pos/purchases/new",
    paidLabel: "Paid to suppliers",
    dueLabel: "You owe suppliers",
    settle: "Record payment",
    search: "Search by reference or supplier",
    emptyTitle: "No purchases yet.",
    emptyBody: "Record what you buy from suppliers here. Receiving a delivery adds it to the shelf count.",
  },
  returns: {
    heading: "Returns",
    party: "Customer",
    create: "New return",
    createHref: "/pos/returns/new",
    paidLabel: "Refunded",
    dueLabel: "Refunds owed",
    settle: "Record refund",
    search: "Search returns",
    emptyTitle: "No returns yet.",
    emptyBody: "When a customer brings something back, record it here so the item goes back on the shelf count and any refund is tracked.",
  },
};

const GREEN = "bg-pos-tint-green text-pos-green-ink";
const SAND = "bg-pos-paper-deep text-pos-soft";
const ORANGE = "bg-pos-tint-orange text-pos-rust";

export type StatusPill = { label: string; className: string };

export function saleStatusPill(status: SaleStatus): StatusPill {
  switch (status) {
    case "completed":
      return { label: "Completed", className: GREEN };
    case "ordered":
      return { label: "Ordered", className: ORANGE };
    case "pending":
      return { label: "Pending", className: SAND };
    case "on_hold":
      return { label: "On hold", className: ORANGE };
    case "reserved":
      return { label: "Reserved", className: "bg-pos-sage text-pos-forest" };
    default:
      return { label: "Cancelled", className: SAND };
  }
}

export function purchaseStatusPill(status: PurchaseStatus): StatusPill {
  switch (status) {
    case "received":
      return { label: "Received", className: GREEN };
    case "ordered":
      return { label: "Ordered", className: ORANGE };
    default:
      return { label: "Cancelled", className: SAND };
  }
}

export function returnStatusPill(items: number, restocked: number): StatusPill {
  if (restocked === items) return { label: "Back on shelf", className: GREEN };
  if (restocked === 0) return { label: "Not restocked", className: SAND };
  return { label: "Part restocked", className: SAND };
}

/** "Paid", "Part paid" or "Unpaid", as on the design's Payment column. */
export function paymentPill(paid: number, owed: number, cancelled = false): StatusPill {
  if (cancelled) return { label: "—", className: SAND };
  if (owed <= 0) return { label: "Paid", className: GREEN };
  if (paid > 0) return { label: "Part paid", className: SAND };
  return { label: "Unpaid", className: ORANGE };
}

export const METHOD_LABELS: Record<Exclude<PaymentChoice, "later">, string> = {
  cash: "Cash",
  momo: "Mobile Money",
  bank: "Bank transfer",
};

/** The date filter on the Sales / Purchases / Returns lists. */
export const RECORD_PERIODS = ["all", "today", "week", "month"] as const;
export type RecordPeriod = (typeof RECORD_PERIODS)[number];

export const RECORD_PERIOD_LABELS: Record<RecordPeriod, string> = {
  all: "All time",
  today: "Today",
  week: "This week",
  month: "This month",
};

/**
 * The times a period covers, Ghana time (UTC): today from midnight, this week
 * from Monday, this month from the 1st, each up to its end. null: all time.
 */
export function recordPeriodRange(period: RecordPeriod, now: Date): { from: Date; to: Date } | null {
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth();
  const d = now.getUTCDate();
  if (period === "today") return { from: new Date(Date.UTC(y, m, d)), to: new Date(Date.UTC(y, m, d + 1)) };
  if (period === "week") {
    const sinceMonday = (now.getUTCDay() + 6) % 7;
    return { from: new Date(Date.UTC(y, m, d - sinceMonday)), to: new Date(Date.UTC(y, m, d - sinceMonday + 7)) };
  }
  if (period === "month") return { from: new Date(Date.UTC(y, m, 1)), to: new Date(Date.UTC(y, m + 1, 1)) };
  return null;
}

/** A rider's name as typed in the address bar, safe to match exactly (no wildcards). */
export function riderTerm(raw: string | undefined): string {
  return (raw ?? "").replace(/[%_*\\,()"]/g, "").replace(/\s+/g, " ").trim().slice(0, 60);
}

/**
 * "How it was paid" from the methods on a sale ("cash", "momo", "bank", joined
 * by commas): "Mobile Money", "Cash + Mobile Money"; "—" when nothing is paid yet.
 */
export function paidByText(methods: string | null | undefined): string {
  const names = (methods ?? "")
    .split(",")
    .map((m) => METHOD_LABELS[m.trim() as keyof typeof METHOD_LABELS])
    .filter(Boolean);
  return names.length ? names.join(" + ") : "—";
}

/** The Sales list's Retail / Wholesale filter. */
export const SALE_TYPES = ["all", "retail", "wholesale"] as const;
export type SaleType = (typeof SALE_TYPES)[number];
export const SALE_TYPE_LABELS: Record<SaleType, string> = { all: "All sales", retail: "Retail", wholesale: "Wholesale" };

/** For the database: null = both, true = wholesale only, false = retail only. */
export function saleTypeFilter(type: SaleType): boolean | null {
  return type === "all" ? null : type === "wholesale";
}
