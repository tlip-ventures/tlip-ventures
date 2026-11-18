"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { friendlyDbError } from "@/lib/pos/errors";
import { normaliseGhanaPhone } from "@/lib/phone";
import { requirePosUser } from "@/lib/server/pos/auth";
import type { ActionResult } from "../products/actions";

const customerSchema = z.object({
  customerId: z.uuid(),
  name: z.string().trim().min(1, "Enter the customer's name.").max(100, "At most 100 characters."),
  // Optional; checked and stored as 233XXXXXXXXX below.
  phone: z.string().trim().max(30, "Enter a Ghana number like 024 123 4567."),
  notes: z.string().trim().max(500, "Keep the note under 500 characters."),
});

/** Edit a customer's name, phone and note. Any shop user, like adding one at the till. */
export async function updateCustomer(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const { supabase } = await requirePosUser();
  const parsed = customerSchema.safeParse({
    customerId: formData.get("customerId"),
    name: formData.get("name") ?? "",
    phone: formData.get("phone") ?? "",
    notes: formData.get("notes") ?? "",
  });
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0].message };
  const c = parsed.data;

  let phone: string | null = null;
  if (c.phone) {
    phone = normaliseGhanaPhone(c.phone);
    if (!phone) return { ok: false, message: "Enter a Ghana number like 024 123 4567, or leave it empty." };
  }

  const { error } = await supabase.rpc("pos_update_customer", {
    p_customer_id: c.customerId,
    p_name: c.name,
    // null removes the number or the note; the generated type doesn't know the function takes null.
    p_phone: phone as string,
    p_notes: (c.notes || null) as string,
  });
  if (error) return { ok: false, message: error.code === "23505" ? error.message : friendlyDbError(error, "The customer wasn't saved. Please try again.") };
  // Names show on sales, receipts, deliveries and reservations too.
  revalidatePath("/pos", "layout");
  return { ok: true, message: `${c.name} saved.` };
}
