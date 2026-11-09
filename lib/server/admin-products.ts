import "server-only";
import type { ProductFormInput } from "@/lib/admin-product";
import { pesewasToInput } from "@/lib/money";
import { pageRange } from "@/lib/pagination";
import { requireAdmin } from "@/lib/server/admin";

// Admin product reads, as the signed-in admin (RLS shows hidden products too).

export const ADMIN_PRODUCTS_PAGE_SIZE = 30;
export const PRODUCT_FILTERS = ["all", "active", "hidden", "out-of-stock"] as const;
export type ProductFilter = (typeof PRODUCT_FILTERS)[number];

export type AdminProductRow = {
  id: string;
  slug: string;
  name: string;
  price: number;
  isActive: boolean;
  isFeatured: boolean;
  image: string | null;
  /** Colours (or designs) customers pick from; stock is one number for the product. */
  choices: string[];
  /** The stock entry in use (one per product; earlier ones are history). */
  variants: { id: string; label: string | null; inStock: boolean; stockQty: number | null }[];
};

export async function listAdminProducts(options: { search?: string; filter?: ProductFilter; page?: number }) {
  const { supabase } = await requireAdmin();
  const { from, to } = pageRange(options.page ?? 1, ADMIN_PRODUCTS_PAGE_SIZE);
  const outOfStock = options.filter === "out-of-stock";

  // "Out of stock" lists products whose stock entry in use is out; the inner
  // join narrows products. Retired entries (former colours, merged duplicates) are left out.
  let query = supabase
    .from("products")
    .select(
      outOfStock
        ? "id, slug, name, price, is_active, is_featured, updated_at, choices, product_images(url, sort_order), product_variants(id, retired, in_stock, stock_qty), out:product_variants!inner(id)"
        : "id, slug, name, price, is_active, is_featured, updated_at, choices, product_images(url, sort_order), product_variants(id, retired, in_stock, stock_qty)",
      { count: "exact" },
    )
    .order("updated_at", { ascending: false })
    .order("id")
    .order("sort_order", { referencedTable: "product_images" })
    .limit(1, { referencedTable: "product_images" });

  if (outOfStock) query = query.eq("out.in_stock", false).eq("out.retired", false);
  if (options.filter === "active") query = query.eq("is_active", true);
  if (options.filter === "hidden") query = query.eq("is_active", false);
  const term = options.search?.replace(/[%_,()\\]/g, " ").trim();
  if (term) query = query.ilike("name", `%${term}%`);

  const { data, count, error } = await query.range(from, to);
  if (error?.code === "PGRST103") return { products: [] as AdminProductRow[], total: count ?? 0 };
  if (error) throw new Error(`Could not load products: ${error.message}`);

  type Row = {
    id: string;
    slug: string;
    name: string;
    price: number;
    is_active: boolean;
    is_featured: boolean;
    choices: string[];
    product_images: { url: string }[];
    product_variants: { id: string; retired: boolean; in_stock: boolean; stock_qty: number | null }[];
  };
  const products = (data as unknown as Row[]).map(
    (p): AdminProductRow => ({
      id: p.id,
      slug: p.slug,
      name: p.name,
      price: p.price,
      isActive: p.is_active,
      isFeatured: p.is_featured,
      image: p.product_images[0]?.url ?? null,
      choices: p.choices,
      variants: p.product_variants
        .filter((v) => !v.retired)
        .map((v) => ({ id: v.id, label: null, inStock: v.in_stock, stockQty: v.stock_qty })),
    }),
  );
  return { products, total: count ?? 0 };
}

export async function getAdminProduct(id: string) {
  const { supabase } = await requireAdmin();
  const { data, error } = await supabase
    .from("products")
    .select(
      "id, slug, name, brand, description, price, compare_at_price, option1_name, choices, is_active, is_featured, product_images(url, public_id, alt, sort_order), product_variants(id, retired, sku, in_stock, stock_qty), product_categories(category_id)",
    )
    .eq("id", id)
    .order("sort_order", { referencedTable: "product_images" })
    .maybeSingle();
  if (error) throw new Error(`Could not load product: ${error.message}`);
  return data;
}

/** Database product → the editor's form values (prices as cedi text). */
export function productToForm(p: NonNullable<Awaited<ReturnType<typeof getAdminProduct>>>): ProductFormInput {
  const stock = p.product_variants.find((v) => !v.retired);
  return {
    id: p.id,
    name: p.name,
    slug: p.slug,
    brand: p.brand ?? "",
    description: p.description ?? "",
    price: pesewasToInput(p.price),
    compareAtPrice: pesewasToInput(p.compare_at_price),
    isActive: p.is_active,
    isFeatured: p.is_featured,
    choiceName: p.option1_name ?? "",
    choices: p.choices.join(", "),
    sku: stock?.sku ?? "",
    inStock: stock?.in_stock ?? true,
    stockQty: stock?.stock_qty == null ? "" : String(stock.stock_qty),
    categoryIds: p.product_categories.map((c) => c.category_id),
    images: p.product_images.map((img) => ({ url: img.url, publicId: img.public_id ?? "", alt: img.alt })),
  };
}

export const EMPTY_PRODUCT: ProductFormInput = {
  id: null,
  name: "",
  slug: "",
  brand: "",
  description: "",
  price: "",
  compareAtPrice: "",
  isActive: true,
  isFeatured: false,
  choiceName: "",
  choices: "",
  sku: "",
  inStock: true,
  stockQty: "",
  categoryIds: [],
  images: [],
};

/** True while the website's stock follows the Stock & POS shelf count (settings.website_stock_sync). */
export async function websiteStockFromShop(): Promise<boolean> {
  const { supabase } = await requireAdmin();
  const { data, error } = await supabase.from("settings").select("website_stock_sync").eq("id", 1).maybeSingle();
  if (error) throw new Error(`Could not load settings: ${error.message}`);
  return data?.website_stock_sync ?? false;
}
