import { z } from "zod";
import { slugSchema } from "@/lib/listing";
import { normaliseGhanaPhone } from "@/lib/phone";

const text = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `At most ${max} characters.`)
    .transform((v) => v || null);

export const SOCIAL_NETWORKS = ["facebook", "instagram", "tiktok", "youtube", "x"] as const;
export type SocialNetwork = (typeof SOCIAL_NETWORKS)[number];

export const SOCIAL_LABELS: Record<SocialNetwork, string> = {
  facebook: "Facebook",
  instagram: "Instagram",
  tiktok: "TikTok",
  youtube: "YouTube",
  x: "X (Twitter)",
};

/** Display name for a key in settings.social_links. */
export function socialLabel(network: string): string {
  return SOCIAL_LABELS[network as SocialNetwork] ?? network;
}

const socialUrl = z
  .string()
  .trim()
  .max(300)
  .refine((v) => v === "" || /^https:\/\/[^\s]+$/.test(v), "Use a full link starting with https://")
  .transform((v) => v || null);

const replyTime = z
  .string()
  .trim()
  .refine((v) => v === "" || /^([01]\d|2[0-3]):[0-5]\d$/.test(v), "Use a time like 07:00 or 19:30.")
  .transform((v) => v || null);

/** The settings form: shop details shown on the site and the WhatsApp number orders go to. */
export const settingsSchema = z
  .object({
    storeName: z.string().trim().min(1, "Enter the shop name.").max(80),
    whatsappNumber: z.string().transform((value, ctx) => {
      const phone = normaliseGhanaPhone(value);
      if (!phone) {
        ctx.addIssue({ code: "custom", message: "Enter a Ghanaian WhatsApp number, e.g. 024 123 4567." });
        return z.NEVER;
      }
      return phone;
    }),
    tagline: text(120),
    shopAddress: text(300),
    openingHours: text(300),
    announcement: text(200),
    contactEmail: z
      .string()
      .trim()
      .max(254)
      .refine((v) => v === "" || z.email().safeParse(v).success, "Enter an email address, e.g. name@gmail.com")
      .transform((v) => v || null),
    responsePromise: text(120),
    replyOpen: replyTime,
    replyClose: replyTime,
    /** ISO weekdays, 1 = Monday … 7 = Sunday. */
    replyDays: z
      .array(z.number().int().min(1).max(7))
      .max(7)
      .transform((days) => [...new Set(days)].sort((a, b) => a - b)),
    social: z.object(Object.fromEntries(SOCIAL_NETWORKS.map((n) => [n, socialUrl])) as Record<SocialNetwork, typeof socialUrl>),
  })
  .superRefine((s, ctx) => {
    if (!s.replyOpen !== !s.replyClose) {
      const path = s.replyOpen ? "replyClose" : "replyOpen";
      ctx.addIssue({ code: "custom", path: [path], message: "Fill in both reply times, or leave both empty." });
    } else if (s.replyOpen && s.replyClose && s.replyClose <= s.replyOpen) {
      ctx.addIssue({ code: "custom", path: ["replyClose"], message: "The closing time must be after the opening time." });
    }
    if (s.replyOpen && s.replyDays.length === 0) {
      ctx.addIssue({ code: "custom", path: ["replyDays"], message: "Tick at least one day you reply." });
    }
  });

export type SettingsInput = z.input<typeof settingsSchema>;

/** Social links as stored in settings.social_links: only the ones filled in. */
export function socialLinksJson(social: Record<SocialNetwork, string | null>): Record<string, string> {
  return Object.fromEntries(Object.entries(social).filter((entry): entry is [string, string] => entry[1] !== null));
}

/** Add or edit a category. Categories are two levels deep: main categories and their subcategories. */
export const categorySchema = z.object({
  id: z.uuid().nullable(),
  name: z.string().trim().min(1, "Enter a name.").max(80, "At most 80 characters."),
  slug: z.string().trim().pipe(slugSchema.or(z.literal(""))).refine((s) => s !== "", "Enter a web address name."),
  parentId: z
    .string()
    .transform((v) => v || null)
    .pipe(z.uuid().nullable()),
  sortOrder: z.coerce.number().int().min(-10_000).max(10_000),
});

/** First message per field. */
export function firstErrors(error: z.ZodError): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".");
    if (!errors[key]) errors[key] = issue.message;
  }
  return errors;
}
