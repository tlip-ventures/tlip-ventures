"use server";

import { z } from "zod";
import { friendlyDbError } from "@/lib/pos/errors";
import { requirePosUser } from "@/lib/server/pos/auth";
import { refreshPosAndShop } from "@/lib/server/pos/refresh";
import type { ActionResult } from "../products/actions";

/** The customer collected a reserved order. Not paid in full: its items leave the shelf now and the rest is owed. */
export async function markCollected(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const { supabase } = await requirePosUser();
  const parsed = z.uuid().safeParse(formData.get("saleId"));
  if (!parsed.success) return { ok: false, message: "This order was not found." };
  const { data: status, error } = await supabase.rpc("pos_mark_collected", { p_sale_id: parsed.data });
  if (error) return { ok: false, message: friendlyDbError(error) };
  // Stock may have changed: refresh the shop too.
  refreshPosAndShop();
  return {
    ok: true,
    message: status === "on_hold" ? "Collected. The rest is still owed: the sale is On hold until it is paid." : "Collected.",
  };
}

const dateSchema = z.object({
  saleId: z.uuid(),
  // Empty clears the date.
  until: z.union([z.literal(""), z.iso.date("Pick the date, or leave it empty.")]),
});

/** Change (or clear) the agreed pickup or delivery date. */
export async function setReservedUntil(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const { supabase } = await requirePosUser();
  const parsed = dateSchema.safeParse({ saleId: formData.get("saleId"), until: formData.get("until") ?? "" });
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0].message };
  const { error } = await supabase.rpc("pos_set_reserved_until", {
    p_sale_id: parsed.data.saleId,
    // null clears it; the generated type doesn't know the function takes null.
    p_date: (parsed.data.until || null) as string,
  });
  if (error) return { ok: false, message: friendlyDbError(error) };
  refreshPosAndShop();
  return { ok: true, message: parsed.data.until ? "Date changed." : "Date cleared." };
}
