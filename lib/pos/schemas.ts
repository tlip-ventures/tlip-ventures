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

/** What the till sends to save a sale. Prices are not sent: the database works them out. */
export const completeSaleSchema = z
  .object({
    items: z
      .array(z.object({ variantId: z.uuid(), qty: z.number().int().min(1).max(999) }))
      .min(1, "The basket is empty.")
      .max(200, "At most 200 lines in one sale."),
    customerId: z.uuid().nullable(),
    discount: z.number().int().min(0).max(100_000_000),
    method: z.enum(["cash", "momo", "bank", "later"]),
    // Cash only, in pesewas; null means the exact amount.
    cashReceived: z.number().int().min(0).max(100_000_000).nullable(),
  })
  .superRefine((s, ctx) => {
    if (s.method === "later" && !s.customerId) {
      ctx.addIssue({ code: "custom", path: ["customerId"], message: "Choose the customer who will pay later." });
    }
  });

export type CompleteSaleInput = z.input<typeof completeSaleSchema>;

export const newCustomerSchema = z.object({
  name: z.string().trim().min(1, "Enter the customer's name.").max(100, "At most 100 characters."),
  // Optional; checked and stored as 233XXXXXXXXX by the action.
  phone: z.string().trim().max(30),
});

/** "Mark paid", "Record payment" and "Record refund". */
export const paymentSchema = z.object({
  kind: z.enum(["sale", "purchase", "refund"]),
  id: z.uuid(),
  method: z.enum(["cash", "momo", "bank"], { message: "Choose how the money was paid." }),
  amount: cedis("Enter the amount like 450 or 1250.50.").refine((v) => v > 0, "Enter the amount paid."),
  note: z.string().trim().max(300, "At most 300 characters."),
});

export const voidSaleSchema = z.object({
  saleId: z.uuid(),
  reason: z.string().trim().min(1, "Say why the sale is cancelled.").max(300, "At most 300 characters."),
});

/** "Mark as paid" on a website order: paid in full; cash received only for change. */
export const markOrderPaidSchema = z.object({
  saleId: z.uuid(),
  method: z.enum(["cash", "momo", "bank"], { message: "Choose how the customer paid." }),
  cashReceived: optionalCedis("Cash like 500 or 1250.50, or leave it empty."),
});

/** What the purchase form sends. Costs are typed in cedis. */
export const purchaseSchema = z
  .object({
    supplierId: z.uuid({ message: "Choose the supplier." }),
    received: z.boolean(),
    note: z.string().trim().max(300, "At most 300 characters."),
    lines: z
      .array(
        z.object({
          variantId: z.uuid(),
          qty: z.union([z.string(), z.number()]).transform((v, ctx) => {
            const text = String(v).trim();
            if (!/^\d{1,6}$/.test(text) || Number(text) < 1 || Number(text) > 100_000) {
              ctx.addIssue({ code: "custom", message: "Quantity from 1." });
              return z.NEVER;
            }
            return Number(text);
          }),
          unitCost: cedis("Cost like 280 or 12.50."),
        }),
      )
      .min(1, "Add at least one item.")
      .max(200, "At most 200 items on one purchase."),
    paidNow: optionalCedis("Amount like 450 or 1250.50, or leave empty."),
    method: z.enum(["cash", "momo", "bank"]),
  })
  .superRefine((p, ctx) => {
    const total = p.lines.reduce((n, l) => n + l.qty * l.unitCost, 0);
    if (p.paidNow !== null && p.paidNow > total) {
      ctx.addIssue({ code: "custom", path: ["paidNow"], message: "That is more than the purchase." });
    }
  });

export type PurchaseInput = z.input<typeof purchaseSchema>;

/** What the return form sends. */
export const returnSchema = z.object({
  saleId: z.uuid().nullable(),
  customerId: z.uuid().nullable(),
  note: z.string().trim().max(300, "At most 300 characters."),
  lines: z
    .array(
      z.object({
        saleItemId: z.uuid().nullable(),
        variantId: z.uuid().nullable(),
        qty: z.number().int().min(1).max(999),
        backOnShelf: z.boolean(),
      }),
    )
    .min(1, "Choose what is being returned."),
  refundTotal: cedis("Refund like 450 or 12.50, or 0."),
  refundNow: z.boolean(),
  method: z.enum(["cash", "momo", "bank"]),
});

export type ReturnInput = z.input<typeof returnSchema>;

// ---------------------------------------------------------------------------
// Data import: rows already read and checked in the browser (lib/pos/import),
// checked again here before they reach the database. Money in pesewas.
// ---------------------------------------------------------------------------

const pesewas = z.number().int().min(0).max(1_000_000_000);
const rowNumber = z.number().int().min(1).max(1_000_000);
const shortText = (max: number) => z.string().trim().min(1).max(max);
const ghanaPhone = z.string().regex(/^233[235]\d{8}$/);

export const importProductRowSchema = z.object({
  row: rowNumber,
  name: shortText(200),
  slug: z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/).max(80),
  sku: shortText(60).nullable(),
  barcode: z.string().regex(/^\S{1,64}$/).nullable(),
  category: shortText(80).nullable(),
  price: pesewas,
  cost: pesewas.nullable(),
  qty: z.number().int().min(-100_000).max(100_000).nullable(),
  reorder: z.number().int().min(0).max(100_000).nullable(),
});

export const importPersonRowSchema = z.object({ row: rowNumber, name: shortText(100), phone: ghanaPhone.nullable() });

export const importRecordRowSchema = z.object({
  row: rowNumber,
  code: shortText(40),
  date: z.iso.datetime(),
  party: shortText(100).nullable(),
  phone: ghanaPhone.nullable(),
  total: pesewas,
  paid: pesewas,
  method: z.enum(["cash", "momo", "bank"]),
  lines: z
    .array(z.object({ name: shortText(200), qty: z.number().int().min(1).max(100_000), unitPrice: pesewas, unitCost: pesewas.nullable() }))
    .max(500),
});

export const importBatchSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("products"),
    apply: z.boolean(),
    updatePrices: z.boolean(),
    setStock: z.boolean(),
    rows: z.array(importProductRowSchema).min(1).max(400),
  }),
  z.object({ kind: z.enum(["customers", "suppliers"]), apply: z.boolean(), rows: z.array(importPersonRowSchema).min(1).max(400) }),
  z.object({ kind: z.enum(["sales", "purchases"]), apply: z.boolean(), rows: z.array(importRecordRowSchema).min(1).max(200) }),
]);

export type ImportBatch = z.input<typeof importBatchSchema>;
