/** A database error as supabase-js returns it. */
export type DbError = { code?: string; message: string; details?: string | null };

const GENERIC = "Something went wrong. Please try again.";

/**
 * A message for the person using the app. The stock functions raise plain
 * English for the cases people meet (TV001 "Only 2 left on the shelf.",
 * permission and input errors), so those pass through; anything else is generic.
 */
export function friendlyDbError(error: DbError | null | undefined, fallback = GENERIC): string {
  if (!error) return fallback;
  switch (error.code) {
    case "TV001": // would take the shelf below zero
    case "TV002": // website order status that must change in /pos
    case "42501": // not allowed
    case "22023": // bad input
    case "P0002": // gone
      return error.message;
    case "23505":
      if (/sku/i.test(error.message)) return "Another product already uses this code.";
      if (/barcode/i.test(error.message)) return "Another product already uses this barcode.";
      if (/slug/i.test(error.message)) return "Another product already has this web address.";
      return error.message.startsWith("A stock count") ? error.message : "This is already saved.";
    case "23503":
      return "This product has stock history, so it can't be deleted. Hide it from the website instead.";
    default:
      return fallback;
  }
}

/** Which form field a unique-constraint error belongs to. */
export function duplicateField(error: DbError | null | undefined): "sku" | "barcode" | null {
  if (error?.code !== "23505") return null;
  if (/sku/i.test(error.message)) return "sku";
  if (/barcode/i.test(error.message)) return "barcode";
  return null;
}
