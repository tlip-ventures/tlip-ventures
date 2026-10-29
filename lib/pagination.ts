/** Product listings show 24 products per page (CLAUDE.md "Catalogue"). */
export const PAGE_SIZE = 24;

/** Zero-based, inclusive row range for a 1-based page, as Supabase's `.range()` expects. */
export function pageRange(page: number, pageSize: number = PAGE_SIZE): { from: number; to: number } {
  if (!Number.isSafeInteger(page) || page < 1) {
    throw new RangeError(`Page must be a whole number from 1, got ${page}`);
  }
  const from = (page - 1) * pageSize;
  return { from, to: from + pageSize - 1 };
}

/** Number of pages needed for `total` items. Always at least 1, so "page 1 of 1" works for empty lists. */
export function pageCount(total: number, pageSize: number = PAGE_SIZE): number {
  return Math.max(1, Math.ceil(total / pageSize));
}
