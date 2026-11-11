import { z } from "zod";
import { parseCedis } from "@/lib/money";
import { choicesSchema } from "@/lib/admin-product";

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

/** A place stock is kept in (1 = the shop). Left out: the shop. */
const placeIdSchema = z.coerce.number().int("Choose the place.").min(1, "Choose the place.").max(32767, "Choose the place.");

export const recountSchema = z.object({
  variantId: z.uuid(),
  counted: wholeNumber("Enter how many are on the shelf (0 or more)."),
  placeId: placeIdSchema.optional(),
});

export const adjustSchema = z.object({
  variantId: z.uuid(),
  change: stockChangeSchema,
  reason: z.string().trim().min(1, "Say why the stock is changing.").max(300, "At most 300 characters."),
  placeId: placeIdSchema.optional(),
});

/** Move stock from one place to another (the warehouse to the shop, or back). */
export const moveStockSchema = z
  .object({
    variantId: z.uuid(),
    from: placeIdSchema,
    to: placeIdSchema,
    qty: wholeNumber("Enter how many to move (1 or more).").refine((n) => n >= 1, "Enter how many to move (1 or more)."),
    note: z.string().trim().max(200, "At most 200 characters.").optional(),
  })
  .refine((m) => m.from !== m.to, { message: "Choose two different places.", path: ["to"] });

export const countLineSchema = z.object({
  countId: z.uuid(),
  variantId: z.uuid(),
  // Empty clears the line.
  counted: z.union([z.literal(""), wholeNumber("Whole number, 0 or more.")]).transform((v) => (v === "" ? null : v)),
});

/**
 * Add product (id null) or edit a product's stock details. One stock entry per
 * product; colours (or designs) are only choices, typed as a list.
 */
export const posProductSchema = z
  .object({
    id: z.uuid().nullable(),
    name: z.string().trim().min(1, "Enter a product name.").max(200, "At most 200 characters."),
    price: cedis("Enter a price like 450 or 1250.50."),
    onWebsite: z.boolean(),
    categoryId: z.uuid().nullable(),
    // Only when adding: how many are on the shelf now.
    startingStock: z.union([z.literal(""), wholeNumber("Whole number, 0 or more.")]).transform((v) => (v === "" ? 0 : v)),
    /** "Colour" or "Design"; empty means Colour when there are choices. */
    choiceName: optionalText(40),
    choices: choicesSchema,
    sku: optionalText(60),
    barcode: z
      .string()
      .trim()
      .refine((v) => v === "" || /^\S{1,64}$/.test(v), "A barcode has no spaces (up to 64 characters).")
      .transform((v) => v || null),
    reorderLevel: wholeNumber("Whole number, 0 or more."),
    cost: optionalCedis("Cost like 280 or 12.50, or leave empty."),
  })
  .superRefine((p, ctx) => {
    if (p.onWebsite && p.price === 0) {
      ctx.addIssue({ code: "custom", path: ["price"], message: "Enter the price before showing this product on the website." });
    }
  })
  .transform((p) => ({ ...p, choiceName: p.choices.length > 0 ? (p.choiceName ?? "Colour") : null }));

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

/** A delivery typed at the till. Fee in pesewas; phone as typed (checked by the action). */
const deliveryInputSchema = z.object({
  fee: z.number().int().min(0, "Enter the delivery fee, or 0.").max(10_000_000, "That delivery fee is too high."),
  address: z.string().trim().min(1, "Enter where to deliver: the area and a landmark.").max(300, "At most 300 characters."),
  phone: z.string().trim().max(30),
  note: z.string().trim().max(300, "At most 300 characters."),
  // The fee is already in the price agreed: the total stays and the fee is part of it.
  included: z.boolean().default(false),
});

/** A basket line: the item, how many, and the colour picked (checked against the product by the database). */
const basketItemSchema = z.object({
  variantId: z.uuid(),
  qty: z.number().int().min(1).max(999),
  choice: z
    .string()
    .trim()
    .max(60)
    .nullish()
    .transform((v) => v || null),
});

