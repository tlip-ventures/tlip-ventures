"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { normaliseGhanaPhone } from "@/lib/phone";
import { friendlyDbError } from "@/lib/pos/errors";
import { buildReceiptMessage, receiptWhatsappUrl } from "@/lib/pos/receipt";
import { completeSaleSchema, newCustomerSchema, type CompleteSaleInput } from "@/lib/pos/schemas";
import { requirePosUser } from "@/lib/server/pos/auth";
import type { CustomerChoice } from "@/lib/pos/basket";
import { findTileByCode, getSaleReceipt, searchCustomers, type SellTile } from "@/lib/server/pos/sell";

export type CompletedSale = {
  saleId: string;
  code: string;
  total: number;
  change: number | null;
  items: number;
  whatsappUrl: string;
};

export type CompleteSaleResult = { ok: true; sale: CompletedSale } | { ok: false; message: string };

/**
 * Saves a sale. Only items and quantities come from the browser; the database
 * works out every price, checks the shelf and the discount permission, and
 * takes the items off the shelf in the same transaction.
 */
export async function completeSale(input: CompleteSaleInput): Promise<CompleteSaleResult> {
  const { supabase } = await requirePosUser();
  const parsed = completeSaleSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0].message };
  const s = parsed.data;

  const { data, error } = await supabase.rpc("pos_complete_sale", {
    p_items: s.items.map((i) => ({ variant_id: i.variantId, qty: i.qty })),
    // The function treats null as a walk-in customer; the generated type doesn't know it accepts null.
    p_customer_id: s.customerId as string,
    p_discount: s.discount,
    p_method: s.method,
    p_cash_received: s.method === "cash" && s.cashReceived !== null ? s.cashReceived : undefined,
  });
  if (error || !data?.[0]) return { ok: false, message: friendlyDbError(error, "The sale wasn't saved. Please try again.") };
  const saved = data[0];

  // The receipt is built from what was saved, not from the basket on screen.
  const receipt = await getSaleReceipt(saved.sale_id);
  const message = receipt
    ? buildReceiptMessage({
        storeName: receipt.shop.name,
        code: receipt.code,
        createdAt: receipt.createdAt,
        lines: receipt.lines,
        subtotal: receipt.subtotal,
        discount: receipt.discount,
        total: receipt.total,
        payments: receipt.payments,
        owed: receipt.owed,
        footer: receipt.shop.footer,
      })
    : `Tlip Ventures receipt\nSale ${saved.code}`;

  revalidatePath("/pos", "layout");
  return {
    ok: true,
    sale: {
      saleId: saved.sale_id,
      code: saved.code,
      total: saved.total,
      change: saved.change_given,
      items: s.items.reduce((n, i) => n + i.qty, 0),
      whatsappUrl: receiptWhatsappUrl(receipt?.customer?.phone ?? null, message),
    },
  };
}

/** A scanned barcode or typed code: the matching product, or null to search by name instead. */
export async function findProductByCode(code: string): Promise<SellTile | null> {
  await requirePosUser();
  const parsed = z.string().trim().min(1).max(64).safeParse(code);
  if (!parsed.success) return null;
  return findTileByCode(parsed.data);
}

export async function findCustomers(query: string): Promise<CustomerChoice[]> {
  await requirePosUser();
  const parsed = z.string().max(100).safeParse(query);
  if (!parsed.success) return [];
  return searchCustomers(parsed.data);
}

export type AddCustomerResult = { ok: true; customer: CustomerChoice } | { ok: false; message: string };

export async function addCustomer(input: { name: string; phone: string }): Promise<AddCustomerResult> {
  const { supabase } = await requirePosUser();
  const parsed = newCustomerSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0].message };

  let phone: string | null = null;
  if (parsed.data.phone) {
    phone = normaliseGhanaPhone(parsed.data.phone);
    if (!phone) return { ok: false, message: "Enter a Ghana number like 024 123 4567, or leave it empty." };
  }

  const { data: id, error } = await supabase.rpc("pos_create_customer", {
    p_name: parsed.data.name,
    p_phone: phone ?? undefined,
  });
  if (error) {
    return { ok: false, message: error.code === "23505" ? error.message : friendlyDbError(error, "Could not add the customer.") };
  }
  return { ok: true, customer: { id, name: parsed.data.name, phone } };
}
