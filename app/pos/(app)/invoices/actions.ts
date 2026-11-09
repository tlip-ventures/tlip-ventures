"use server";

import { z } from "zod";
import { BAD_RIDER_PHONE, deliveryForDb } from "@/lib/pos/deliveries";
import { friendlyDbError } from "@/lib/pos/errors";
import { createInvoiceSchema, type CreateInvoiceInput } from "@/lib/pos/schemas";
import { requirePosUser } from "@/lib/server/pos/auth";
import { getInvoiceForTill, type InvoiceForTill } from "@/lib/server/pos/invoices";
import type { ActionResult } from "../products/actions";

export type CreateInvoiceResult = { ok: true; id: string; code: string } | { ok: false; message: string };

/**
 * "Make invoice" at the till. Only items and quantities come from the browser:
 * the database prices every line. Nothing comes off the shelf.
 */
export async function createInvoice(input: CreateInvoiceInput): Promise<CreateInvoiceResult> {
  const { supabase } = await requirePosUser();
  const parsed = createInvoiceSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0].message };
  const s = parsed.data;

  const delivery = deliveryForDb(s.delivery);
  if (delivery === "bad phone") return { ok: false, message: BAD_RIDER_PHONE };

  const { data, error } = await supabase.rpc("pos_create_invoice", {
    p_items: s.items.map((i) => ({ variant_id: i.variantId, qty: i.qty })),
    // The function treats null as no customer; the generated type doesn't know it accepts null.
    p_customer_id: s.customerId as string,
    p_discount: s.discount,
    p_delivery: delivery,
    p_valid_until: s.validUntil,
  });
  if (error || !data?.[0]) return { ok: false, message: friendlyDbError(error, "The invoice wasn't saved. Please try again.") };
  return { ok: true, id: data[0].invoice_id, code: data[0].code };
}

export async function cancelInvoice(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const { supabase } = await requirePosUser();
  const parsed = z.uuid().safeParse(formData.get("invoiceId"));
  if (!parsed.success) return { ok: false, message: "This invoice was not found." };
  const { error } = await supabase.rpc("pos_cancel_invoice", { p_invoice_id: parsed.data });
  if (error) return { ok: false, message: friendlyDbError(error) };
  return { ok: true, message: "Invoice cancelled." };
}

export type LoadInvoiceResult = { ok: true; till: InvoiceForTill } | { ok: false; message: string };

/** "Sell this invoice": its lines at today's prices and shelf counts, for the till's basket. */
export async function loadInvoiceForTill(invoiceId: string): Promise<LoadInvoiceResult> {
  await requirePosUser();
  const parsed = z.uuid().safeParse(invoiceId);
  if (!parsed.success) return { ok: false, message: "This invoice was not found." };
  const till = await getInvoiceForTill(parsed.data);
  if ("error" in till) return { ok: false, message: till.error };
  return { ok: true, till };
}
