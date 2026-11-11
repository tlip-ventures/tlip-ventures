import { deliveryQuote, type DeliveryPricing } from "@/lib/delivery";
import { lineTotal, parseCedis, pesewasToInput, sumPesewas, type Pesewas } from "@/lib/money";

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
  /** The wholesale price, used on wholesale sales; null or missing: none (the normal price). */
  wholesalePrice?: Pesewas | null;
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

/** The most this line can be: what is on the shelf less the item's other lines (other colours), at most MAX_LINE_QTY. */
export function lineRoom(lines: readonly BasketLine[], line: BasketLine): number {
  return Math.max(0, room(lines, line, line.maxQty));
}

/** A quantity typed at the till: "200" → 200, "0" → 0 (removes the line); null when it isn't a whole number. */
export function parseQty(text: string): number | null {
  const t = text.trim();
  return /^\d{1,4}$/.test(t) ? Number(t) : null;
}

/** Sets a line's quantity (by line key); 0 or less removes it. Never above the shelf, all colours together. */
export function setBasketQty(lines: readonly BasketLine[], key: string, qty: number): BasketLine[] {
  if (qty <= 0) return lines.filter((l) => basketLineKey(l) !== key);
  return lines.map((l) => (basketLineKey(l) === key ? { ...l, qty: Math.max(1, Math.min(qty, room(lines, l, l.maxQty))) } : l));
}

export type BasketTotals = {
  items: number;
  subtotal: Pesewas;
  discount: Pesewas;
  delivery: Pesewas;
  /** The delivery fee is already in the price agreed: part of the total, not added. */
  deliveryIncluded: boolean;
  total: Pesewas;
};

/**
 * Item count and money. A discount larger than the items is capped at the
 * items; a delivery fee comes on top and is never discounted, unless it is
 * already in the price, when the total stays and the fee is part of it.
 */
export function basketTotals(
  lines: readonly BasketLine[],
  discount: Pesewas = 0,
  deliveryFee: Pesewas = 0,
  deliveryIncluded = false,
  wholesale = false,
): BasketTotals {
  const subtotal = sumPesewas(lines.map((l) => lineTotal(linePrice(l, wholesale), l.qty)));
  const capped = Math.max(0, Math.min(discount, subtotal));
  const delivery = Math.max(0, deliveryFee);
  const included = deliveryIncluded && delivery > 0;
  return {
    items: lines.reduce((n, l) => n + l.qty, 0),
    subtotal,
    discount: capped,
    delivery,
    deliveryIncluded: included,
    total: subtotal - capped + (included ? 0 : delivery),
  };
}

/** What one of the line costs: its wholesale price on a wholesale sale (when it has one), else the normal price. */
export function linePrice(line: Pick<BasketLine, "unitPrice" | "wholesalePrice">, wholesale: boolean): Pesewas {
  return wholesale && line.wholesalePrice != null ? line.wholesalePrice : line.unitPrice;
}

/** A fee "in the price" can't be more than the total it is part of. */
export function deliveryTooBig(totals: BasketTotals): boolean {
  return totals.deliveryIncluded && totals.delivery > totals.total;
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

/**
 * The delivery fee as the till uses it, in cedis as typed: while the fee
 * follows the price list (auto) for a picked area, the area's price (its set
 * price, or the formula for its distance) less the delivery discount for this
 * order (items after any discount);
 * otherwise what was typed. Beyond the furthest distance the typed fee stands.
 */
export function deliveryFeeText(
  draft: { fee: string; area?: { km: number; fixedFee?: Pesewas | null } | null; auto?: boolean },
  pricing: DeliveryPricing | null,
  itemsTotal: Pesewas,
): string {
  if (!draft.auto || !draft.area || !pricing) return draft.fee;
  const quote = deliveryQuote(draft.area, itemsTotal, pricing);
  return quote.kind === "fee" ? pesewasToInput(quote.fee) : draft.fee;
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

/** Mobile Money for part of the total: how the rest is paid. Pay later leaves it owed. */
export const REST_METHODS = ["cash", "bank", "later"] as const;
export type RestMethod = (typeof REST_METHODS)[number];
export const REST_LABELS: Record<RestMethod, string> = { cash: "Cash", bank: "Bank transfer", later: "Pay later" };

export type SplitPayment = { method: "cash" | "momo" | "bank"; amount: Pesewas };

export type MomoSplit =
  | { kind: "full" }
  | { kind: "split"; momo: Pesewas; rest: Pesewas; restMethod: RestMethod; payments: SplitPayment[]; owed: Pesewas }
  | { kind: "error"; message: string };

/**
 * The MoMo amount typed at the till: empty or the whole total is a plain
 * Mobile Money sale; less splits it, the rest paid by cash or bank, or owed.
 */
export function momoSplit(total: Pesewas, momoText: string, restMethod: RestMethod): MomoSplit {
  if (momoText.trim() === "") return { kind: "full" };
  const momo = parseCedis(momoText);
  if (momo === null) return { kind: "error", message: "Enter the MoMo amount like 50 or 12.50, or leave it empty." };
  if (momo <= 0) return { kind: "error", message: "Enter a MoMo amount above GH₵ 0, or leave it empty." };
  if (momo > total) return { kind: "error", message: "The MoMo amount is more than the total." };
  if (momo === total) return { kind: "full" };
  const rest = total - momo;
  const payments: SplitPayment[] = [{ method: "momo", amount: momo }];
  if (restMethod !== "later") payments.push({ method: restMethod, amount: rest });
  return { kind: "split", momo, rest, restMethod, payments, owed: restMethod === "later" ? rest : 0 };
}
