"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { formatPesewas, parseCedis } from "@/lib/money";
import { MONEY_ACCOUNTS, MONEY_MOVE_KINDS } from "@/lib/pos/money";
import { friendlyDbError } from "@/lib/pos/errors";
import { requireOwner } from "@/lib/server/pos/auth";
import type { ActionResult } from "../products/actions";

const amountSchema = (message: string) =>
  z.string().transform((value, ctx) => {
    const pesewas = parseCedis(value);
    if (pesewas === null) {
      ctx.addIssue({ code: "custom", message });
      return z.NEVER;
    }
    return pesewas;
  });

/** Count an account: what is really there now. */
export async function countMoney(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const { supabase } = await requireOwner();
  const parsed = z
    .object({
      account: z.enum(MONEY_ACCOUNTS, { message: "Choose cash, MoMo or bank." }),
      counted: amountSchema("Enter the amount there now, like 1500 or 0."),
      note: z.string().trim().max(300, "At most 300 characters."),
    })
    .safeParse({ account: formData.get("account"), counted: formData.get("counted") ?? "", note: formData.get("note") ?? "" });
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0].message };
  const { account, counted, note } = parsed.data;

  const { count: before } = await supabase.from("money_checks").select("id", { count: "exact", head: true }).eq("account", account);
  const { data: diff, error } = await supabase.rpc("pos_count_money", { p_account: account, p_counted: counted, p_note: note });
  if (error) return { ok: false, message: friendlyDbError(error) };
  revalidatePath("/pos/money");
  if (!before) return { ok: true, message: "Counted. From now on the app keeps track of it." };
  return {
    ok: true,
    message: diff === 0 ? "Counted: it matches." : diff < 0 ? `Counted: ${formatPesewas(-diff)} short.` : `Counted: ${formatPesewas(diff)} over.`,
  };
}

/** Move money between accounts, take some out for yourself, or put some in. */
export async function saveMoneyMove(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const { supabase } = await requireOwner();
  const parsed = z
    .object({
      kind: z.enum(MONEY_MOVE_KINDS),
      from: z.union([z.literal(""), z.enum(MONEY_ACCOUNTS)]),
      to: z.union([z.literal(""), z.enum(MONEY_ACCOUNTS)]),
      amount: amountSchema("Enter the amount like 500 or 12.50.").refine((p) => p > 0, "Enter the amount."),
      movedOn: z.iso.date("Pick the day."),
      note: z.string().trim().max(300, "At most 300 characters."),
    })
    .safeParse({
      kind: formData.get("kind"),
      from: formData.get("from") ?? "",
      to: formData.get("to") ?? "",
      amount: formData.get("amount") ?? "",
      movedOn: formData.get("movedOn") ?? "",
      note: formData.get("note") ?? "",
    });
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0].message };
  const m = parsed.data;
  const { error } = await supabase.rpc("pos_save_money_move", {
    p: { kind: m.kind, from_account: m.from, to_account: m.to, amount: m.amount, moved_on: m.movedOn, note: m.note },
  });
  if (error) return { ok: false, message: friendlyDbError(error) };
  revalidatePath("/pos", "layout");
  return { ok: true, message: m.kind === "transfer" ? "Money moved." : m.kind === "owner_out" ? "Recorded as taken out." : "Recorded as put in." };
}

/** Cancel a wrong money move. */
export async function cancelMoneyMove(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const { supabase } = await requireOwner();
  const parsed = z
    .object({ id: z.uuid(), reason: z.string().trim().min(1, "Say why it is cancelled.").max(300, "At most 300 characters.") })
    .safeParse({ id: formData.get("id"), reason: formData.get("reason") ?? "" });
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0].message };
  const { error } = await supabase.rpc("pos_cancel_money_move", { p_id: parsed.data.id, p_reason: parsed.data.reason });
  if (error) return { ok: false, message: friendlyDbError(error) };
  revalidatePath("/pos", "layout");
  return { ok: true, message: "Cancelled." };
}
