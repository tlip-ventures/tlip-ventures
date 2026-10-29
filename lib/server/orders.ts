import "server-only";
import { cache } from "react";
import { z } from "zod";
import { createAdminClient } from "@/lib/server/supabase-admin";

/** public_token: 18 random bytes, URL-safe base64 (24 characters). */
const tokenSchema = z.string().regex(/^[A-Za-z0-9_-]{24}$/);

export type PublicOrder = {
  orderCode: string;
  itemsTotal: number;
  createdAt: string;
  items: { productName: string; optionValues: string | null; unitPrice: number; qty: number; lineTotal: number }[];
};

/**
 * The order behind a public /o/<token> link: code, items and total only.
 * Never selects the customer's name, phone, location or note (domain rule 7). Orders
 * are not readable by the public, so this uses the secret key server-side.
 */
export const getPublicOrder = cache(async (token: string): Promise<PublicOrder | null> => {
  if (!tokenSchema.safeParse(token).success) return null;
  const { data, error } = await createAdminClient()
    .from("orders")
    .select("order_code, items_total, created_at, order_items(product_name, option_values, unit_price, qty, line_total)")
    .eq("public_token", token)
    .order("product_name", { referencedTable: "order_items" })
    .maybeSingle();
  if (error) throw new Error(`Could not load order: ${error.message}`);
  if (!data) return null;
  return {
    orderCode: data.order_code,
    itemsTotal: data.items_total,
    createdAt: data.created_at,
    items: data.order_items.map((i) => ({
      productName: i.product_name,
      optionValues: i.option_values,
      unitPrice: i.unit_price,
      qty: i.qty,
      lineTotal: i.line_total,
    })),
  };
});