/** What the till sends to save a sale. Prices are not sent: the database works them out. */
export const completeSaleSchema = z
  .object({
    items: z
      .array(basketItemSchema)
      .min(1, "The basket is empty.")
      .max(200, "At most 200 lines in one sale."),
    customerId: z.uuid().nullable(),
    discount: z.number().int().min(0).max(100_000_000),
    method: z.enum(["cash", "momo", "bank", "later", "split"]),
    // Cash (or the cash part of a split), in pesewas; null means the exact amount.
    cashReceived: z.number().int().min(0).max(100_000_000).nullable(),
    // Split only: how much each way (e.g. part Mobile Money, the rest cash). The database checks the sum.
    payments: z
      .array(z.object({ method: z.enum(["cash", "momo", "bank"]), amount: z.number().int().min(1).max(100_000_000) }))
      .min(1)
      .max(3)
      .nullable()
      .optional(),
    // null: the customer takes the goods. Fee in pesewas; phone as typed (checked by the action).
    delivery: deliveryInputSchema.nullable(),
    // The invoice this sale sells, if any: marked sold once the sale is saved.
    invoiceId: z.uuid().nullable().optional(),
    // Wholesale: items with a wholesale price are sold at it (the database checks who may).
    wholesale: z.boolean().default(false),
  })
  .superRefine((s, ctx) => {
    if (s.method === "later" && !s.customerId) {
      ctx.addIssue({ code: "custom", path: ["customerId"], message: "Choose the customer who will pay later." });
    }
    if (s.method === "split" && !s.payments?.length) {
      ctx.addIssue({ code: "custom", path: ["payments"], message: "Say how much is paid each way." });
    }
  });

export type CompleteSaleInput = z.input<typeof completeSaleSchema>;

/**
 * "Put on hold" at the till: the basket for a customer with what they pay now
 * (any mix of MoMo, cash and bank, or nothing); the rest is owed. The
 * database refuses it when that pays it all.
 */
export const holdSaleSchema = z.object({
  items: z
    .array(basketItemSchema)
    .min(1, "The basket is empty.")
    .max(200, "At most 200 lines in one sale."),
  customerId: z.uuid({ message: "Choose the customer the sale is held for." }),
  discount: z.number().int().min(0).max(100_000_000),
  payments: z.array(z.object({ method: z.enum(["cash", "momo", "bank"]), amount: z.number().int().min(1).max(100_000_000) })).max(3),
  // The cash handed over for the cash part (for change); null: exact.
  cashReceived: z.number().int().min(0).max(100_000_000).nullable(),
  delivery: deliveryInputSchema.nullable(),
  invoiceId: z.uuid().nullable().optional(),
  wholesale: z.boolean().default(false),
});

export type HoldSaleInput = z.input<typeof holdSaleSchema>;

/** "Reserve for later" at the till: like a held sale, but paid in full is fine, with an optional date. */
export const reserveSaleSchema = holdSaleSchema.extend({
  customerId: z.uuid({ message: "Choose the customer the order is kept for." }),
  // The agreed pickup or delivery date (Ghana date, "2026-11-14"); null: none agreed.
  reservedUntil: z.iso.date("Pick the date, or leave it empty.").nullable(),
});

export type ReserveSaleInput = z.input<typeof reserveSaleSchema>;

/** "Make invoice" at the till: the basket, priced by the database, nothing taken off the shelf. */
export const createInvoiceSchema = z.object({
  items: z
    .array(basketItemSchema)
    .min(1, "The basket is empty.")
    .max(200, "At most 200 lines in one invoice."),
  customerId: z.uuid().nullable(),
  discount: z.number().int().min(0).max(100_000_000),
  delivery: deliveryInputSchema.nullable(),
  validUntil: z.iso.date("Choose the date the prices hold until."),
  wholesale: z.boolean().default(false),
});

export type CreateInvoiceInput = z.input<typeof createInvoiceSchema>;

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
  // Sales with a delivery fee still owed: how much of the amount is for delivery
  // (null when the box isn't on the form). The database checks it against what is owed.
  deliveryAmount: z
    .union([z.null(), z.literal("").transform(() => 0), cedis("Enter the part for delivery like 30, or 0.")])
    .default(null),
}).refine((p) => p.deliveryAmount === null || p.deliveryAmount <= p.amount, {
  path: ["deliveryAmount"],
  message: "The part for delivery can't be more than the amount paid.",
});

export const voidSaleSchema = z.object({
  saleId: z.uuid(),
  reason: z.string().trim().min(1, "Say why the sale is cancelled.").max(300, "At most 300 characters."),
});

/**
 * "Mark as paid" on a website order: what the customer paid each way (any
 * mix; less than the total puts the order On hold); cash received only for change.
 */
export const markOrderPaidSchema = z.object({
  saleId: z.uuid(),
  momo: optionalCedis("Enter the MoMo amount like 200, or leave it empty."),
  cash: optionalCedis("Enter the cash amount like 200, or leave it empty."),
  bank: optionalCedis("Enter the bank amount like 200, or leave it empty."),
  cashReceived: optionalCedis("Cash like 500 or 1250.50, or leave it empty."),
  // Ticked: the shop delivers it, for the fee agreed in WhatsApp; no address: the order's location.
  deliver: z.boolean(),
  deliveryFee: optionalCedis("Delivery fee like 30, or leave it empty."),
  deliveryAddress: z.string().trim().max(300, "At most 300 characters."),
  // Ticked: the fee is already in what the customer paid, not added on top.
  deliveryIncluded: z.boolean(),
});

