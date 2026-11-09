import { MAX_CART_LINES, MAX_LINE_QTY } from "@/lib/checkout";
import { lineTotal, sumPesewas, type Pesewas } from "@/lib/money";
import { matchChoice } from "@/lib/product";

export type LineProblem = "unavailable" | "out_of_stock";

/**
 * A cart line kept in the browser. Name, price and image are a display copy,
 * refreshed from the database on the cart page; checkout never trusts them.
 * The same product in two colours is two lines sharing one variant (one stock
 * number), told apart by optionValues, the colour picked.
 */
export type CartLine = {
  variantId: string;
  productId: string;
  slug: string;
  productName: string;
  /** The colour (or other choice) picked, or null when the product has none. */
  optionValues: string | null;
  unitPrice: Pesewas;
  image: { url: string; alt: string } | null;
  qty: number;
  /** Set when the line can't be ordered any more. */
  problem: LineProblem | null;
};

export type NewCartLine = Omit<CartLine, "qty" | "problem">;

/** Fresh details for a variant, as returned by /api/cart. */
export type CurrentVariant = Omit<NewCartLine, "optionValues"> & { inStock: boolean; choices: string[] };

/** What tells two cart lines apart: the variant and the choice picked. */
export function lineKey(line: { variantId: string; optionValues: string | null }): string {
  return `${line.variantId}|${line.optionValues ?? ""}`;
}

const clampQty = (qty: number) => Math.min(MAX_LINE_QTY, Math.max(1, Math.trunc(qty)));

/** Adds a line, or raises the quantity if the same item and choice is already in the cart. Returns the same array when full. */
export function addLine(lines: readonly CartLine[], line: NewCartLine, qty = 1): CartLine[] {
  const key = lineKey(line);
  if (lines.some((l) => lineKey(l) === key)) {
    return lines.map((l) => (lineKey(l) === key ? { ...l, ...line, qty: clampQty(l.qty + qty), problem: null } : l));
  }
  if (lines.length >= MAX_CART_LINES) return lines as CartLine[];
  return [...lines, { ...line, qty: clampQty(qty), problem: null }];
}

export function setLineQty(lines: readonly CartLine[], key: string, qty: number): CartLine[] {
  return lines.map((l) => (lineKey(l) === key ? { ...l, qty: clampQty(qty) } : l));
}

export function removeLine(lines: readonly CartLine[], key: string): CartLine[] {
  return lines.filter((l) => lineKey(l) !== key);
}

/**
 * Updates lines with current database details. Variants not returned are no
 * longer available, and so is a line whose colour the product no longer has.
 */
export function refreshLines(lines: readonly CartLine[], current: readonly CurrentVariant[]): CartLine[] {
  const byId = new Map(current.map((v) => [v.variantId, v]));
  return lines.map((line) => {
    const fresh = byId.get(line.variantId);
    if (!fresh) return { ...line, problem: "unavailable" };
    const { inStock, choices, ...details } = fresh;
    const choice = matchChoice(choices, line.optionValues);
    if (choice === undefined) return { ...line, ...details, problem: "unavailable" };
    return { ...line, ...details, optionValues: choice, problem: inStock ? null : "out_of_stock" };
  });
}

/** Marks lines the checkout rejected, by line key. */
export function markProblems(lines: readonly CartLine[], problems: Record<string, LineProblem>): CartLine[] {
  return lines.map((l) => (problems[lineKey(l)] ? { ...l, problem: problems[lineKey(l)] } : l));
}

/** Number of items, for the header badge. */
export function cartCount(lines: readonly CartLine[]): number {
  return lines.reduce((n, l) => n + l.qty, 0);
}

/** Total of the lines that can be ordered. */
export function cartTotal(lines: readonly CartLine[]): Pesewas {
  return sumPesewas(lines.filter((l) => !l.problem).map((l) => lineTotal(l.unitPrice, l.qty)));
}
