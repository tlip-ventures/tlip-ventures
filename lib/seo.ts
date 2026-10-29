import type { Metadata } from "next";

export const DEFAULT_SHARE_IMAGE = { url: "/brand/share.png", width: 1200, height: 630, alt: "Tlip Ventures — home and kitchen goods" };

type PageSeo = {
  title: string;
  description: string;
  /** Path of the canonical URL, e.g. "/products/blender-1-5l". */
  path: string;
  image?: { url: string; width?: number; height?: number; alt?: string } | null;
};

/**
 * Canonical URL plus a complete Open Graph block for a page. Next replaces the
 * parent's openGraph object rather than merging it, so every field is set here.
 */
export function pageMetadata({ title, description, path, image }: PageSeo): Metadata {
  const fullTitle = `${title} | Tlip Ventures`;
  return {
    title,
    description,
    alternates: { canonical: path },
    openGraph: {
      type: "website",
      siteName: "Tlip Ventures",
      locale: "en_GH",
      url: path,
      title: fullTitle,
      description,
      images: [image ?? DEFAULT_SHARE_IMAGE],
    },
    twitter: { card: "summary_large_image", title: fullTitle, description },
  };
}

/** Listing pages: canonical keeps the page number but drops sorting, which only reorders the same products. */
export function listingPath(basePath: string, page: number): string {
  return page > 1 ? `${basePath}?page=${page}` : basePath;
}

/** Short plain-text description for meta tags. */
export function metaDescription(text: string | null | undefined, fallback: string): string {
  const clean = (text ?? "").replace(/\s+/g, " ").trim();
  if (!clean) return fallback;
  return clean.length <= 160 ? clean : `${clean.slice(0, 157).replace(/\s+\S*$/, "")}…`;
}
