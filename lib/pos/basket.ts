import { lineTotal, parseCedis, sumPesewas, type Pesewas } from "@/lib/money";

// The till's basket. Prices here are for display only: the database works
// every price out again when the sale is saved (pos_complete_sale).

export type BasketLine = {
  variantId: string;
  /** "Blender 1.5L" */
  name: string;
  /** The colour (or design) picked, or null. Colours share the product's one stock number. */
  choice: string | null;
  sku: string | null;
  unitPrice: Pesewas;
  qty: number;
  /** What was on the shelf when it was added: the basket's lines for this item never go above it together. */
  maxQty: number;
};

export type NewBasketLine = Omit<BasketLine, "qty">;

/** A customer picked at the till. */
export type CustomerChoice = { id: string; name: string; phone: string | null };

export const MAX_LINE_QTY = 999;

/** What tells two basket lines apart: the item and the colour picked. */
export function basketLineKey(line: { variantId: string; choice?: string | null }): string {
  return `${line.variantId}|${line.choice ?? ""}`;
}

/** "Blender 1.5L (Black)" for the basket, receipts and messages. */
export function basketLineName(line: { name: string; choice?: string | null }): string {
  return line.choice ? `${line.name} (${line.choice})` : line.name;
}

/** How many of an item are in the basket, all colours together. */
export function basketQty(lines: readonly BasketLine[], variantId: string): number {
  return lines.filter((l) => l.variantId === variantId).reduce((n, l) => n + l.qty, 0);
}

/** How many more of this line's item fit: the shelf less the item's other lines. */
function room(lines: readonly BasketLine[], line: { variantId: string; choice?: string | null }, maxQty: number): number {
  const key = basketLineKey(line);
  const others = lines.filter((l) => l.variantId === line.variantId && basketLineKey(l) !== key).reduce((n, l) => n + l.qty, 0);
  return Math.min(maxQty - others, MAX_LINE_QTY);
}

/** Adds one (or more) of an item in a colour, never above what is on the shelf (all colours together). */
export function addToBasket(lines: readonly BasketLine[], item: NewBasketLine, qty = 1): BasketLine[] {
  const cap = room(lines, item, item.maxQty);
  const key = basketLineKey(item);
  const existing = lines.find((l) => basketLineKey(l) === key);
  if (cap <= (existing?.qty ?? 0)) return [...lines];
  if (existing) {
    return lines.map((l) => (basketLineKey(l) === key ? { ...l, ...item, qty: Math.min(l.qty + qty, cap) } : l));
  }
  return [...lines, { ...item, qty: Math.min(qty, cap) }];
}

/** Sets a line's quantity (by line key); 0 or less removes it. Never above the shelf, all colours together. */
export function setBasketQty(lines: readonly BasketLine[], key: string, qty: number): BasketLine[] {
  if (qty <= 0) return lines.filter((l) => basketLineKey(l) !== key);
  return lines.map((l) => (basketLineKey(l) === key ? { ...l, qty: Math.max(1, Math.min(qty, room(lines, l, l.maxQty))) } : l));
}

export type BasketTotals = { items: number; subtotal: Pesewas; discount: Pesewas; delivery: Pesewas; total: Pesewas };

/**
 * Item count and money. A discount larger than the items is capped at the
 * items; a delivery fee comes on top and is never discounted.
 */
export function basketTotals(lines: readonly BasketLine[], discount: Pesewas = 0, deliveryFee: Pesewas = 0): BasketTotals {
  const subtotal = sumPesewas(lines.map((l) => lineTotal(l.unitPrice, l.qty)));
  const capped = Math.max(0, Math.min(discount, subtotal));
  const delivery = Math.max(0, deliveryFee);
  return {
    items: lines.reduce((n, l) => n + l.qty, 0),
    subtotal,
    discount: capped,
    delivery,
    total: subtotal - capped + delivery,
  };
}

/** How the customer gets the goods: takes them from the shop, or the shop delivers. */
export const FULFILMENTS = ["collect", "delivery"] as const;
export type Fulfilment = (typeof FULFILMENTS)[number];
export const FULFILMENT_LABELS: Record<Fulfilment, string> = { collect: "Collect in shop", delivery: "Delivery" };

/** The delivery fee as typed at the till, in pesewas: 0 when collecting or left empty, null when it isn't an amount. */
export function draftDeliveryFee(fulfilment: Fulfilment, feeText: string): Pesewas | null {
  if (fulfilment !== "delivery" || feeText.trim() === "") return 0;
  return parseCedis(feeText);
}

/** What a product tile says about the shelf, as in the design. */
export function tileStock(onHand: number, inBasket: number): { text: string; tone: "out" | "low" | "ok"; canAdd: boolean } {
  if (onHand <= 0) return { text: "Out of stock", tone: "out", canAdd: false };
  const left = onHand - inBasket;
  if (left <= 0) return { text: "All in basket", tone: "low", canAdd: false };
  if (left <= 3) return { text: `Only ${left} left`, tone: "low", canAdd: true };
  return { text: `${left} in stock`, tone: "ok", canAdd: true };
}

/**
 * The quick "Cash received" buttons: exact, then the next round 50 and 100
 * cedis above the total (5,000 and 10,000 pesewas), always going up.
 */
export function cashOptions(total: Pesewas): Pesewas[] {
  const roundUp = (step: number) => Math.ceil(total / step) * step;
  let fifty = roundUp(5000);
  if (fifty === total) fifty = total + 5000;
  let hundred = roundUp(10000);
  if (hundred <= fifty) hundred = fifty + 5000;
  return [total, fifty, hundred];
}

/** Change to give back; null when the cash doesn't cover the total yet. */
export function changeDue(total: Pesewas, cashReceived: Pesewas | null): Pesewas | null {
  if (cashReceived === null) return 0;
  return cashReceived >= total ? cashReceived - total : null;
}

export const PAYMENT_METHODS = ["cash", "momo", "bank", "later"] as const;
export type PaymentChoice = (typeof PAYMENT_METHODS)[number];

export const PAYMENT_LABELS: Record<PaymentChoice, string> = {
  cash: "Cash",
  momo: "Mobile Money",
  bank: "Bank transfer",
  later: "Pay later",
};
