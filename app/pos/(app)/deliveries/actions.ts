"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { friendlyDbError } from "@/lib/pos/errors";
import { DELIVERY_STATUSES } from "@/lib/pos/deliveries";
import { requirePosUser } from "@/lib/server/pos/auth";
import type { ActionResult } from "../products/actions";

const updateSchema = z.object({
  saleId: z.uuid(),
  status: z.enum(DELIVERY_STATUSES),
  // Only sent by the forms that ask for them; null leaves the saved value.
  rider: z.string().trim().max(60, "At most 60 characters.").nullable(),
  note: z.string().trim().max(300, "At most 300 characters.").nullable(),
});

const DONE: Record<(typeof DELIVERY_STATUSES)[number], string> = {
  to_deliver: "Back on the list to deliver.",
  out: "Out for delivery.",
  delivered: "Delivered.",
};

/** Send out (with the rider), delivered, or back to "to deliver". Anyone at the till. */
export async function updateDelivery(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const { supabase } = await requirePosUser();
  const field = (name: string) => (formData.has(name) ? String(formData.get(name) ?? "") : null);
  const parsed = updateSchema.safeParse({ saleId: formData.get("saleId"), status: formData.get("status"), rider: field("rider"), note: field("note") });
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0].message };
  const d = parsed.data;
  const { error } = await supabase.rpc("pos_update_delivery", {
    p_sale_id: d.saleId,
    p_status: d.status,
    p_rider: d.rider ?? undefined,
    p_note: d.note ?? undefined,
  });
  if (error) return { ok: false, message: friendlyDbError(error) };
  revalidatePath("/pos", "layout");
  return { ok: true, message: DONE[d.status] };
}
