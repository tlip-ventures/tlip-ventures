import { z } from "zod";

export const SORTS = {
  newest: "Newest",
  "price-asc": "Price: low to high",
  "price-desc": "Price: high to low",
} as const;

export type Sort = keyof typeof SORTS;

const first = (v: unknown) => (Array.isArray(v) ? v[0] : v);

/** Whole cedis for the price filter; anything else means "no limit". */
const cedisParam = z.preprocess(first, z.coerce.number().int().min(0).max(1_000_000).nullable()).catch(null);

// Bad or missing values fall back to defaults, so a mangled link still shows a page.
const listingParamsSchema = z.object({
  page: z.preprocess(first, z.coerce.number().int().min(1).max(10_000)).catch(1),
  sort: z.preprocess(first, z.enum(Object.keys(SORTS) as [Sort, ...Sort[]])).catch("newest"),
  q: z.preprocess(first, z.string().trim().max(100)).catch(""),
  /** Price filter in whole cedis: products from `min` (inclusive) up to `max` (exclusive). */
  min: cedisParam.default(null),
  max: cedisParam.default(null),
});

export type ListingParams = z.infer<typeof listingParamsSchema>;

/** Reads page, sort, search text and price filter from a page's searchParams. */
export function parseListingParams(searchParams: Record<string, string | string[] | undefined>): ListingParams {
  const params = listingParamsSchema.parse(searchParams);
  // A range that can't match anything ("min 300, max 100") is dropped rather than showing nothing.
  if (params.min !== null && params.max !== null && params.min >= params.max) return { ...params, min: null, max: null };
  // "min=0" is no limit.
  if (params.min === 0) return { ...params, min: null };
  return params;
}

/** Builds "?q=…&min=…&max=…&sort=…&page=…" for listing links, leaving out defaults. */
export function listingQuery(params: Partial<ListingParams>): string {
  const query = new URLSearchParams();
  if (params.q) query.set("q", params.q);
  if (params.min != null) query.set("min", String(params.min));
  if (params.max != null) query.set("max", String(params.max));
  if (params.sort && params.sort !== "newest") query.set("sort", params.sort);
  if (params.page && params.page > 1) query.set("page", String(params.page));
  const s = query.toString();
  return s ? `?${s}` : "";
}

/** Product and category slugs, as the database allows them. */
export const slugSchema = z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/).max(200);

/** "Shop by price" chips on the home page, in whole cedis. */
export const PRICE_RANGES: readonly { label: string; min: number | null; max: number | null }[] = [
  { label: "Under GH₵ 100", min: null, max: 100 },
  { label: "GH₵ 100 – 300", min: 100, max: 300 },
  { label: "GH₵ 300 – 1,000", min: 300, max: 1000 },
  { label: "Over GH₵ 1,000", min: 1000, max: null },
];

const cedis = (n: number) => `GH₵ ${n.toLocaleString("en-US")}`;

/** Describes an active price filter, e.g. "GH₵ 100 – 300"; null when there is none. */
export function priceFilterLabel(min: number | null, max: number | null): string | null {
  const range = PRICE_RANGES.find((r) => r.min === min && r.max === max);
  if (range) return range.label;
  if (min !== null && max !== null) return `${cedis(min)} – ${cedis(max)}`;
  if (max !== null) return `Under ${cedis(max)}`;
  if (min !== null) return `${cedis(min)} and over`;
  return null;
}

/** The price filter as listProducts() takes it: pesewas, or null for no limit. */
export function priceFilter(params: Pick<ListingParams, "min" | "max">): { minPrice: number | null; maxPrice: number | null } {
  return {
    minPrice: params.min === null ? null : params.min * 100,
    maxPrice: params.max === null ? null : params.max * 100,
  };
}
