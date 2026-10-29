"use server";

import { revalidatePath } from "next/cache";
import { friendlyDbError } from "@/lib/pos/errors";
import { newStaffSchema, staffPermissionsSchema } from "@/lib/pos/schemas";
import { requirePosUser } from "@/lib/server/pos/auth";
import { createAdminClient } from "@/lib/server/supabase-admin";
import type { ActionResult } from "../products/actions";

const OWNER_ONLY = { ok: false, message: "Only the owner can manage people." } as const;

const bool = (formData: FormData, name: string) => formData.get(name) === "on";

/** Name, on/off and the two staff permissions. Checked again in pos_update_user. */
export async function updatePerson(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const { supabase, isOwner } = await requirePosUser();
  if (!isOwner) return OWNER_ONLY;
  const parsed = staffPermissionsSchema.safeParse({
    userId: formData.get("userId"),
    displayName: formData.get("displayName") ?? "",
    isActive: bool(formData, "isActive"),
    canGiveDiscounts: bool(formData, "canGiveDiscounts"),
    canAdjustStock: bool(formData, "canAdjustStock"),
  });
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0].message };

  const p = parsed.data;
  const { error } = await supabase.rpc("pos_update_user", {
    p_user_id: p.userId,
    p_display_name: p.displayName,
    p_is_active: p.isActive,
    p_can_give_discounts: p.canGiveDiscounts,
    p_can_adjust_stock: p.canAdjustStock,
  });
  if (error) return { ok: false, message: friendlyDbError(error) };
  revalidatePath("/pos", "layout");
  return { ok: true, message: "Saved." };
}

/**
 * Gives a new staff member a login. Creating a sign-in needs the secret key
 * (Supabase's auth admin API), so this runs with it, after checking that the
 * person asking is the owner.
 */
export async function addStaff(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const { isOwner } = await requirePosUser();
  if (!isOwner) return OWNER_ONLY;
  const parsed = newStaffSchema.safeParse({
    displayName: formData.get("displayName") ?? "",
    email: formData.get("email") ?? "",
    password: formData.get("password") ?? "",
    canGiveDiscounts: bool(formData, "canGiveDiscounts"),
    canAdjustStock: bool(formData, "canAdjustStock"),
  });
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0].message };
  const p = parsed.data;

  let admin: ReturnType<typeof createAdminClient>;
  try {
    admin = createAdminClient();
  } catch {
    return { ok: false, message: "Adding people isn't set up on this server yet (the secret key is missing)." };
  }

  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email: p.email,
    password: p.password,
    email_confirm: true,
    user_metadata: { name: p.displayName },
  });
  if (createError || !created.user) {
    const taken = createError && /already|registered|exists/i.test(createError.message);
    return { ok: false, message: taken ? "This email already has an account." : "Could not create the login. Please try again." };
  }

  const { error } = await admin.from("admins").insert({
    user_id: created.user.id,
    role: "staff",
    display_name: p.displayName,
    can_give_discounts: p.canGiveDiscounts,
    can_adjust_stock: p.canAdjustStock,
  });
  if (error) {
    // Don't leave a login behind that can't be used.
    await admin.auth.admin.deleteUser(created.user.id);
    return { ok: false, message: "Could not add them. Please try again." };
  }

  revalidatePath("/pos/settings");
  return { ok: true, message: `${p.displayName} can now sign in at /pos with ${p.email}.` };
}
