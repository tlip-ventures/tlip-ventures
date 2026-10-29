import { z } from "zod";

/** The home page shows at most this many banners (the first ones in order). */
export const MAX_ACTIVE_BANNERS = 5;

/** Banner artwork size: 1440 × 720 (2:1), the same image on phones and computers. */
export const BANNER_WIDTH = 1440;
export const BANNER_HEIGHT = 720;

// Same rule as the banners_link_url check in the database: a page on this site
// ("/deals", not "//elsewhere") or a full https:// address.
const LINK = /^(\/([^/].*)?|https:\/\/.+)$/;

const trimmed = z.string().trim();

export const bannerFormSchema = z.object({
  imageUrl: z.url({ protocol: /^https$/, hostname: /^res\.cloudinary\.com$/, error: "Upload the banner image first." }),
  publicId: trimmed.max(300).nullable().default(null),
  alt: trimmed
    .min(1, "Describe the banner, including any words in the picture.")
    .max(300, "Keep the description under 300 characters."),
  /** Empty means the banner is only a picture. */
  linkUrl: trimmed
    .max(500)
    .transform((v) => (v === "" ? null : v))
    .refine((v) => v === null || LINK.test(v), "Use a page on this site like /deals, or a full https:// address.")
    .nullable()
    .default(null),
  isActive: z.boolean().default(true),
});

export type BannerFormInput = z.input<typeof bannerFormSchema>;
export type BannerForm = z.output<typeof bannerFormSchema>;

/**
 * A note for the admin when an uploaded image is not 2:1, since it will be
 * cropped to fit. Null when the shape is close enough (within 5%).
 */
export function bannerShapeWarning(width: number, height: number): string | null {
  if (!(width > 0 && height > 0)) return null;
  const ratio = width / height;
  if (Math.abs(ratio - 2) / 2 <= 0.05) {
    return width < BANNER_WIDTH / 2
      ? `This image is only ${width} × ${height}, so it may look blurry on computers. ${BANNER_WIDTH} × ${BANNER_HEIGHT} is best.`
      : null;
  }
  return `This image is ${width} × ${height}. Banners are ${BANNER_WIDTH} × ${BANNER_HEIGHT} (twice as wide as tall), so the edges of this one will be cut off.`;
}
