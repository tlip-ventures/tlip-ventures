"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { ORDER_STATUSES } from "@/lib/order-status";
import { requireAdmin } from "@/lib/server/admin";

const statusSchema = z.object({
  orderId: z.uuid(),
  status: z.enum(ORDER_STATUSES),
});

export async function updateOrderStatus(formData: FormData) {
  const { supabase } = await requireAdmin();
  const parsed = statusSchema.safeParse({ orderId: formData.get("orderId"), status: formData.get("status") });
  if (!parsed.success) throw new Error("Invalid order status update.");

  const { error } = await supabase
    .from("orders")
    .update({ status: parsed.data.status })
    .eq("id", parsed.data.orderId);
  // TV002: the website sync refuses a status that must be set in Stock and sales (see the order page).
  if (error) throw new Error(error.code === "TV002" ? error.message : `Could not update the order: ${error.message}`);

  revalidatePath("/admin", "layout");
}
