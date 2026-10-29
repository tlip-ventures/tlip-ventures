import "server-only";
import { redirect } from "next/navigation";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";

/**
 * The signed-in admin, or a redirect to the login page. Call at the top of
 * every admin page and server action. Queries made with the returned client
 * run as this user, so RLS (private.is_admin()) applies as a second check.
 */
export const requireAdmin = cache(async () => {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub;
  if (!userId) redirect("/admin/login");

  // RLS lets a signed-in user read only their own admins row.
  const { data: admin, error } = await supabase.from("admins").select("role").eq("user_id", userId).maybeSingle();
  if (error) throw new Error(`Could not check admin access: ${error.message}`);
  if (!admin) redirect("/admin/login?error=not-admin");

  return {
    supabase,
    userId,
    email: typeof data.claims.email === "string" ? data.claims.email : null,
    role: admin.role,
  };
});
