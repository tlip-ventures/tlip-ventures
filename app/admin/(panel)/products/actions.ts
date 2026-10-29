"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { formErrors, productFormSchema, type ProductFormInput } from "@/lib/admin-product";
import { requireAdmin } from "@/lib/server/admin";
import { signUpload, type UploadSignature } from "@/lib/server/cloudinary-upload";
import { writeProduct, type WriteProductResult } from "@/lib/product-writer";

export type SaveProductResult = WriteProductResult;

/** Saves the product editor. Runs as the signed-in admin, so RLS checks every write too. */
export async function saveProduct(input: ProductFormInput): Promise<SaveProductResult> {
  const { supabase } = await requireAdmin();
  const parsed = productFormSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: "Please fix the highlighted fields.", errors: formErrors(parsed.error) };
  }
  const result = await writeProduct(supabase, parsed.data);
  if (result.ok) revalidatePath("/admin/products");
  return result;
}

export async function deleteProduct(productId: string): Promise<{ ok: boolean; message?: string }> {
  const { supabase } = await requireAdmin();
  const id = z.uuid().safeParse(productId);
  if (!id.success) return { ok: false, message: "Unknown product." };
  // Past orders keep their copied names and prices (order_items.variant_id becomes null).
  const { data, error } = await supabase.from("products").delete().eq("id", id.data).select("id");
  if (error?.code === "23503") {
    return { ok: false, message: "This product has stock history in the Stock & POS app, so it can't be deleted. Hide it instead." };
  }
  if (error) return { ok: false, message: `Could not delete: ${error.message}` };
  if (!data.length) return { ok: false, message: "This product no longer exists, or you are not allowed to delete it." };
  revalidatePath("/admin/products");
  return { ok: true };
}

/** Quick stock switch from the product list. Stock only ever changes by hand (domain rule 3). */
export async function setVariantStock(formData: FormData) {
  const { supabase } = await requireAdmin();
  const parsed = z
    .object({ variantId: z.uuid(), inStock: z.enum(["true", "false"]) })
    .safeParse({ variantId: formData.get("variantId"), inStock: formData.get("inStock") });
  if (!parsed.success) throw new Error("Invalid stock update.");
  const { data, error } = await supabase
    .from("product_variants")
    .update({ in_stock: parsed.data.inStock === "true" })
    .eq("id", parsed.data.variantId)
    .select("id");
  if (error || !data.length) throw new Error(`Could not update stock${error ? `: ${error.message}` : "."}`);
  revalidatePath("/admin/products");
}

export type { UploadSignature } from "@/lib/server/cloudinary-upload";

const UPLOAD_FOLDER = "tlip/products";

/** Lets the admin's browser upload one product photo straight to Cloudinary. */
export async function getUploadSignature(): Promise<UploadSignature> {
  await requireAdmin();
  return signUpload(UPLOAD_FOLDER);
}
