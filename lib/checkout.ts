import { z } from "zod";
import { normaliseGhanaPhone } from "@/lib/phone";

export const MAX_LINE_QTY = 99;
export const MAX_CART_LINES = 50;
/** Orders allowed from one phone number per hour, to stop floods of fake orders. */
export const MAX_ORDERS_PER_PHONE_PER_HOUR = 5;

export const cartItemSchema = z.object({
  variantId: z.uuid(),
  qty: z.number().int().min(1).max(MAX_LINE_QTY),
});

/**
 * What the browser sends at checkout. Only variant ids and quantities:
 * prices always come from the database (CLAUDE.md domain rule 2).
 */
export const checkoutSchema = z.object({
  customerName: z
    .string()
    .trim()
    .min(1, "Enter your name.")
    .max(100, "Name is too long (100 characters at most)."),
  phone: z
    .string()
    .transform((value, ctx) => {
      const phone = normaliseGhanaPhone(value);
      if (!phone) {
        ctx.addIssue({ code: "custom", message: "Enter a Ghanaian number, for example 024 123 4567." });
        return z.NEVER;
      }
      return phone;
    }),
  /** Where the customer is (area and a landmark), so the shop can arrange delivery on WhatsApp. */
  location: z
    .string()
    .trim()
    .min(2, "Enter your location, for example Dansoman, near Sharp Curve.")
    .max(200, "Location is too long (200 characters at most)."),
  notes: z
    .string()
    .trim()
    .max(500, "Note is too long (500 characters at most).")
    .transform((v) => v || null),
  /** Honeypot: hidden from people, so only bots fill it in. */
  website: z.string().max(500).optional().default(""),
  items: z
    .array(cartItemSchema)
    .min(1, "Your cart is empty.")
    .max(MAX_CART_LINES, `At most ${MAX_CART_LINES} different items per order.`)
    .transform(mergeItems),
});

export type CheckoutInput = z.input<typeof checkoutSchema>;
export type Checkout = z.output<typeof checkoutSchema>;
export type CheckoutField = "customerName" | "phone" | "location" | "notes";

/** Combines repeated variants into one line, capping the quantity. */
function mergeItems(items: z.output<typeof cartItemSchema>[]) {
  const merged = new Map<string, number>();
  for (const { variantId, qty } of items) {
    merged.set(variantId, Math.min(MAX_LINE_QTY, (merged.get(variantId) ?? 0) + qty));
  }
  return [...merged].map(([variantId, qty]) => ({ variantId, qty }));
}

/** First error message per form field, for showing under each input. */
export function fieldErrors(error: z.ZodError): Partial<Record<CheckoutField | "items", string>> {
  const errors: Partial<Record<CheckoutField | "items", string>> = {};
  for (const issue of error.issues) {
    const field = issue.path[0];
    if (
      (field === "customerName" || field === "phone" || field === "location" || field === "notes" || field === "items") &&
      !errors[field]
    ) {
      errors[field] = issue.message;
    }
  }
  return errors;
}
