import { z } from "zod";
import { parseCedis } from "@/lib/money";

// Form and action inputs for the Stock & POS app. The browser sends what was
// typed; these turn it into database values (pesewas, whole numbers) and
// check it. The database checks again.

const wholeNumber = (message: string, max = 100_000) =>
  z.union([z.string(), z.number()]).transform((value, ctx) => {
    const text = String(value).trim();
    if (!/^\d{1,6}$/.test(text) || Number(text) > max) {
      ctx.addIssue({ code: "custom", message });
      return z.NEVER;
    }
    return Number(text);
  });

/** "+3", "-2", "5": a change in stock, never 0. */
export const stockChangeSchema = z.string().transform((value, ctx) => {
  const text = value.trim().replace(/^[−–]/, "-");
  if (!/^[+-]?\d{1,6}$/.test(text) || Number(text) === 0 || Math.abs(Number(text)) > 100_000) {
    ctx.addIssue({ code: "custom", message: "Enter how many to add (like 3) or take away (like -2)." });
    return z.NEVER;
  }
  return Number(text);
});

const optionalText = (max: number, message = `At most ${max} characters.`) =>
  z
    .string()
    .trim()
    .max(max, message)
    .transform((v) => v || null);

const cedis = (message: string) =>
  z.string().transform((value, ctx) => {
    const pesewas = parseCedis(value);
    if (pesewas === null) {
      ctx.addIssue({ code: "custom", message });
      return z.NEVER;
    }
    return pesewas;
  });

const optionalCedis = (message: string) =>
  z.string().transform((value, ctx) => {
    if (value.trim() === "") return null;
    const pesewas = parseCedis(value);
    if (pesewas === null) {
      ctx.addIssue({ code: "custom", message });
      return z.NEVER;
    }
    return pesewas;
  });

export const recountSchema = z.object({
  variantId: z.uuid(),
  counted: wholeNumber("Enter how many are on the shelf (0 or more)."),
});

export const adjustSchema = z.object({
  variantId: z.uuid(),
  change: stockChangeSchema,
  reason: z.string().trim().min(1, "Say why the stock is changing.").max(300, "At most 300 characters."),
});

export const countLineSchema = z.object({
  countId: z.uuid(),
  variantId: z.uuid(),
  // Empty clears the line.
  counted: z.union([z.literal(""), wholeNumber("Whole number, 0 or more.")]).transform((v) => (v === "" ? null : v)),
});

const variantSchema = z.object({
  id: z.uuid().nullable(),
  label: z.string().nullable(),
  sku: optionalText(60),
  barcode: z
    .string()
    .trim()
    .refine((v) => v === "" || /^\S{1,64}$/.test(v), "A barcode has no spaces (up to 64 characters).")
    .transform((v) => v || null),
  reorderLevel: wholeNumber("Whole number, 0 or more."),
  priceOverride: optionalCedis("Price like 450 or 1250.50, or leave empty to use the product price."),
  cost: optionalCedis("Cost like 280 or 12.50, or leave empty."),
});

/** Add product (id null, one stock entry) or edit a product's stock details. */
export const posProductSchema = z
  .object({
    id: z.uuid().nullable(),
    name: z.string().trim().min(1, "Enter a product name.").max(200, "At most 200 characters."),
    price: cedis("Enter a price like 450 or 1250.50."),
    onWebsite: z.boolean(),
    categoryId: z.uuid().nullable(),
    // Only when adding: how many are on the shelf now.
    startingStock: z.union([z.literal(""), wholeNumber("Whole number, 0 or more.")]).transform((v) => (v === "" ? 0 : v)),
    variants: z.array(variantSchema).min(1).max(100),
  })
  .superRefine((p, ctx) => {
    if (p.id === null && p.variants.length !== 1) {
      ctx.addIssue({ code: "custom", path: ["variants"], message: "A new product starts with a single stock entry." });
    }
    if (p.onWebsite && p.variants.some((v) => (v.priceOverride ?? p.price) === 0)) {
      ctx.addIssue({ code: "custom", path: ["price"], message: "Enter the price before showing this product on the website." });
    }
    const codes = p.variants.map((v) => v.sku?.toLowerCase()).filter(Boolean);
    if (new Set(codes).size !== codes.length) {
      ctx.addIssue({ code: "custom", path: ["variants"], message: "Each code can only be used once." });
    }
    const barcodes = p.variants.map((v) => v.barcode).filter(Boolean);
    if (new Set(barcodes).size !== barcodes.length) {
      ctx.addIssue({ code: "custom", path: ["variants"], message: "Each barcode can only be used once." });
    }
  });

export type PosProductInput = z.input<typeof posProductSchema>;
export type PosProduct = z.output<typeof posProductSchema>;

export const staffPermissionsSchema = z.object({
  userId: z.uuid(),
  displayName: z.string().trim().max(60, "At most 60 characters."),
  isActive: z.boolean(),
  canGiveDiscounts: z.boolean(),
  canAdjustStock: z.boolean(),
});

export const newStaffSchema = z.object({
  displayName: z.string().trim().min(1, "Enter their name.").max(60, "At most 60 characters."),
  email: z.email("Enter their email address.").max(200),
  password: z.string().min(8, "At least 8 characters.").max(200),
  canGiveDiscounts: z.boolean(),
  canAdjustStock: z.boolean(),
});

/** Error messages keyed by field path, e.g. "price" or "variants.0.sku". */
export function fieldErrors(error: z.ZodError): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".");
    if (!errors[key]) errors[key] = issue.message;
  }
  return errors;
}
