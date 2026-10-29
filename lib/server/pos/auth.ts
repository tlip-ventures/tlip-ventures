import "server-only";
import { redirect } from "next/navigation";
import { cache } from "react";
import { personName } from "@/lib/pos/format";
import { createClient } from "@/lib/supabase/server";

export type PosUser = {
  supabase: Awaited<ReturnType<typeof createClient>>;
  userId: string;
  role: "owner" | "staff";
  isOwner: boolean;
  name: string;
  /** The owner can always do both; staff only when the owner switched it on. */
  canGiveDiscounts: boolean;
  canAdjustStock: boolean;
};

/**
 * The signed-in owner or staff member, or a redirect to /pos/login. Call at
 * the top of every /pos page and server action. Queries made with the returned
 * client run as this person, so RLS and the database's own permission checks
 * apply as well: hiding a button is never the only guard.
 */
export const requirePosUser = cache(async (): Promise<PosUser> => {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub;
  if (!userId) redirect("/pos/login");

  // RLS lets a signed-in user read their own admins row.
  const { data: row, error } = await supabase
    .from("admins")
    .select("role, display_name, is_active, can_give_discounts, can_adjust_stock")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(`Could not check access: ${error.message}`);
  if (!row || !row.is_active) redirect("/pos/login?error=no-access");

  const isOwner = row.role === "owner";
  return {
    supabase,
    userId,
    role: isOwner ? "owner" : "staff",
    isOwner,
    name: personName(row.display_name, row.role),
    canGiveDiscounts: isOwner || row.can_give_discounts,
    canAdjustStock: isOwner || row.can_adjust_stock,
  };
});

/** For owner-only pages: staff are sent back to the start page. */
export async function requireOwner(): Promise<PosUser> {
  const user = await requirePosUser();
  if (!user.isOwner) redirect("/pos");
  return user;
}
