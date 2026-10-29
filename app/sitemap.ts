import type { MetadataRoute } from "next";
import { getCategories, listProductSlugs } from "@/lib/server/catalogue";
import { absoluteUrl } from "@/lib/site";

// Rebuilt at most every 10 minutes (CATALOGUE_REVALIDATE).
export const revalidate = 600;

/** /sitemap.xml: home, listings, every category and every product in the shop. */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [products, categories] = await Promise.all([listProductSlugs(), getCategories()]);
  return [
    { url: absoluteUrl("/"), changeFrequency: "daily", priority: 1 },
    { url: absoluteUrl("/products"), changeFrequency: "daily", priority: 0.8 },
    { url: absoluteUrl("/categories"), changeFrequency: "weekly", priority: 0.6 },
    { url: absoluteUrl("/how-to-order"), changeFrequency: "monthly", priority: 0.5 },
    { url: absoluteUrl("/about"), changeFrequency: "monthly", priority: 0.5 },
    { url: absoluteUrl("/privacy"), changeFrequency: "yearly", priority: 0.2 },
    ...categories.map((c) => ({
      url: absoluteUrl(`/categories/${c.slug}`),
      changeFrequency: "daily" as const,
      priority: c.parent_id ? 0.7 : 0.8,
    })),
    ...products.map((p) => ({
      url: absoluteUrl(`/products/${p.slug}`),
      lastModified: new Date(p.updated_at),
      changeFrequency: "weekly" as const,
      priority: 0.6,
    })),
  ];
}
