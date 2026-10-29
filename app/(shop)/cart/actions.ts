"use server";

import { headers } from "next/headers";
import type { LineProblem } from "@/lib/cart";
import {
  checkoutSchema,
  fieldErrors,
  MAX_ORDERS_PER_PHONE_PER_HOUR,
  type CheckoutField,
  type CheckoutInput,
} from "@/lib/checkout";
import { publicEnv } from "@/lib/env";
import { lineTotal, sumPesewas } from "@/lib/money";
import { getCartVariants, getSettings } from "@/lib/server/catalogue";
import { checkoutAllowedForIp } from "@/lib/server/rate-limit";
import { createAdminClient } from "@/lib/server/supabase-admin";
import { buildOrderMessage, whatsappUrl } from "@/lib/whatsapp";

/** What the browser needs to hand the order off to WhatsApp. Includes the customer's own name and phone. */
export type PlacedOrder = {
  orderCode: string;
  orderUrl: string;
  message: string;
  whatsappNumber: string;
  whatsappUrl: string;
};

export type PlaceOrderResult =
  | { ok: true; order: PlacedOrder }
  | {
      ok: false;
      message: string;
      fieldErrors?: Partial<Record<CheckoutField | "items", string>>;
      /** Cart lines that can't be ordered, by variant id. */
      problems?: Record<string, LineProblem>;
    };

const SAVE_FAILED = "Sorry, we could not save your order. Please try again in a moment.";

async function siteUrl(): Promise<string> {
  if (publicEnv.NEXT_PUBLIC_SITE_URL) return publicEnv.NEXT_PUBLIC_SITE_URL.replace(/\/+$/, "");
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

/**
 * Checkout. Saves the order first (status awaiting_whatsapp), then returns the
 * pre-filled WhatsApp message. Every price is read from the database here;
 * the browser only says which variants and how many (domain rule 2).
 */
export async function placeOrder(input: CheckoutInput): Promise<PlaceOrderResult> {
  const parsed = checkoutSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: "Please check the highlighted fields.", fieldErrors: fieldErrors(parsed.error) };
  }
  const checkout = parsed.data;

  // Spam protection. A filled-in honeypot means a bot: refuse with the usual failure message.
  if (checkout.website) return { ok: false, message: SAVE_FAILED };
  const h = await headers();
  const ip = h.get("cf-connecting-ip") ?? h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
  if (!(await checkoutAllowedForIp(ip))) {
    return { ok: false, message: "Too many orders in a short time. Please wait a minute and try again." };
  }

  try {
    const admin = createAdminClient();
    const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const { count, error: countError } = await admin
      .from("orders")
      .select("id", { count: "exact", head: true })
      .eq("phone", checkout.phone)
      .gte("created_at", since);
    if (countError) throw new Error(`Could not check recent orders: ${countError.message}`);
    if ((count ?? 0) >= MAX_ORDERS_PER_PHONE_PER_HOUR) {
      return {
        ok: false,
        message: "This phone number has placed several orders in the last hour. Please message us on WhatsApp to add to or change your order.",
      };
    }

    const variants = new Map(
      (await getCartVariants(checkout.items.map((i) => i.variantId))).map((v) => [v.variantId, v]),
    );

    const problems: Record<string, LineProblem> = {};
    for (const { variantId } of checkout.items) {
      const variant = variants.get(variantId);
      if (!variant) problems[variantId] = "unavailable";
      else if (!variant.inStock) problems[variantId] = "out_of_stock";
    }
    if (Object.keys(problems).length > 0) {
      return {
        ok: false,
        message: "Some items can no longer be ordered. Remove them to continue.",
        problems,
      };
    }

    const lines = checkout.items.map(({ variantId, qty }) => {
      const variant = variants.get(variantId)!;
      return {
        variantId,
        qty,
        productName: variant.productName,
        optionValues: variant.optionValues,
        unitPrice: variant.unitPrice,
        lineTotal: lineTotal(variant.unitPrice, qty),
      };
    });
    const itemsTotal = sumPesewas(lines.map((l) => l.lineTotal));

    const { data, error } = await admin.rpc("create_order", {
      p_customer_name: checkout.customerName,
      p_phone: checkout.phone,
      p_location: checkout.location,
      p_notes: checkout.notes ?? "",
      p_items: lines.map((l) => ({
        variant_id: l.variantId,
        product_name: l.productName,
        option_values: l.optionValues,
        unit_price: l.unitPrice,
        qty: l.qty,
      })),
    });
    const saved = data?.[0];
    if (error || !saved) throw new Error(`create_order failed: ${error?.message ?? "no row returned"}`);

    const settings = await getSettings();
    const orderUrl = `${await siteUrl()}/o/${saved.public_token}`;
    const message = buildOrderMessage({
      storeName: settings.store_name,
      orderCode: saved.order_code,
      lines,
      itemsTotal,
      customerName: checkout.customerName,
      phone: checkout.phone,
      location: checkout.location,
      notes: checkout.notes,
      orderUrl,
    });

    return {
      ok: true,
      order: {
        orderCode: saved.order_code,
        orderUrl,
        message,
        whatsappNumber: settings.whatsapp_number,
        whatsappUrl: whatsappUrl(settings.whatsapp_number, message),
      },
    };
  } catch (error) {
    console.error("Checkout failed", error);
    return { ok: false, message: SAVE_FAILED };
  }
}
