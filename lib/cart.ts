import { MAX_CART_LINES, MAX_LINE_QTY } from "@/lib/checkout";
import { lineTotal, sumPesewas, type Pesewas } from "@/lib/money";

export type LineProblem = "unavailable" | "out_of_stock";

/**
 * A cart line kept in the browser. Name, price and image are a display copy,
 * refreshed from the database on the cart page; checkout never trusts them.
 */
export type CartLine = {
  variantId: string;
  productId: string;
  slug: string;
  productName: string;
  optionValues: string | null;
  unitPrice: Pesewas;
  image: { url: string; alt: string } | null;
  qty: number;
  /** Set when the line can't be ordered any more. */
  problem: LineProblem | null;
};

export type NewCartLine = Omit<CartLine, "qty" | "problem">;

/** Fresh details for a variant, as returned by /api/cart. */
export type CurrentVariant = NewCartLine & { inStock: boolean };

const clampQty = (qty: number) => Math.min(MAX_LINE_QTY, Math.max(1, Math.trunc(qty)));

/** Adds a variant, or raises the quantity if it is already in the cart. Returns the same array when full. */
export function addLine(lines: readonly CartLine[], line: NewCartLine, qty = 1): CartLine[] {
  const existing = lines.find((l) => l.variantId === line.variantId);
  if (existing) {
    return lines.map((l) =>
      l.variantId === line.variantId ? { ...l, ...line, qty: clampQty(l.qty + qty), problem: null } : l,
    );
  }
  if (lines.length >= MAX_CART_LINES) return lines as CartLine[];
  return [...lines, { ...line, qty: clampQty(qty), problem: null }];
}

export function setLineQty(lines: readonly CartLine[], variantId: string, qty: number): CartLine[] {
  return lines.map((l) => (l.variantId === variantId ? { ...l, qty: clampQty(qty) } : l));
}

export function removeLine(lines: readonly CartLine[], variantId: string): CartLine[] {
  return lines.filter((l) => l.variantId !== variantId);
}

/** Updates lines with current database details; variants not returned are no longer available. */
export function refreshLines(lines: readonly CartLine[], current: readonly CurrentVariant[]): CartLine[] {
  const byId = new Map(current.map((v) => [v.variantId, v]));
  return lines.map((line) => {
    const fresh = byId.get(line.variantId);
    if (!fresh) return { ...line, problem: "unavailable" };
    const { inStock, ...details } = fresh;
    return { ...line, ...details, problem: inStock ? null : "out_of_stock" };
  });
}

/** Marks lines the checkout rejected. */
export function markProblems(lines: readonly CartLine[], problems: Record<string, LineProblem>): CartLine[] {
  return lines.map((l) => (problems[l.variantId] ? { ...l, problem: problems[l.variantId] } : l));
}

/** Number of items, for the header badge. */
export function cartCount(lines: readonly CartLine[]): number {
  return lines.reduce((n, l) => n + l.qty, 0);
}

/** Total of the lines that can be ordered. */
export function cartTotal(lines: readonly CartLine[]): Pesewas {
  return sumPesewas(lines.filter((l) => !l.problem).map((l) => lineTotal(l.unitPrice, l.qty)));
}
