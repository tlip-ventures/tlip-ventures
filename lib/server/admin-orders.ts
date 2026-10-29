import "server-only";
import type { OrderStatus } from "@/lib/order-status";
import { pageRange } from "@/lib/pagination";
import { requireAdmin } from "@/lib/server/admin";

// Admin order reads. They run as the signed-in admin, so RLS allows them.

export type OrderSummary = {
  id: string;
  order_code: string;
  customer_name: string;
  phone: string;
  items_total: number;
  status: OrderStatus;
  created_at: string;
};

export const ADMIN_PAGE_SIZE = 30;

export async function listOrders(options: { status?: OrderStatus; page?: number; search?: string }) {
  const { supabase } = await requireAdmin();
  const { from, to } = pageRange(options.page ?? 1, ADMIN_PAGE_SIZE);
  let query = supabase
    .from("orders")
    .select("id, order_code, customer_name, phone, items_total, status, created_at", { count: "exact" })
    .order("created_at", { ascending: false })
    .order("id");
  if (options.status) query = query.eq("status", options.status);
  if (options.search) {
    // Order code, name or phone digits. Commas and brackets would break the or() filter, so they are removed.
    const term = options.search.replace(/[^\p{L}\p{N} -]/gu, "").trim();
    const digits = term.replace(/\D/g, "").replace(/^0/, "");
    const filters = [`order_code.ilike.%${term}%`, `customer_name.ilike.%${term}%`];
    if (digits.length >= 4) filters.push(`phone.like.%${digits}%`);
    if (term) query = query.or(filters.join(","));
  }
  const { data, count, error } = await query.range(from, to);
  if (error?.code === "PGRST103") return { orders: [] as OrderSummary[], total: count ?? 0 };
  if (error) throw new Error(`Could not load orders: ${error.message}`);
  return { orders: data as OrderSummary[], total: count ?? 0 };
}

/** Number of orders in each status. */
export async function orderCounts(): Promise<Partial<Record<OrderStatus, number>>> {
  const { supabase } = await requireAdmin();
  const statuses: OrderStatus[] = ["awaiting_whatsapp", "confirmed", "paid", "dispatched"];
  const results = await Promise.all(
    statuses.map((status) =>
      supabase.from("orders").select("id", { count: "exact", head: true }).eq("status", status),
    ),
  );
  const counts: Partial<Record<OrderStatus, number>> = {};
  results.forEach(({ count, error }, i) => {
    if (error) throw new Error(`Could not count orders: ${error.message}`);
    counts[statuses[i]] = count ?? 0;
  });
  return counts;
}

export async function getOrder(id: string) {
  const { supabase } = await requireAdmin();
  const { data, error } = await supabase
    .from("orders")
    .select(
      "id, order_code, public_token, customer_name, phone, location, notes, items_total, status, created_at, updated_at, order_items(id, variant_id, product_name, option_values, unit_price, qty, line_total, product_variants(products(slug)))",
    )
    .eq("id", id)
    .order("product_name", { referencedTable: "order_items" })
    .maybeSingle();
  if (error) throw new Error(`Could not load order: ${error.message}`);
  return data;
}
