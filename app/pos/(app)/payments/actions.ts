"use server";

import { revalidatePath } from "next/cache";
import { formatPesewas } from "@/lib/money";
import { friendlyDbError } from "@/lib/pos/errors";
import { z } from "zod";
import { markOrderPaidSchema, paymentSchema, voidSaleSchema } from "@/lib/pos/schemas";
import { requirePosUser } from "@/lib/server/pos/auth";
import type { ActionResult } from "../products/actions";

/**
 * "Mark paid" on a sale, "Record payment" to a supplier and "Record refund"
 * on a return. The database checks who may do which, and that it's never more
 * than is owed.
 */
export async function recordPayment(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const { supabase } = await requirePosUser();
  const parsed = paymentSchema.safeParse({
    kind: formData.get("kind"),
    id: formData.get("id"),
    method: formData.get("method"),
    amount: formData.get("amount") ?? "",
    note: formData.get("note") ?? "",
  });
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0].message };
  const p = parsed.data;

  const { data: left, error } = await supabase.rpc("pos_record_payment", {
    p_kind: p.kind,
    p_id: p.id,
    p_method: p.method,
    p_amount: p.amount,
    p_note: p.note || undefined,
  });
  if (error) {
    // The function says "more than the 18500 still owed": show it in cedis.
    const owed = /more than the (\d+) still/.exec(error.message);
    if (owed) return { ok: false, message: `That is more than the ${formatPesewas(Number(owed[1]))} still owed.` };
    return { ok: false, message: friendlyDbError(error) };
  }
  revalidatePath("/pos", "layout");
  return { ok: true, message: left === 0 ? "Paid in full." : `Saved. ${formatPesewas(left)} still owed.` };
}

/** Owner: cancels a completed sale and puts its items back on the shelf. */
export async function voidSale(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const { supabase, isOwner } = await requirePosUser();
  if (!isOwner) return { ok: false, message: "Only the owner can cancel a sale." };
  const parsed = voidSaleSchema.safeParse({ saleId: formData.get("saleId"), reason: formData.get("reason") ?? "" });
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0].message };

  const { error } = await supabase.rpc("pos_void_sale", { p_sale_id: parsed.data.saleId, p_reason: parsed.data.reason });
  if (error) return { ok: false, message: friendlyDbError(error) };
  revalidatePath("/pos", "layout");
  return { ok: true, message: "Sale cancelled. Its items are back on the shelf count." };
}

/**
 * "Mark as paid" on a website order: the database checks the shelf, takes the
 * items off it, records the payment and sets the order to paid.
 */
export async function markOrderPaid(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const { supabase } = await requirePosUser();
  const parsed = markOrderPaidSchema.safeParse({
    saleId: formData.get("saleId"),
    method: formData.get("method"),
    cashReceived: formData.get("cashReceived") ?? "",
  });
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0].message };
  const p = parsed.data;

  const { data, error } = await supabase.rpc("pos_mark_order_paid", {
    p_sale_id: p.saleId,
    p_method: p.method,
    p_cash_received: p.method === "cash" && p.cashReceived !== null ? p.cashReceived : undefined,
  });
  if (error) return { ok: false, message: friendlyDbError(error) };
  revalidatePath("/pos", "layout");
  revalidatePath("/admin", "layout");
  const change = data?.[0]?.change_given ?? 0;
  return { ok: true, message: change > 0 ? `Paid, stock updated. Give ${formatPesewas(change)} change.` : "Paid, stock updated." };
}

/** A website basket that won't be paid: cancels the sale and the order. */
export async function cancelWebsiteOrder(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const { supabase } = await requirePosUser();
  const id = z.uuid().safeParse(formData.get("saleId"));
  if (!id.success) return { ok: false, message: "Unknown order." };
  const { error } = await supabase.rpc("pos_cancel_website_order", { p_sale_id: id.data });
  if (error) return { ok: false, message: friendlyDbError(error) };
  revalidatePath("/pos", "layout");
  revalidatePath("/admin", "layout");
  return { ok: true, message: "Order cancelled." };
}
