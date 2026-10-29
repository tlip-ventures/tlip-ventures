"use server";

import { z } from "zod";
import { duplicateField, friendlyDbError } from "@/lib/pos/errors";
import { signedQty } from "@/lib/pos/stock";
import { adjustSchema, fieldErrors, posProductSchema, recountSchema, type PosProductInput } from "@/lib/pos/schemas";
import { slugify } from "@/lib/slug";
import { requirePosUser } from "@/lib/server/pos/auth";
import { refreshPosAndShop } from "@/lib/server/pos/refresh";

export type ActionResult = { ok: boolean; message: string };

const NOT_ALLOWED = { ok: false, message: "You are not allowed to do this. Ask the owner." } as const;

/** Every /pos page shows stock (the sidebar badge too), and the shop shows prices and stock: refresh them all. */
const refreshPos = refreshPosAndShop;

/** The "On the website" switch. Owner only; RLS checks it too. */
export async function setOnWebsite(productId: string, on: boolean): Promise<ActionResult> {
  const { supabase, isOwner } = await requirePosUser();
  if (!isOwner) return NOT_ALLOWED;
  const parsed = z.object({ productId: z.uuid(), on: z.boolean() }).safeParse({ productId, on });
  if (!parsed.success) return { ok: false, message: "Unknown product." };

  if (on) {
    // Never show a product for free (same rule as the shop's product editor).
    const { data: p, error } = await supabase
      .from("products")
      .select("price, product_variants(price_override)")
      .eq("id", productId)
      .maybeSingle();
    if (error || !p) return { ok: false, message: friendlyDbError(error, "This product no longer exists.") };
    if (p.product_variants.some((v) => (v.price_override ?? p.price) === 0)) {
      return { ok: false, message: "Enter the price before showing this product on the website." };
    }
  }

  const { data, error } = await supabase.from("products").update({ is_active: on }).eq("id", productId).select("id");
  if (error || !data.length) return { ok: false, message: friendlyDbError(error, "Could not change this. Reload the page.") };
  refreshPos();
  return { ok: true, message: on ? "Showing on the website." : "Hidden from the website." };
}

/** Recount one stock entry: brings the shelf to the counted number. */
export async function recountVariant(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const { supabase, canAdjustStock } = await requirePosUser();
  if (!canAdjustStock) return NOT_ALLOWED;
  const parsed = recountSchema.safeParse({ variantId: formData.get("variantId"), counted: formData.get("counted") ?? "" });
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0].message };

  const { data: change, error } = await supabase.rpc("pos_recount", {
    p_variant_id: parsed.data.variantId,
    p_counted: parsed.data.counted,
  });
  if (error) return { ok: false, message: friendlyDbError(error) };
  refreshPos();
  return {
    ok: true,
    message:
      change === 0
        ? `Matches: ${parsed.data.counted} on the shelf.`
        : `Shelf now ${parsed.data.counted} (${signedQty(change)}).`,
  };
}

/** Add or take away stock by hand, with a reason. */
export async function adjustVariant(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const { supabase, canAdjustStock } = await requirePosUser();
  if (!canAdjustStock) return NOT_ALLOWED;
  const parsed = adjustSchema.safeParse({
    variantId: formData.get("variantId"),
    change: formData.get("change") ?? "",
    reason: formData.get("reason") ?? "",
  });
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0].message };

  const { data: balance, error } = await supabase.rpc("pos_adjust_stock", {
    p_variant_id: parsed.data.variantId,
    p_change: parsed.data.change,
    p_reason: parsed.data.reason,
  });
  if (error) return { ok: false, message: friendlyDbError(error) };
  refreshPos();
  return { ok: true, message: `Shelf now ${balance} (${signedQty(parsed.data.change)}).` };
}

export type SaveProductResult =
  | { ok: true; id: string; message: string }
  | { ok: false; message: string; errors?: Record<string, string> };

/** A free web address for a new product: "blender-1-5l", else "blender-1-5l-2"… */
async function freeSlug(supabase: Awaited<ReturnType<typeof requirePosUser>>["supabase"], name: string): Promise<string> {
  const base = slugify(name) || "product";
  const { data, error } = await supabase.from("products").select("slug").like("slug", `${base}%`);
  if (error) throw new Error(`Could not check web addresses: ${error.message}`);
  const taken = new Set(data.map((r) => r.slug));
  if (!taken.has(base)) return base;
  for (let i = 2; ; i++) {
    const slug = `${base}-${i}`;
    if (!taken.has(slug)) return slug;
  }
}

/** Add product, or save a product's stock details. Owner only; RLS checks every write. */
export async function saveProduct(input: PosProductInput): Promise<SaveProductResult> {
  const { supabase, isOwner } = await requirePosUser();
  if (!isOwner) return NOT_ALLOWED;
  const parsed = posProductSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: "Please fix the highlighted fields.", errors: fieldErrors(parsed.error) };
  }
  const p = parsed.data;
  const isNew = p.id === null;

  const { data: id, error } = await supabase.rpc("pos_save_product", {
    p: {
      id: p.id,
      name: p.name,
      slug: isNew ? await freeSlug(supabase, p.name) : null,
      price: p.price,
      is_active: p.onWebsite,
      category_id: isNew ? p.categoryId : null,
      variants: p.variants.map((v) => ({
        id: v.id,
        sku: v.sku,
        barcode: v.barcode,
        reorder_level: v.reorderLevel,
        price_override: v.priceOverride,
        cost_price: v.cost,
      })),
    },
  });
  if (error) {
    const field = duplicateField(error);
    if (field) {
      // Point at the first stock entry using it; the database doesn't say which.
      return { ok: false, message: friendlyDbError(error), errors: { [`variants.0.${field}`]: friendlyDbError(error) } };
    }
    return { ok: false, message: friendlyDbError(error, "Could not save. Please try again.") };
  }

  let message = isNew ? "Product added." : "Saved.";
  if (isNew && p.startingStock > 0) {
    const { data: variant } = await supabase.from("product_variants").select("id").eq("product_id", id).single();
    const { error: stockError } = variant
      ? await supabase.rpc("pos_recount", { p_variant_id: variant.id, p_counted: p.startingStock, p_reason: "Starting stock" })
      : { error: { message: "missing" } };
    message = stockError
      ? "Product added, but the starting stock wasn't saved. Use Recount to set it."
      : `Product added with ${p.startingStock} on the shelf.`;
  }

  refreshPos();
  return { ok: true, id, message };
}
