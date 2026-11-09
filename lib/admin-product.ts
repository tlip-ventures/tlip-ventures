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

export const MAX_CHOICES = 30;
export const MAX_CHOICE_LENGTH = 60;

/**
 * "Black, Red" (commas, "|" or one per line) → ["Black", "Red"]: trimmed,
 * empty ones dropped, and a repeat (ignoring case) kept once.
 */
export function parseChoices(text: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of text.split(/[,|\n]/)) {
    const choice = raw.trim().replace(/\s+/g, " ");
    if (!choice || seen.has(choice.toLowerCase())) continue;
    seen.add(choice.toLowerCase());
    out.push(choice);
  }
  return out;
}

/** Choices typed as text, checked: at most 30, each at most 60 characters. */
export const choicesSchema = z.string().max(5000, "Too long.").transform((text, ctx) => {
  const choices = parseChoices(text);
  if (choices.length > MAX_CHOICES) ctx.addIssue({ code: "custom", message: `At most ${MAX_CHOICES} choices.` });
  const long = choices.find((c) => c.length > MAX_CHOICE_LENGTH);
  if (long) ctx.addIssue({ code: "custom", message: `“${long.slice(0, 20)}…” is too long (${MAX_CHOICE_LENGTH} characters at most).` });
  return choices;
});

const stockQty = z.string().transform((value, ctx) => {
  if (value.trim() === "") return null;
  if (!/^\d{1,6}$/.test(value.trim())) {
    ctx.addIssue({ code: "custom", message: "Whole number, or leave empty." });
    return z.NEVER;
  }
  return Number(value.trim());
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
    /** What the customer picks, e.g. "Colour"; empty when there is nothing to pick. */
    choiceName: optionalText(40),
    /** The colours (or designs) to pick from. Not stocked separately: the product has one stock number. */
    choices: choicesSchema,
    sku: optionalText(60),
    inStock: z.boolean(),
    stockQty,
    categoryIds: z.array(z.uuid()).max(20),
    images: z
      .array(z.object({ url: imageUrl, publicId: optionalText(300), alt: optionalText(200) }))
      .max(20, "At most 20 photos."),
  })
  .superRefine((p, ctx) => {
    // Products can be saved hidden at 0 while their price is being decided, but never shown for free.
    if (p.isActive && p.price === 0) {
      ctx.addIssue({ code: "custom", path: ["price"], message: "Enter the price before showing this product in the shop." });
    }
    if (p.compareAtPrice !== null && p.compareAtPrice <= p.price) {
      ctx.addIssue({ code: "custom", path: ["compareAtPrice"], message: "The “was” price must be higher than the price." });
    }
    if (p.choiceName && p.choices.length === 0) {
      ctx.addIssue({ code: "custom", path: ["choices"], message: `List the ${p.choiceName.toLowerCase()}s, separated by commas.` });
    }
  })
  // No heading, nothing to pick.
  .transform((p) => (p.choiceName ? p : { ...p, choices: [] }));

export type ProductFormInput = z.input<typeof productFormSchema>;
export type ProductForm = z.output<typeof productFormSchema>;

/** Error messages keyed by field path, e.g. "price" or "choices". */
export function formErrors(error: z.ZodError): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".");
    if (!errors[key]) errors[key] = issue.message;
  }
  return errors;
}
