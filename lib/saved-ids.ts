// Lists of product ids kept in the browser: the wishlist and recently viewed
// products. Newest first, no repeats, capped so localStorage stays small.

/** Most products a wishlist keeps. */
export const MAX_WISHLIST = 100;
/** Recently viewed products remembered (CLAUDE.md redesign: last 12). */
export const MAX_RECENT = 12;

/** Saves the id at the front, or removes it if already saved. Full lists drop the oldest. */
export function toggleId(ids: readonly string[], id: string, max = MAX_WISHLIST): string[] {
  if (ids.includes(id)) return ids.filter((x) => x !== id);
  return [id, ...ids].slice(0, max);
}

/** Moves the id to the front (adding it if new), keeping at most `max`. */
export function recordId(ids: readonly string[], id: string, max = MAX_RECENT): string[] {
  return [id, ...ids.filter((x) => x !== id)].slice(0, max);
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Cleans a list read back from storage: product ids only, no repeats, at most `max`. */
export function cleanIds(value: unknown, max: number): string[] {
  if (!Array.isArray(value)) return [];
  const ids = value.filter((v): v is string => typeof v === "string" && UUID.test(v));
  return [...new Set(ids)].slice(0, max);
}
