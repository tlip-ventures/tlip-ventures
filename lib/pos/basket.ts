import { lineTotal, sumPesewas, type Pesewas } from "@/lib/money";

// The till's basket. Prices here are for display only: the database works
// every price out again when the sale is saved (pos_complete_sale).

export type BasketLine = {
  variantId: string;
  /** "Blender 1.5L (Black)" */
  name: string;
  sku: string | null;
  unitPrice: Pesewas;
  qty: number;
  /** What was on the shelf when it was added: the basket never goes above it. */
  maxQty: number;
};

export type NewBasketLine = Omit<BasketLine, "qty">;

/** A customer picked at the till. */
export type CustomerChoice = { id: string; name: string; phone: string | null };

export const MAX_LINE_QTY = 999;

/** Adds one (or more) of an item, never above what is on the shelf. */
export function addToBasket(lines: readonly BasketLine[], item: NewBasketLine, qty = 1): BasketLine[] {
  const cap = Math.min(item.maxQty, MAX_LINE_QTY);
  if (cap <= 0) return [...lines];
  const existing = lines.find((l) => l.variantId === item.variantId);
  if (existing) {
    return lines.map((l) =>
      l.variantId === item.variantId
        ? { ...l, ...item, maxQty: item.maxQty, qty: Math.min(l.qty + qty, cap) }
        : l,
    );
  }
  return [...lines, { ...item, qty: Math.min(qty, cap) }];
}

/** Sets a line's quantity; 0 or less removes it. Never above the shelf. */
export function setBasketQty(lines: readonly BasketLine[], variantId: string, qty: number): BasketLine[] {
  if (qty <= 0) return lines.filter((l) => l.variantId !== variantId);
  return lines.map((l) => (l.variantId === variantId ? { ...l, qty: Math.min(qty, l.maxQty, MAX_LINE_QTY) } : l));
}

export function basketQty(lines: readonly BasketLine[], variantId: string): number {
  return lines.find((l) => l.variantId === variantId)?.qty ?? 0;
}

export type BasketTotals = { items: number; subtotal: Pesewas; discount: Pesewas; total: Pesewas };

/** Item count and money. A discount larger than the sale is capped at the sale. */
export function basketTotals(lines: readonly BasketLine[], discount: Pesewas = 0): BasketTotals {
  const subtotal = sumPesewas(lines.map((l) => lineTotal(l.unitPrice, l.qty)));
  const capped = Math.max(0, Math.min(discount, subtotal));
  return {
    items: lines.reduce((n, l) => n + l.qty, 0),
    subtotal,
    discount: capped,
    total: subtotal - capped,
  };
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
