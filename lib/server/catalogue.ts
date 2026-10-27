import "server-only";
import { cache } from "react";
import { z } from "zod";
import type { Category } from "@/lib/categories";
import type { Tables } from "@/lib/database.types";
import type { Sort } from "@/lib/listing";
import { pageRange, PAGE_SIZE } from "@/lib/pagination";
import { cardAddAction, optionLabel, priceSummary, variantPrice, type CardAddAction, type PriceSummary } from "@/lib/product";
import { createClient } from "@/lib/supabase/server";

// Storefront reads. RLS already hides inactive products from the public, but
// a signed-in admin can see them, so every query here also filters is_active.

export type Settings = Omit<Tables<"settings">, "social_links"> & {
  social_links: Record<string, string>;
};

export type ProductImage = { url: string; alt: string };

export type ProductCardData = {
  id: string;
  slug: string;
  name: string;
  brand: string | null;
  image: ProductImage | null;
  pricing: PriceSummary;
  /** What the card's add button does: add the only variant, or send the customer to pick one. */
  addAction: CardAddAction;
};

const socialLinksSchema = z.record(z.string(), z.unknown());
// http(s) only: these end up in href attributes.
const socialUrlSchema = z.url({ protocol: /^https?$/ });

/** Keeps the valid links, so one bad entry doesn't hide the rest. */
function parseSocialLinks(value: unknown): Record<string, string> {
  const links = socialLinksSchema.safeParse(value);
  if (!links.success) return {};
  return Object.fromEntries(
    Object.entries(links.data).flatMap(([name, url]) => {
      const parsed = socialUrlSchema.safeParse(url);
      return parsed.success ? [[name, parsed.data]] : [];
    }),
  );
}

/** The single settings row. Cached per request, so the layout and page share one query. */
export const getSettings = cache(async (): Promise<Settings> => {
  const supabase = await createClient();
  const { data, error } = await supabase.from("settings").select("*").eq("id", 1).single();
  if (error) throw new Error(`Could not load settings: ${error.message}`);
  return { ...data, social_links: parseSocialLinks(data.social_links) };
});

/** Every category (a few dozen rows), sorted. Cached per request. */
export const getCategories = cache(async (): Promise<Category[]> => {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("categories")
    .select("id, name, slug, parent_id, image_url, sort_order")
    .order("sort_order")
    .order("name");
  if (error) throw new Error(`Could not load categories: ${error.message}`);
  return data;
});

export const getCategoryBySlug = cache(async (slug: string): Promise<Category | null> => {
  const categories = await getCategories();
  return categories.find((c) => c.slug === slug) ?? null;
});

// One cover image per card: the embedded images are ordered and limited below.
const CARD_SELECT =
  "id, slug, name, brand, price, compare_at_price, product_images(url, alt, sort_order), product_variants(id, option1_value, option2_value, in_stock, price_override)";
const CARD_IN_CATEGORY_SELECT = `${CARD_SELECT}, product_categories!inner(category_id)` as const;

type CardRow = {
  id: string;
  slug: string;
  name: string;
  brand: string | null;
  price: number;
  compare_at_price: number | null;
  product_images: { url: string; alt: string }[];
  product_variants: {
    id: string;
    option1_value: string | null;
    option2_value: string | null;
    in_stock: boolean;
    price_override: number | null;
  }[];
};

function toCard(row: CardRow): ProductCardData {
  const image = row.product_images[0];
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    brand: row.brand,
    image: image ? { url: image.url, alt: image.alt || row.name } : null,
    pricing: priceSummary(row, row.product_variants),
    addAction: cardAddAction(row, row.product_variants),
  };
}

/** How many of the most recently added products get a "New" badge. */
export const NEW_BADGE_COUNT = 12;

/**
 * Ids of the NEW_BADGE_COUNT most recently added active products, in the same
 * order as the "newest" listing. Cached per request, so every grid on a page shares one query.
 */
export const getNewestProductIds = cache(async (): Promise<Set<string>> => {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("products")
    .select("id")
    .eq("is_active", true)
    .order("created_at", { ascending: false })
    .order("id")
    .limit(NEW_BADGE_COUNT);
  if (error) throw new Error(`Could not load the newest products: ${error.message}`);
  return new Set(data.map((row) => row.id));
});

export type ListProductsOptions = {
  /** Only products linked to one of these categories. */
  categoryIds?: string[];
  /** A tsquery from toPrefixTsQuery(). */
  search?: string;
  featured?: boolean;
  /** Only products with a "was" price (compare_at_price, always above the price). */
  deals?: boolean;
  /**
   * Price filter in pesewas on the product's price, from minPrice (inclusive) to
   * maxPrice (exclusive). Variant price overrides are not considered.
   */
  minPrice?: number | null;
  maxPrice?: number | null;
  excludeId?: string;
  sort?: Sort;
  page?: number;
  pageSize?: number;
};

export type ProductPage = { products: ProductCardData[]; total: number };

/**
 * A page of active products for a listing. Returns null when the page number
 * is past the end, so the caller can show a 404.
 */
