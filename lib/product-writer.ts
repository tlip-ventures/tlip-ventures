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
    return { ok: false, message: "Please fix the highlighted fields.", errors: { sku: "Another product already uses this SKU." } };
  }
  if (error.code === "23514" && error.message.includes("choices")) {
    return { ok: false, message: "Please fix the highlighted fields.", errors: { choices: "Check the list: each one once, 60 characters at most." } };
  }
  return { ok: false, message: `Could not save: ${error.message}` };
}

/**
 * Creates (p.id null) or updates a product with its choices, stock, categories
 * and photos. Used by the admin editor (as the signed-in admin, so RLS checks
 * every write) and by the CSV import script (with the secret key).
 * A product has one stock entry (variant); its colours are only choices.
 */
export async function writeProduct(supabase: Supabase, p: ProductForm): Promise<WriteProductResult> {
  const row = {
    name: p.name,
    slug: p.slug,
    brand: p.brand,
    description: p.description,
    price: p.price,
    compare_at_price: p.compareAtPrice,
    option1_name: p.choices.length > 0 ? p.choiceName : null,
    choices: p.choices,
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
  // The one stock entry in use (earlier, retired entries stay as history).
  const { data: current, error: readError } = await supabase
    .from("product_variants")
    .select("id")
    .eq("product_id", productId)
    .eq("retired", false)
    .maybeSingle();
  if (readError) return { ok: false, message: `Could not save stock: ${readError.message}` };
  const variantRow = { sku: p.sku, in_stock: p.inStock, stock_qty: p.stockQty, price_override: null };
  const { error: variantError } = current
    ? await supabase.from("product_variants").update(variantRow).eq("id", current.id)
    : await supabase.from("product_variants").insert({ ...variantRow, product_id: productId });
  if (variantError) return constraintError(variantError);

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
