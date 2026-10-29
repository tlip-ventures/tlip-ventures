"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { friendlyDbError } from "@/lib/pos/errors";
import { countLineSchema } from "@/lib/pos/schemas";
import { requirePosUser } from "@/lib/server/pos/auth";
import { refreshPosAndShop } from "@/lib/server/pos/refresh";
import type { ActionResult } from "../products/actions";

const NOT_ALLOWED = { ok: false, message: "You are not allowed to count stock. Ask the owner to switch it on for you." } as const;

export async function startCount(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const { supabase, canAdjustStock } = await requirePosUser();
  if (!canAdjustStock) return NOT_ALLOWED;
  const note = z.string().trim().max(300).safeParse(formData.get("note") ?? "");
  if (!note.success) return { ok: false, message: "Keep the note under 300 characters." };

  const { error } = await supabase.rpc("pos_start_count", { p_note: note.data });
  if (error) return { ok: false, message: friendlyDbError(error) };
  revalidatePath("/pos/count");
  return { ok: true, message: "Count started." };
}

/** Saves one counted number (empty clears it). */
export async function saveCountLine(countId: string, variantId: string, counted: string): Promise<ActionResult> {
  const { supabase, canAdjustStock } = await requirePosUser();
  if (!canAdjustStock) return NOT_ALLOWED;
  const parsed = countLineSchema.safeParse({ countId, variantId, counted });
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0].message };

  const { error } = await supabase.rpc("pos_save_count_line", {
    p_count_id: parsed.data.countId,
    p_variant_id: parsed.data.variantId,
    // null clears the line; the generated type doesn't know the column accepts it.
    p_counted: parsed.data.counted as number,
  });
  if (error) return { ok: false, message: friendlyDbError(error) };
  revalidatePath("/pos/count");
  return { ok: true, message: parsed.data.counted === null ? "Cleared." : "Saved." };
}

export async function finishCount(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const { supabase, canAdjustStock } = await requirePosUser();
  if (!canAdjustStock) return NOT_ALLOWED;
  const id = z.uuid().safeParse(formData.get("countId"));
  if (!id.success) return { ok: false, message: "Unknown stock count." };

  const { data: changed, error } = await supabase.rpc("pos_finish_count", { p_count_id: id.data });
  if (error) return { ok: false, message: friendlyDbError(error) };
  refreshPosAndShop();
  // The count is gone from the page once finished, so the result goes in the address.
  redirect(`/pos/count?finished=${changed}`);
}

export async function cancelCount(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const { supabase, canAdjustStock } = await requirePosUser();
  if (!canAdjustStock) return NOT_ALLOWED;
  const id = z.uuid().safeParse(formData.get("countId"));
  if (!id.success) return { ok: false, message: "Unknown stock count." };

  const { error } = await supabase.rpc("pos_cancel_count", { p_count_id: id.data });
  if (error) return { ok: false, message: friendlyDbError(error) };
  revalidatePath("/pos/count");
  redirect("/pos/count?cancelled=1");
}
