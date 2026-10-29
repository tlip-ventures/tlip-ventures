const MAX_TERMS = 8;

/**
 * Turns what a shopper typed into a Postgres tsquery that matches every word
 * as a prefix, so "blend" finds "Blender" and "foldable stool" finds
 * "Foldable Storage Stool". Only letters and digits are kept, so the
 * result is always valid tsquery syntax. Returns null when nothing is left.
 */
export function toPrefixTsQuery(input: string): string | null {
  const terms = input.toLowerCase().match(/[\p{L}\p{N}]+/gu);
  if (!terms) return null;
  const unique = [...new Set(terms)].slice(0, MAX_TERMS);
  return unique.map((term) => `${term}:*`).join(" & ");
}
