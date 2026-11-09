import type { Pesewas } from "@/lib/money";

/** The variant fields needed to work out prices and stock. */
export type VariantPricing = {
  in_stock: boolean;
  price_override: Pesewas | null;
};

/** The product fields needed to work out prices. */
export type ProductPricing = {
  price: Pesewas;
  compare_at_price: Pesewas | null;
};

export type PriceSummary = {
  min: Pesewas;
  max: Pesewas;
  /** "Was" price to show struck through, only when it is above every current price. */
  compareAt: Pesewas | null;
  inStock: boolean;
};

/** A variant's price: its override if set, otherwise the product price. */
export function variantPrice(product: ProductPricing, variant: VariantPricing): Pesewas {
  return variant.price_override ?? product.price;
}

/**
 * Price range and stock state for display. Prices come from the in-stock
 * variants when there are any, so "From GH₵ 90" is a price you can order at.
 */
export function priceSummary(product: ProductPricing, variants: readonly VariantPricing[]): PriceSummary {
  const inStock = variants.some((v) => v.in_stock);
  const pool = inStock ? variants.filter((v) => v.in_stock) : variants;
  const prices = pool.length > 0 ? pool.map((v) => variantPrice(product, v)) : [product.price];
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const compareAt =
    product.compare_at_price !== null && product.compare_at_price > max ? product.compare_at_price : null;
  return { min, max, compareAt, inStock };
}

/** "Black", "Black / Large", or null for a product without options. */
export function optionLabel(variant: {
  option1_value: string | null;
  option2_value: string | null;
}): string | null {
  const values = [variant.option1_value, variant.option2_value].filter((v): v is string => Boolean(v));
  return values.length > 0 ? values.join(" / ") : null;
}

/**
 * Whole-percent discount for a "−20%" badge: round((1 − price / wasPrice) × 100),
 * worked out in integers. Null when there is no real discount to show.
 */
export function discountPercent(price: Pesewas, wasPrice: Pesewas | null): number | null {
  if (wasPrice === null || wasPrice <= 0 || price >= wasPrice) return null;
  const percent = Math.round(((wasPrice - price) * 100) / wasPrice);
  return percent >= 1 ? percent : null;
}

/**
 * The product's own spelling of a choice (a colour, a design), ignoring case
 * and spaces. Null when there is nothing to pick; undefined when the value
 * isn't one of the product's choices, or none was picked but one is needed.
 */
export function matchChoice(
  choices: readonly string[],
  value: string | null | undefined,
  { required = true }: { required?: boolean } = {},
): string | null | undefined {
  const wanted = value?.trim().toLowerCase() ?? "";
  if (wanted === "") return choices.length > 0 && required ? undefined : null;
  return choices.find((c) => c.toLowerCase() === wanted);
}

/** What a product card's add button does. */
export type CardAddAction =
  /** In stock with nothing to pick: add it straight from the card. */
  | { kind: "add"; variantId: string; unitPrice: Pesewas }
  /** The customer picks a colour (or design) on the product page. */
  | { kind: "choose" }
  | { kind: "out_of_stock" };

/** The product's stock entry and choices decide what the card's button does. */
export function cardAddAction(
  product: ProductPricing,
  variant: (VariantPricing & { id: string }) | null,
  choices: readonly string[],
): CardAddAction {
  if (!variant || !variant.in_stock) return { kind: "out_of_stock" };
  if (choices.length > 0) return { kind: "choose" };
  return { kind: "add", variantId: variant.id, unitPrice: variantPrice(product, variant) };
}
