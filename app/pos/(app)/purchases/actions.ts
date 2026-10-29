"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { normaliseGhanaPhone } from "@/lib/phone";
import { friendlyDbError } from "@/lib/pos/errors";
import { fieldErrors, purchaseSchema, type PurchaseInput } from "@/lib/pos/schemas";
import { requirePosUser } from "@/lib/server/pos/auth";
import { searchPurchaseProducts, searchSuppliers, type PurchaseProduct } from "@/lib/server/pos/records";
import type { ActionResult } from "../products/actions";

const OWNER_ONLY = { ok: false, message: "Only the owner can record purchases." } as const;

export type SupplierChoice = { id: string; name: string; phone: string | null };

export async function findSuppliers(query: string): Promise<SupplierChoice[]> {
  const { isOwner } = await requirePosUser();
  if (!isOwner) return [];
  return searchSuppliers(z.string().max(100).catch("").parse(query));
}

export async function addSupplier(input: { name: string; phone: string }): Promise<{ ok: true; supplier: SupplierChoice } | { ok: false; message: string }> {
  const { supabase, isOwner } = await requirePosUser();
  if (!isOwner) return OWNER_ONLY;
  const parsed = z
    .object({ name: z.string().trim().min(1, "Enter the supplier's name.").max(100), phone: z.string().trim().max(30) })
    .safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0].message };
  let phone: string | null = null;
  if (parsed.data.phone) {
    phone = normaliseGhanaPhone(parsed.data.phone);
    if (!phone) return { ok: false, message: "Enter a Ghana number like 024 123 4567, or leave it empty." };
  }
  const { data: id, error } = await supabase.rpc("pos_create_supplier", { p_name: parsed.data.name, p_phone: phone ?? undefined });
  if (error) return { ok: false, message: error.code === "23505" ? error.message : friendlyDbError(error) };
  revalidatePath("/pos/suppliers");
  return { ok: true, supplier: { id, name: parsed.data.name, phone } };
}

export async function findPurchaseProducts(query: string): Promise<PurchaseProduct[]> {
  const { isOwner } = await requirePosUser();
  if (!isOwner) return [];
  return searchPurchaseProducts(z.string().max(100).catch("").parse(query));
}

export type SavePurchaseResult = { ok: true; id: string } | { ok: false; message: string; errors?: Record<string, string> };

export async function savePurchase(input: PurchaseInput): Promise<SavePurchaseResult> {
  const { supabase, isOwner } = await requirePosUser();
  if (!isOwner) return OWNER_ONLY;
  const parsed = purchaseSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: "Please fix the highlighted fields.", errors: fieldErrors(parsed.error) };
  const p = parsed.data;

  const { data, error } = await supabase.rpc("pos_save_purchase", {
    p: {
      supplier_id: p.supplierId,
      received: p.received,
      note: p.note,
      lines: p.lines.map((l) => ({ variant_id: l.variantId, qty: l.qty, unit_cost: l.unitCost })),
      payment: p.paidNow ? { method: p.method, amount: p.paidNow } : null,
    },
  });
  if (error || !data?.[0]) return { ok: false, message: friendlyDbError(error, "The purchase wasn't saved. Please try again.") };
  revalidatePath("/pos", "layout");
  return { ok: true, id: data[0].purchase_id };
}

/** Owner: the delivery arrived; put it on the shelf. */
export async function receivePurchase(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const { supabase, isOwner } = await requirePosUser();
  if (!isOwner) return OWNER_ONLY;
  const id = z.uuid().safeParse(formData.get("purchaseId"));
  if (!id.success) return { ok: false, message: "Unknown purchase." };
  const { error } = await supabase.rpc("pos_receive_purchase", { p_purchase_id: id.data });
  if (error) return { ok: false, message: friendlyDbError(error) };
  revalidatePath("/pos", "layout");
  return { ok: true, message: "Received. The items are on the shelf count." };
}

export async function cancelPurchase(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const { supabase, isOwner } = await requirePosUser();
  if (!isOwner) return OWNER_ONLY;
  const id = z.uuid().safeParse(formData.get("purchaseId"));
  if (!id.success) return { ok: false, message: "Unknown purchase." };
  const { error } = await supabase.rpc("pos_cancel_purchase", { p_purchase_id: id.data });
  if (error) return { ok: false, message: friendlyDbError(error) };
  revalidatePath("/pos", "layout");
  return { ok: true, message: "Purchase cancelled." };
}

/** "New supplier" on the suppliers page. */
export async function addSupplierFromForm(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const result = await addSupplier({ name: String(formData.get("name") ?? ""), phone: String(formData.get("phone") ?? "") });
  return result.ok ? { ok: true, message: `${result.supplier.name} added.` } : result;
}