export async function listProducts(options: ListProductsOptions = {}): Promise<ProductPage | null> {
  const { categoryIds, search, featured, deals, minPrice, maxPrice, excludeId, sort = "newest", page = 1, pageSize = PAGE_SIZE } = options;
  const supabase = await createClient();

  let query = categoryIds
    ? supabase
        .from("products")
        .select(CARD_IN_CATEGORY_SELECT, { count: "exact" })
        .in("product_categories.category_id", categoryIds)
    : supabase.from("products").select(CARD_SELECT, { count: "exact" });

  query = query.eq("is_active", true);
  if (search) query = query.textSearch("search_vector", search, { config: "english" });
  if (featured) query = query.eq("is_featured", true);
  if (deals) query = query.not("compare_at_price", "is", null);
  if (minPrice != null) query = query.gte("price", minPrice);
  if (maxPrice != null) query = query.lt("price", maxPrice);
  if (excludeId) query = query.neq("id", excludeId);

  if (sort === "price-asc") query = query.order("price", { ascending: true });
  else if (sort === "price-desc") query = query.order("price", { ascending: false });
  else query = query.order("created_at", { ascending: false });
  // Tie-breaker so pages never repeat or skip a product.
  query = query.order("id");

  const { from, to } = pageRange(page, pageSize);
  const { data, count, error } = await query
    .order("sort_order", { referencedTable: "product_images" })
    .limit(1, { referencedTable: "product_images" })
    .range(from, to);

  // PGRST103: the requested range starts past the last row.
  if (error?.code === "PGRST103") return null;
  if (error) throw new Error(`Could not load products: ${error.message}`);

  const total = count ?? 0;
  if (page > 1 && from >= total) return null;
  return { products: (data as CardRow[]).map(toCard), total };
}

export type ProductVariant = Pick<
  Tables<"product_variants">,
  "id" | "option1_value" | "option2_value" | "sku" | "in_stock" | "price_override"
>;

export type ProductDetail = Pick<
  Tables<"products">,
  "id" | "slug" | "name" | "brand" | "description" | "price" | "compare_at_price" | "option1_name" | "option2_name"
> & {
  images: ProductImage[];
  variants: ProductVariant[];
  categoryIds: string[];
  pricing: PriceSummary;
};

/** One active product with all its images and variants. Cached per request for generateMetadata. */
export const getProductBySlug = cache(async (slug: string): Promise<ProductDetail | null> => {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("products")
    .select(
      "id, slug, name, brand, description, price, compare_at_price, option1_name, option2_name, product_images(url, alt, sort_order), product_variants(id, option1_value, option2_value, sku, in_stock, price_override), product_categories(category_id)",
    )
    .eq("slug", slug)
    .eq("is_active", true)
    .order("sort_order", { referencedTable: "product_images" })
    .order("option1_value", { referencedTable: "product_variants" })
    .order("option2_value", { referencedTable: "product_variants" })
    .maybeSingle();
  if (error) throw new Error(`Could not load product: ${error.message}`);
  if (!data) return null;

  const { product_images, product_variants, product_categories, ...product } = data;
  return {
    ...product,
    images: product_images.map((img) => ({ url: img.url, alt: img.alt || product.name })),
    variants: product_variants,
    categoryIds: product_categories.map((pc) => pc.category_id),
    pricing: priceSummary(product, product_variants),
  };
});

/** A cart line as the database sees it now: current name, price and stock. */
export type CartVariant = {
  variantId: string;
  productId: string;
  slug: string;
  productName: string;
  optionValues: string | null;
  unitPrice: number;
  inStock: boolean;
  image: ProductImage | null;
};

/**
 * Current details for the given variants. Variants whose product is inactive
 * or deleted are left out, so a missing id means "no longer available".
 */
export async function getCartVariants(variantIds: readonly string[]): Promise<CartVariant[]> {
  if (variantIds.length === 0) return [];
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("product_variants")
    .select(
      "id, option1_value, option2_value, in_stock, price_override, products!inner(id, slug, name, price, compare_at_price, is_active, product_images(url, alt, sort_order))",
    )
    .in("id", variantIds)
    .eq("products.is_active", true)
    .order("sort_order", { referencedTable: "products.product_images" })
    .limit(1, { referencedTable: "products.product_images" });
  if (error) throw new Error(`Could not load cart items: ${error.message}`);

  return data.map((row) => {
    const product = row.products;
    const image = product.product_images[0];
    return {
      variantId: row.id,
      productId: product.id,
      slug: product.slug,
      productName: product.name,
      optionValues: optionLabel(row),
      unitPrice: variantPrice(product, row),
      inStock: row.in_stock,
      image: image ? { url: image.url, alt: image.alt || product.name } : null,
    };
  });
}

/**
 * Every active product's slug and last change, for the sitemap. Read in
 * batches because Supabase returns at most 1,000 rows per request.
 */
export async function listProductSlugs(): Promise<{ slug: string; updated_at: string }[]> {
  const supabase = await createClient();
  const batch = 1000;
  const all: { slug: string; updated_at: string }[] = [];
  for (let from = 0; from < 50_000; from += batch) {
    const { data, error } = await supabase
      .from("products")
      .select("slug, updated_at")
      .eq("is_active", true)
      .order("id")
      .range(from, from + batch - 1);
    if (error) throw new Error(`Could not list products: ${error.message}`);
    all.push(...data);
    if (data.length < batch) break;
  }
  return all;
}