/** What the purchase form sends. Costs are typed in cedis. */
export const purchaseSchema = z
  .object({
    supplierId: z.uuid({ message: "Choose the supplier." }),
    received: z.boolean(),
    /** Where the delivery arrives: the warehouse unless the owner picks the shop. */
    placeId: placeIdSchema,
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

/** A distance typed in km, to one decimal: "12.5". */
const km = (message: string) =>
  z.union([z.string(), z.number()]).transform((value, ctx) => {
    const text = String(value).trim();
    if (!/^\d{1,3}(\.\d)?$/.test(text)) {
      ctx.addIssue({ code: "custom", message });
      return z.NEVER;
    }
    return Number(text);
  });

/** What was typed in the till's "search the map" box: a place, a map link or a position. */
export const placeSearchSchema = z
  .string()
  .trim()
  .min(2, "Type at least 2 letters of the area or landmark.")
  .max(500, "That is too long to search.");

/** A place found on the map at the till, added to the price list. */
export const newDeliveryAreaSchema = z
  .object({
    name: z.string().trim().min(1, "Give the area a name.").max(80, "At most 80 characters."),
    km: km("Enter the distance in km, like 12.5."),
    lat: z.number().min(-90).max(90).nullable(),
    lng: z.number().min(-180).max(180).nullable(),
  })
  .refine((a) => (a.lat === null) === (a.lng === null), { message: "That position on the map is not valid." });

/** Owner: an area on the price list renamed, re-measured or taken off. */
export const deliveryAreaUpdateSchema = z.object({
  id: z.uuid(),
  name: z.string().trim().min(1, "Give the area a name.").max(80, "At most 80 characters."),
  km: km("Enter the distance in km, like 12.5."),
  isActive: z.boolean(),
  // Empty: the formula prices it.
  fixedFee: optionalCedis("Enter the area's price like 50, or leave it empty to use the formula."),
});

/** Owner: the delivery price formula, typed in cedis and km. */
export const deliveryPricingSchema = z.object({
  baseFee: cedis("Enter the base fee like 20."),
  baseKm: km("Enter the km the base fee covers, like 3."),
  midRate: cedis("Enter the price per km like 3 or 2.50."),
  midEndKm: km("Enter where the middle band ends in km, like 10."),
  farRate: cedis("Enter the price per km like 1.50."),
  roundTo: cedis("Enter what to round up to, like 5.").refine((v) => v >= 1, "Round up to at least GH₵ 0.01."),
  closeKm: km("Enter the very-close distance in km, like 1."),
  closeFee: cedis("Enter the very-close fee like 10."),
  maxKm: km("Enter the furthest distance in km, like 65."),
  shopLocation: z.string().trim().max(500, "That is too long."),
});

/**
 * Owner: delivery discounts by order size, as typed: each level an order
 * amount and either an amount off the fee or free delivery. Empty rows are
 * dropped; levels come out lowest first.
 */
export const deliveryDiscountsSchema = z
  .array(
    z.object({
      from: z.string(),
      off: z.string(),
      free: z.boolean(),
    }),
  )
  .transform((rows, ctx) => {
    const levels: { from: number; off: number | null }[] = [];
    for (const r of rows) {
      if (r.from.trim() === "" && r.off.trim() === "" && !r.free) continue;
      const from = parseCedis(r.from);
      if (from === null) {
        ctx.addIssue({ code: "custom", message: "Enter each order amount like 1000." });
        return z.NEVER;
      }
      if (r.free) {
        levels.push({ from, off: null });
        continue;
      }
      const off = parseCedis(r.off);
      if (off === null || off <= 0) {
        ctx.addIssue({ code: "custom", message: "Enter how much comes off delivery, like 20, or tick Free delivery." });
        return z.NEVER;
      }
      levels.push({ from, off });
    }
    if (levels.length > 5) {
      ctx.addIssue({ code: "custom", message: "At most 5 discount levels." });
      return z.NEVER;
    }
    if (new Set(levels.map((l) => l.from)).size !== levels.length) {
      ctx.addIssue({ code: "custom", message: "Two levels have the same order amount." });
      return z.NEVER;
    }
    return levels.sort((a, b) => a.from - b.from);
  });
