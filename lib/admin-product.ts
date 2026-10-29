import { z } from "zod";
import { slugSchema } from "@/lib/listing";
import { parseCedis } from "@/lib/money";

/** Optional text: trimmed, and empty becomes null. */
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `At most ${max} characters.`)
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

const variantSchema = z.object({
  id: z.uuid().nullable(),
  option1Value: optionalText(60),
  option2Value: optionalText(60),
  sku: optionalText(60),
  inStock: z.boolean(),
  stockQty: z.string().transform((value, ctx) => {
    if (value.trim() === "") return null;
    if (!/^\d{1,6}$/.test(value.trim())) {
      ctx.addIssue({ code: "custom", message: "Whole number, or leave empty." });
      return z.NEVER;
    }
    return Number(value.trim());
  }),
  priceOverride: optionalCedis("Price like 450 or 1250.50, or leave empty to use the product price."),
});

// Images must come from Cloudinary (CLAUDE.md); local paths are allowed for demo data.
const imageUrl = z
  .string()
  .refine((url) => url.startsWith("https://res.cloudinary.com/") || /^\/[\w./-]+$/.test(url), "Images must be uploaded to Cloudinary.");

/**
 * The product editor's data. The browser sends what was typed (prices as cedi
 * text); this turns it into database values in pesewas and checks the
 * catalogue rules.
 */
export const productFormSchema = z
  .object({
    id: z.uuid().nullable(),
    name: z.string().trim().min(1, "Enter a product name.").max(200, "At most 200 characters."),
    slug: z.string().trim().pipe(slugSchema.or(z.literal(""))).refine((s) => s !== "", "Enter a web address name, e.g. blender-1-5l."),
    brand: optionalText(80),
    description: optionalText(5000),
    price: cedis("Enter a price like 450 or 1250.50."),
    compareAtPrice: optionalCedis("Price like 450 or 1250.50, or leave empty."),
    isActive: z.boolean(),
    isFeatured: z.boolean(),
    option1Name: optionalText(40),
    option2Name: optionalText(40),
    variants: z.array(variantSchema).min(1, "Add at least one option.").max(100, "At most 100 options."),
    categoryIds: z.array(z.uuid()).max(20),
    images: z
      .array(z.object({ url: imageUrl, publicId: optionalText(300), alt: optionalText(200) }))
      .max(20, "At most 20 photos."),
  })
  .superRefine((p, ctx) => {
    // Products can be saved hidden at 0 while their price is being decided, but never shown for free.
    if (p.isActive && p.variants.some((v) => (v.priceOverride ?? p.price) === 0)) {
      ctx.addIssue({ code: "custom", path: ["price"], message: "Enter the price before showing this product in the shop." });
    }
    if (p.compareAtPrice !== null && p.compareAtPrice <= p.price) {
      ctx.addIssue({ code: "custom", path: ["compareAtPrice"], message: "The “was” price must be higher than the price." });
    }
    if (p.option2Name && !p.option1Name) {
      ctx.addIssue({ code: "custom", path: ["option1Name"], message: "Fill in the first option name before the second." });
    }
    if (!p.option1Name) {
      // A product with no options has exactly one variant with no option values.
      if (p.variants.length !== 1) {
        ctx.addIssue({ code: "custom", path: ["variants"], message: "A product without options has a single stock entry." });
      }
      return;
    }
    const seen = new Set<string>();
    p.variants.forEach((v, i) => {
      if (!v.option1Value) {
        ctx.addIssue({ code: "custom", path: ["variants", i, "option1Value"], message: `Enter the ${p.option1Name}.` });
      }
      if (p.option2Name && !v.option2Value) {
        ctx.addIssue({ code: "custom", path: ["variants", i, "option2Value"], message: `Enter the ${p.option2Name}.` });
      }
      const key = `${v.option1Value?.toLowerCase()}|${p.option2Name ? v.option2Value?.toLowerCase() : ""}`;
      if (seen.has(key)) {
        ctx.addIssue({ code: "custom", path: ["variants", i, "option1Value"], message: "This option is listed twice." });
      }
      seen.add(key);
    });
    const skus = p.variants.map((v) => v.sku).filter(Boolean);
    if (new Set(skus).size !== skus.length) {
      ctx.addIssue({ code: "custom", path: ["variants"], message: "Each SKU can only be used once." });
    }
  })
  .transform((p) => ({
    ...p,
    // Without options, the single variant has no option values (and no second option without a first).
    option2Name: p.option1Name ? p.option2Name : null,
    variants: p.variants.map((v) => ({
      ...v,
      option1Value: p.option1Name ? v.option1Value : null,
      option2Value: p.option1Name && p.option2Name ? v.option2Value : null,
    })),
  }));

export type ProductFormInput = z.input<typeof productFormSchema>;
export type ProductForm = z.output<typeof productFormSchema>;

/** Error messages keyed by field path, e.g. "price" or "variants.2.option1Value". */
export function formErrors(error: z.ZodError): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".");
    if (!errors[key]) errors[key] = issue.message;
  }
  return errors;
}
