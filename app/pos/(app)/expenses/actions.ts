"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { friendlyDbError } from "@/lib/pos/errors";
import { expenseSchema } from "@/lib/pos/schemas";
import { requireOwner } from "@/lib/server/pos/auth";
import type { ActionResult } from "../products/actions";

/** Record or change an expense. Owner only (checked again in the database). */
export async function saveExpense(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const { supabase } = await requireOwner();
  const parsed = expenseSchema.safeParse({
    id: formData.get("id") ?? "",
    spentOn: formData.get("spentOn") ?? "",
    categoryId: formData.get("categoryId") ?? "",
    amount: formData.get("amount") ?? "",
    method: formData.get("method") ?? "",
    payee: formData.get("payee") ?? "",
    note: formData.get("note") ?? "",
  });
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0].message };
  const e = parsed.data;

  const { error } = await supabase.rpc("pos_save_expense", {
    p: { id: e.id, spent_on: e.spentOn, category_id: e.categoryId, amount: e.amount, method: e.method, payee: e.payee, note: e.note },
  });
  if (error) return { ok: false, message: friendlyDbError(error, "The expense wasn't saved. Please try again.") };
  revalidatePath("/pos", "layout");
  return { ok: true, message: e.id ? "Expense changed." : "Expense recorded." };
}

/** Cancel a wrong expense: kept with the reason, no longer counted. */
export async function cancelExpense(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const { supabase } = await requireOwner();
  const parsed = z
    .object({ id: z.uuid(), reason: z.string().trim().min(1, "Say why it is cancelled.").max(300, "At most 300 characters.") })
    .safeParse({ id: formData.get("id"), reason: formData.get("reason") ?? "" });
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0].message };
  const { error } = await supabase.rpc("pos_cancel_expense", { p_id: parsed.data.id, p_reason: parsed.data.reason });
  if (error) return { ok: false, message: friendlyDbError(error) };
  revalidatePath("/pos", "layout");
  return { ok: true, message: "Expense cancelled." };
}

/** Add a kind of expense, or rename / hide / show one. */
export async function saveExpenseCategory(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const { supabase } = await requireOwner();
  const parsed = z
    .object({
      id: z.union([z.literal(""), z.coerce.number().int().min(1).max(32767)]),
      name: z.string().trim().min(1, "Give it a name.").max(40, "At most 40 characters."),
      active: z.enum(["yes", "no"]),
    })
    .safeParse({ id: formData.get("id") ?? "", name: formData.get("name") ?? "", active: formData.get("active") ?? "yes" });
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0].message };
  const { id, name, active } = parsed.data;
  const { error } = await supabase.rpc("pos_save_expense_category", {
    // null adds a new kind; the generated type doesn't know the function takes null.
    p_id: (id === "" ? null : id) as number,
    p_name: name,
    p_is_active: active === "yes",
  });
  if (error) return { ok: false, message: error.code === "23505" ? error.message : friendlyDbError(error) };
  revalidatePath("/pos/expenses");
  return { ok: true, message: id === "" ? `${name} added.` : "Saved." };
}
