"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { categorySchema, firstErrors } from "@/lib/admin-forms";
import { requireAdmin } from "@/lib/server/admin";

export type CategoryResult = { ok: boolean; message: string; errors?: Record<string, string> };

export async function saveCategory(input: z.input<typeof categorySchema>): Promise<CategoryResult> {
  const { supabase } = await requireAdmin();
  const parsed = categorySchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: "Please fix the highlighted fields.", errors: firstErrors(parsed.error) };
  const c = parsed.data;

  // Two levels only: a parent must be a main category, and a category with subcategories stays a main category.
  if (c.parentId) {
    if (c.parentId === c.id) return { ok: false, message: "A category can't be inside itself.", errors: { parentId: "Choose another main category." } };
    const { data: parent } = await supabase.from("categories").select("parent_id").eq("id", c.parentId).maybeSingle();
    if (!parent) return { ok: false, message: "That main category no longer exists.", errors: { parentId: "Choose another main category." } };
    if (parent.parent_id) return { ok: false, message: "Subcategories can't have their own subcategories.", errors: { parentId: "Choose a main category." } };
    if (c.id) {
      const { count } = await supabase.from("categories").select("id", { count: "exact", head: true }).eq("parent_id", c.id);
      if (count) return { ok: false, message: "This category has subcategories, so it must stay a main category.", errors: { parentId: "Keep as a main category." } };
    }
  }

  const row = { name: c.name, slug: c.slug, parent_id: c.parentId, sort_order: c.sortOrder };
  const { data, error } = c.id
    ? await supabase.from("categories").update(row).eq("id", c.id).select("id")
    : await supabase.from("categories").insert(row).select("id");
  if (error?.code === "23505") return { ok: false, message: "Please fix the highlighted fields.", errors: { slug: "Another category already uses this web address." } };
  if (error) return { ok: false, message: `Could not save: ${error.message}` };
  if (!data.length) return { ok: false, message: "Could not save: this category no longer exists, or you are not allowed to change it." };

  revalidatePath("/", "layout");
  return { ok: true, message: c.id ? "Saved." : `Added “${c.name}”.` };
}

export async function deleteCategory(categoryId: string): Promise<CategoryResult> {
  const { supabase } = await requireAdmin();
  const id = z.uuid().safeParse(categoryId);
  if (!id.success) return { ok: false, message: "Unknown category." };
  const { count } = await supabase.from("categories").select("id", { count: "exact", head: true }).eq("parent_id", id.data);
  if (count) return { ok: false, message: "Move or delete its subcategories first." };
  // Products stay; only their link to this category is removed.
  const { data, error } = await supabase.from("categories").delete().eq("id", id.data).select("id");
  if (error) return { ok: false, message: `Could not delete: ${error.message}` };
  if (!data.length) return { ok: false, message: "This category no longer exists, or you are not allowed to delete it." };
  revalidatePath("/", "layout");
  return { ok: true, message: "Deleted." };
}
