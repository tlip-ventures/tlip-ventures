import type { SupabaseClient } from "@supabase/supabase-js";
import type { ProductForm } from "@/lib/admin-product";
import type { Database } from "@/lib/database.types";

type Supabase = SupabaseClient<Database>;

export type WriteProductResult =
  | { ok: true; id: string }
  | { ok: false; message: string; errors?: Record<string, string> };

type PostgrestError = { code?: string; message: string };

/** Turns unique-constraint errors into messages next to the right field. */
function constraintError(error: PostgrestError): WriteProductResult {
  if (error.code === "23505" && error.message.includes("slug")) {
    return { ok: false, message: "Please fix the highlighted fields.", errors: { slug: "Another product already uses this web address." } };
  }
  if (error.code === "23505" && error.message.includes("sku")) {
    return { ok: false, message: "Please fix the highlighted fields.", errors: { variants: "A SKU here is already used by another product." } };
  }
  if (error.code === "23505" && error.message.includes("unique_options")) {
    return { ok: false, message: "Please fix the highlighted fields.", errors: { variants: "Two options have the same values." } };
  }
  if (error.code === "23503") {
    return { ok: false, message: "An option with stock history can't be removed. Keep it and leave it out of stock instead." };
  }
  return { ok: false, message: `Could not save: ${error.message}` };
}

/**
 * Creates (p.id null) or updates a product with its options, stock, categories
 * and photos. Used by the admin editor (as the signed-in admin, so RLS checks
 * every write) and by the CSV import script (with the secret key).
 * Existing options keep their ids, so past orders stay linked to them.
 */
export async function writeProduct(supabase: Supabase, p: ProductForm): Promise<WriteProductResult> {
  const row = {
    name: p.name,
    slug: p.slug,
    brand: p.brand,
    description: p.description,
    price: p.price,
    compare_at_price: p.compareAtPrice,
    option1_name: p.option1Name,
    option2_name: p.option2Name,
    is_active: p.isActive,
    is_featured: p.isFeatured,
  };

  let productId: string;
  const isNew = p.id === null;
  if (p.id) {
    const { data, error } = await supabase.from("products").update(row).eq("id", p.id).select("id");
    if (error) return constraintError(error);
    if (!data.length) return { ok: false, message: "This product no longer exists, or you are not allowed to edit it." };
    productId = p.id;
  } else {
    const { data, error } = await supabase.from("products").insert(row).select("id").single();
    if (error) return constraintError(error);
    productId = data.id;
  }

  const result = await saveChildren(supabase, productId, p);
  if (!result.ok && isNew) {
    // Don't leave a half-made product behind (child rows cascade).
    await supabase.from("products").delete().eq("id", productId);
  }
  if (!result.ok) return result;
  return { ok: true, id: productId };
}

async function saveChildren(supabase: Supabase, productId: string, p: ProductForm): Promise<WriteProductResult> {
  // Variants: delete removed ones first (frees their option values), then update, then add.
  const { data: existing, error: readError } = await supabase
    .from("product_variants")
    .select("id")
    .eq("product_id", productId);
  if (readError) return { ok: false, message: `Could not save options: ${readError.message}` };
  const existingIds = new Set(existing.map((v) => v.id));
  const kept = p.variants.filter((v) => v.id && existingIds.has(v.id));
  const removed = [...existingIds].filter((id) => !kept.some((v) => v.id === id));
  const added = p.variants.filter((v) => !v.id || !existingIds.has(v.id));
  const variantRow = (v: ProductForm["variants"][number]) => ({
    product_id: productId,
    option1_value: v.option1Value,
    option2_value: v.option2Value,
    sku: v.sku,
    in_stock: v.inStock,
    stock_qty: v.stockQty,
    price_override: v.priceOverride,
  });

  if (removed.length) {
    const { error } = await supabase.from("product_variants").delete().in("id", removed);
    if (error) return error.code === "23503" ? constraintError(error) : { ok: false, message: `Could not remove options: ${error.message}` };
  }
  for (const v of kept) {
    const { error } = await supabase.from("product_variants").update(variantRow(v)).eq("id", v.id!);
    if (error) return constraintError(error);
  }
  if (added.length) {
    const { error } = await supabase.from("product_variants").insert(added.map(variantRow));
    if (error) return constraintError(error);
  }

  // Categories and photos: replace the lists.
  const links = await supabase.from("product_categories").delete().eq("product_id", productId);
  if (links.error) return { ok: false, message: `Could not save categories: ${links.error.message}` };
  if (p.categoryIds.length) {
    const { error } = await supabase
      .from("product_categories")
      .insert([...new Set(p.categoryIds)].map((category_id) => ({ product_id: productId, category_id })));
    if (error) return { ok: false, message: `Could not save categories: ${error.message}` };
  }

  const images = await supabase.from("product_images").delete().eq("product_id", productId);
  if (images.error) return { ok: false, message: `Could not save photos: ${images.error.message}` };
  if (p.images.length) {
    const { error } = await supabase.from("product_images").insert(
      p.images.map((img, i) => ({
        product_id: productId,
        url: img.url,
        public_id: img.publicId,
        alt: img.alt ?? "",
        sort_order: i,
      })),
    );
    if (error) return { ok: false, message: `Could not save photos: ${error.message}` };
  }
  return { ok: true, id: productId };
}
