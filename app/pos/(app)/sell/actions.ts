"use server";

import { z } from "zod";
import { normaliseGhanaPhone } from "@/lib/phone";
import { BAD_RIDER_PHONE, deliveryForDb } from "@/lib/pos/deliveries";
import { friendlyDbError } from "@/lib/pos/errors";
import { buildReceiptMessage, receiptWhatsappUrl } from "@/lib/pos/receipt";
import { completeSaleSchema, holdSaleSchema, newCustomerSchema, reserveSaleSchema, type CompleteSaleInput, type HoldSaleInput, type ReserveSaleInput } from "@/lib/pos/schemas";
import type { Json } from "@/lib/database.types";
import { requirePosUser } from "@/lib/server/pos/auth";
import type { CustomerChoice } from "@/lib/pos/basket";
import { refreshPosAndShop } from "@/lib/server/pos/refresh";
import { findTileByCode, getSaleReceipt, searchCustomers, type SellTile } from "@/lib/server/pos/sell";

export type CompletedSale = {
  saleId: string;
  code: string;
  total: number;
  change: number | null;
  items: number;
  whatsappUrl: string;
  delivery: boolean;
  /** Put on hold: what is still to pay (the sale completes itself when it is paid). */
  onHold?: { owed: number };
  /** Reserved for later: what is still to pay, and the agreed date ("2026-11-14") if any. */
  reserved?: { owed: number; until: string | null };
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

  const delivery = deliveryForDb(s.delivery);
  if (delivery === "bad phone") return { ok: false, message: BAD_RIDER_PHONE };

  const { data, error } = await supabase.rpc("pos_complete_sale", {
    p_items: s.items.map((i) => ({ variant_id: i.variantId, qty: i.qty, choice: i.choice })),
    // The function treats null as a walk-in customer; the generated type doesn't know it accepts null.
    p_customer_id: s.customerId as string,
    p_discount: s.discount,
    p_method: s.method,
    p_cash_received: (s.method === "cash" || s.method === "split") && s.cashReceived !== null ? s.cashReceived : undefined,
    // Always sent (null unless split): it picks the version of the function that takes split payments.
    p_payments: s.method === "split" ? (s.payments ?? []) : null,
    // Always sent: it picks the version of the function that knows wholesale.
    p_wholesale: s.wholesale,
    // Always sent (null when the customer takes the goods): it picks the version of the function with deliveries.
    p_delivery: delivery,
  });
  if (error || !data?.[0]) return { ok: false, message: friendlyDbError(error, "The sale wasn't saved. Please try again.") };
  const saved = data[0];

  const whatsappUrl = await afterSave(supabase, saved, s.invoiceId);
  return {
    ok: true,
    sale: {
      saleId: saved.sale_id,
      code: saved.code,
      total: saved.total,
      change: saved.change_given,
      items: s.items.reduce((n, i) => n + i.qty, 0),
      whatsappUrl,
      delivery: delivery !== null,
    },
  };
}

/**
 * "Put on hold": saves the basket like a sale (prices, shelf, delivery) for a
 * customer with what they pay now; its items come off the shelf at once and
 * the rest is owed. The last payment (Mark paid) completes it.
 */
export async function holdSale(input: HoldSaleInput): Promise<CompleteSaleResult> {
  const { supabase } = await requirePosUser();
  const parsed = holdSaleSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0].message };
  const s = parsed.data;

  const delivery = deliveryForDb(s.delivery);
  if (delivery === "bad phone") return { ok: false, message: BAD_RIDER_PHONE };
  const cashPart = s.payments.some((p) => p.method === "cash");

  const { data, error } = await supabase.rpc("pos_hold_sale", {
    p_items: s.items.map((i) => ({ variant_id: i.variantId, qty: i.qty, choice: i.choice })),
    p_customer_id: s.customerId,
    p_discount: s.discount,
    p_payments: s.payments,
    p_wholesale: s.wholesale,
    // The function takes null for "no delivery"; the generated type doesn't know it.
    p_delivery: delivery as unknown as Json,
    p_cash_received: cashPart && s.cashReceived !== null ? s.cashReceived : undefined,
  });
  if (error || !data?.[0]) return { ok: false, message: friendlyDbError(error, "The sale wasn't put on hold. Please try again.") };
  const saved = data[0];

  const whatsappUrl = await afterSave(supabase, saved, s.invoiceId);
  return {
    ok: true,
    sale: {
      saleId: saved.sale_id,
      code: saved.code,
      total: saved.total,
      change: saved.change_given,
      items: s.items.reduce((n, i) => n + i.qty, 0),
      whatsappUrl,
      delivery: delivery !== null,
      onHold: { owed: saved.owed },
    },
  };
}

/**
 * "Reserve for later": saves the basket like a sale for a customer, kept for
 * them to pick up or have delivered later (an optional date). Paid in full,
 * its items come off the shelf now; otherwise they stay on the shelf until
 * the last payment, or until it is collected or sent out.
 */
export async function reserveSale(input: ReserveSaleInput): Promise<CompleteSaleResult> {
  const { supabase } = await requirePosUser();
  const parsed = reserveSaleSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0].message };
  const s = parsed.data;

  const delivery = deliveryForDb(s.delivery);
  if (delivery === "bad phone") return { ok: false, message: BAD_RIDER_PHONE };
  const cashPart = s.payments.some((p) => p.method === "cash");

  const { data, error } = await supabase.rpc("pos_reserve_sale", {
    p_items: s.items.map((i) => ({ variant_id: i.variantId, qty: i.qty, choice: i.choice })),
    p_customer_id: s.customerId,
    p_discount: s.discount,
    p_payments: s.payments,
    p_wholesale: s.wholesale,
    // The function takes null for "no delivery" and "exact cash"; the generated type doesn't know it.
    p_delivery: delivery as unknown as Json,
    p_cash_received: (cashPart && s.cashReceived !== null ? s.cashReceived : null) as number,
    p_note: null as unknown as string,
    p_reserved_until: s.reservedUntil ?? undefined,
  });
  if (error || !data?.[0]) return { ok: false, message: friendlyDbError(error, "The order wasn't reserved. Please try again.") };
  const saved = data[0];

  const whatsappUrl = await afterSave(supabase, saved, s.invoiceId);
  return {
    ok: true,
    sale: {
      saleId: saved.sale_id,
      code: saved.code,
      total: saved.total,
      change: saved.change_given,
      items: s.items.reduce((n, i) => n + i.qty, 0),
      whatsappUrl,
      delivery: delivery !== null,
      reserved: { owed: saved.owed, until: s.reservedUntil },
    },
  };
}

/** After a sale is saved (completed or held): close its invoice, refresh the pages, and the WhatsApp receipt link. */
async function afterSave(
  supabase: Awaited<ReturnType<typeof requirePosUser>>["supabase"],
  saved: { sale_id: string; code: string },
  invoiceId: string | null | undefined,
): Promise<string> {
  // Sold from an invoice: close it. The sale is saved either way.
  if (invoiceId) {
    const { error: invoiceError } = await supabase.rpc("pos_invoice_sold", { p_invoice_id: invoiceId, p_sale_id: saved.sale_id });
    if (invoiceError) console.error(`Sale ${saved.code} saved, but its invoice was not marked sold: ${invoiceError.message}`);
  }

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
        wholesale: receipt.wholesale,
        delivery: receipt.delivery,
      })
    : `Tlip Ventures receipt\nSale ${saved.code}`;

  refreshPosAndShop();
  return receiptWhatsappUrl(receipt?.customer?.phone ?? receipt?.delivery?.phone ?? null, message);
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
