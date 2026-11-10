import { formatPesewas, type Pesewas } from "@/lib/money";
import { formatDay } from "./format";
import { lineName } from "./receipt";

// Invoices: what a customer would pay, given before they buy. They take
// nothing off the shelf; the till sells them later at today's prices.

export const INVOICE_STATUSES = ["open", "sold", "cancelled"] as const;
export type InvoiceStatus = (typeof INVOICE_STATUSES)[number];

export const INVOICE_FILTERS = ["open", "sold", "cancelled", "all"] as const;
export type InvoiceFilter = (typeof INVOICE_FILTERS)[number];

export const INVOICE_FILTER_LABELS: Record<InvoiceFilter, string> = {
  open: "Open",
  sold: "Sold",
  cancelled: "Cancelled",
  all: "All",
};

/** How long an invoice's prices hold unless the cashier picks another date. */
export const INVOICE_VALID_DAYS = 7;

/** "2026-11-09": today in Ghana (UTC), as a date input wants it. */
export function ghanaToday(now: Date): string {
  return now.toISOString().slice(0, 10);
}

/** The default "valid until": a week from today. */
export function defaultValidUntil(now: Date, days = INVOICE_VALID_DAYS): string {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + days));
  return d.toISOString().slice(0, 10);
}

/** An open invoice past its date has expired (the day itself still counts). */
export function isExpired(status: InvoiceStatus, validUntil: string, today: string): boolean {
  return status === "open" && validUntil < today;
}

export function invoicePill(status: InvoiceStatus, validUntil: string, today: string): { label: string; className: string } {
  if (status === "sold") return { label: "Sold", className: "bg-pos-tint-green text-pos-green-ink" };
  if (status === "cancelled") return { label: "Cancelled", className: "bg-pos-paper-deep text-pos-soft" };
  if (isExpired(status, validUntil, today)) return { label: "Expired", className: "bg-pos-tint-orange text-pos-rust" };
  return { label: "Open", className: "bg-pos-sage text-pos-forest" };
}

export type InvoiceLine = { qty: number; productName: string; optionValues: string | null; unitPrice: Pesewas; lineTotal: Pesewas };

export type InvoiceText = {
  storeName: string;
  code: string;
  createdAt: string;
  validUntil: string;
  lines: readonly InvoiceLine[];
  discount: Pesewas;
  deliveryFee: Pesewas;
  deliveryAddress: string | null;
  /** The fee is already in the price (part of the total). */
  deliveryIncluded?: boolean;
  /** At wholesale prices. */
  wholesale?: boolean;
  total: Pesewas;
};

/**
 * The invoice as a WhatsApp message:
 *
 *   Tlip Ventures invoice
 *   Invoice INV_1001 · 9 Nov 2026
 *   2 x Frying pan 28 cm - GH₵ 320
 *   Discount: -GH₵ 20
 *   Delivery: GH₵ 30
 *   Total: GH₵ 330
 *   Deliver to: Dansoman, near Sharp Curve
 *   Prices held until 16 Nov 2026.
 */
export function buildInvoiceMessage(inv: InvoiceText): string {
  const out = [`${inv.storeName} invoice`, `Invoice ${inv.code} · ${formatDay(inv.createdAt)}`];
  if (inv.wholesale) out.push("Wholesale prices");
  for (const l of inv.lines) out.push(`${l.qty} x ${lineName(l.productName, l.optionValues)} - ${formatPesewas(l.lineTotal)}`);
  if (inv.discount > 0) out.push(`Discount: -${formatPesewas(inv.discount)}`);
  if (inv.deliveryAddress) out.push(`${inv.deliveryIncluded ? "Delivery (in the price)" : "Delivery"}: ${formatPesewas(inv.deliveryFee)}`);
  out.push(`Total: ${formatPesewas(inv.total)}`);
  if (inv.deliveryAddress) out.push(`Deliver to: ${inv.deliveryAddress}`);
  out.push(`Prices held until ${formatDay(inv.validUntil)}.`);
  return out.join("\n");
}

/** A line of an invoice as it stands at the till today. */
export type TillCheck = {
  name: string;
  invoicePrice: Pesewas;
  /** null: no longer sold. */
  price: Pesewas | null;
  qty: number;
  onHand: number;
};

/**
 * What the cashier should know before selling an invoice: prices that changed,
 * items no longer sold, and items short on the shelf.
 */
export function tillWarnings(lines: readonly TillCheck[]): string[] {
  const out: string[] = [];
  for (const l of lines) {
    if (l.price === null) {
      out.push(`${l.name} is no longer sold, so it was left out.`);
    } else if (l.onHand <= 0) {
      out.push(`${l.name} is out of stock, so it was left out.`);
    } else if (l.onHand < l.qty) {
      out.push(`Only ${l.onHand} of ${l.name} on the shelf (the invoice has ${l.qty}).`);
    }
    if (l.price !== null && l.price !== l.invoicePrice) {
      const way = l.price > l.invoicePrice ? "up" : "down";
      out.push(`${l.name} has gone ${way}: ${formatPesewas(l.invoicePrice)} on the invoice, ${formatPesewas(l.price)} today.`);
    }
  }
  return out;
}
