"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { bannerFormSchema, type BannerFormInput } from "@/lib/banners";
import { requireAdmin } from "@/lib/server/admin";
import { signUpload, type UploadSignature } from "@/lib/server/cloudinary-upload";

export type BannerResult = { ok: boolean; message?: string; errors?: Record<string, string> };

const idSchema = z.uuid();

function done(): BannerResult {
  revalidatePath("/admin/banners");
  revalidatePath("/");
  return { ok: true };
}

/** Lets the admin's browser upload one banner image straight to Cloudinary. */
export async function getBannerUploadSignature(): Promise<UploadSignature> {
  await requireAdmin();
  return signUpload("tlip/banners");
}

/** Adds a banner at the end of the list, or saves changes to one (when `id` is given). */
export async function saveBanner(id: string | null, input: BannerFormInput): Promise<BannerResult> {
  const { supabase } = await requireAdmin();
  const parsed = bannerFormSchema.safeParse(input);
  if (!parsed.success) {
    const errors: Record<string, string> = {};
    for (const issue of parsed.error.issues) errors[String(issue.path[0])] ??= issue.message;
    return { ok: false, message: "Please fix the highlighted fields.", errors };
  }
  const row = {
    image_url: parsed.data.imageUrl,
    public_id: parsed.data.publicId,
    alt: parsed.data.alt,
    link_url: parsed.data.linkUrl,
    is_active: parsed.data.isActive,
  };

  if (id === null) {
    const { data: last } = await supabase
      .from("banners")
      .select("sort_order")
      .order("sort_order", { ascending: false })
      .limit(1)
      .maybeSingle();
    const { error } = await supabase.from("banners").insert({ ...row, sort_order: (last?.sort_order ?? 0) + 10 });
    if (error) return { ok: false, message: `Could not add the banner: ${error.message}` };
    return done();
  }

  if (!idSchema.safeParse(id).success) return { ok: false, message: "Unknown banner." };
  const { data, error } = await supabase.from("banners").update(row).eq("id", id).select("id");
  if (error) return { ok: false, message: `Could not save: ${error.message}` };
  if (!data.length) return { ok: false, message: "This banner no longer exists." };
  return done();
}

/** Switches a banner on or off on the home page. */
export async function setBannerActive(id: string, isActive: boolean): Promise<BannerResult> {
  const { supabase } = await requireAdmin();
  if (!idSchema.safeParse(id).success || typeof isActive !== "boolean") return { ok: false, message: "Unknown banner." };
  const { data, error } = await supabase.from("banners").update({ is_active: isActive }).eq("id", id).select("id");
  if (error || !data.length) return { ok: false, message: `Could not update the banner${error ? `: ${error.message}` : "."}` };
  return done();
}

/** Moves a banner one place earlier (-1) or later (1) by swapping its position with its neighbour. */
export async function moveBanner(id: string, direction: -1 | 1): Promise<BannerResult> {
  const { supabase } = await requireAdmin();
  if (!idSchema.safeParse(id).success || (direction !== -1 && direction !== 1)) return { ok: false, message: "Unknown banner." };
  const { data: all, error } = await supabase.from("banners").select("id, sort_order").order("sort_order").order("created_at");
  if (error) return { ok: false, message: `Could not load banners: ${error.message}` };
  const i = all.findIndex((b) => b.id === id);
  const j = i + direction;
  if (i < 0 || j < 0 || j >= all.length) return { ok: true };

  // Renumber in steps of 10 with the two swapped, so equal sort_orders can't get stuck.
  const order = all.map((b) => b.id);
  [order[i], order[j]] = [order[j], order[i]];
  for (const [index, bannerId] of order.entries()) {
    const sortOrder = (index + 1) * 10;
    if (all.find((b) => b.id === bannerId)?.sort_order === sortOrder) continue;
    const { error: updateError } = await supabase.from("banners").update({ sort_order: sortOrder }).eq("id", bannerId);
    if (updateError) return { ok: false, message: `Could not reorder: ${updateError.message}` };
  }
  return done();
}

/** Deletes a banner. The image stays in Cloudinary. */
export async function deleteBanner(id: string): Promise<BannerResult> {
  const { supabase } = await requireAdmin();
  if (!idSchema.safeParse(id).success) return { ok: false, message: "Unknown banner." };
  const { data, error } = await supabase.from("banners").delete().eq("id", id).select("id");
  if (error) return { ok: false, message: `Could not delete: ${error.message}` };
  if (!data.length) return { ok: false, message: "This banner no longer exists." };
  return done();
}
