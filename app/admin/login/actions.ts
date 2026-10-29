"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { safeAdminPath } from "@/lib/admin-paths";
import { createClient } from "@/lib/supabase/server";

const signInSchema = z.object({
  email: z.email("Enter your email address.").max(200),
  password: z.string().min(1, "Enter your password.").max(200),
  next: z.string().max(500).optional(),
});

export type SignInState = { error: string | null; email: string };

export async function signIn(_prev: SignInState, formData: FormData): Promise<SignInState> {
  const parsed = signInSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
    next: formData.get("next") ?? undefined,
  });
  const email = String(formData.get("email") ?? "");
  if (!parsed.success) return { error: parsed.error.issues[0].message, email };

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.password,
  });
  if (error || !data.user) {
    // Same message for unknown email and wrong password.
    return { error: "Wrong email or password.", email };
  }

  const { data: admin } = await supabase.from("admins").select("role, is_active").eq("user_id", data.user.id).maybeSingle();
  if (!admin || admin.role !== "owner" || !admin.is_active) {
    await supabase.auth.signOut();
    return { error: "This account does not have admin access.", email };
  }

  redirect(safeAdminPath(parsed.data.next));
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/admin/login");
}
