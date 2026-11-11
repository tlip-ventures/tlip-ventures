import "server-only";
import { lineName } from "@/lib/pos/receipt";
import { requirePosUser } from "@/lib/server/pos/auth";

// Reserved orders: kept for the customer to pick up or have delivered later.

export type ReservationRow = {
  id: string;
  code: string;
  status: string;
  createdAt: string;
  customerName: string | null;
  customerPhone: string | null;
  total: number;
  paid: number;
  owed: number;
  /** The agreed pickup or delivery date ("2026-11-14"), or null. */
  until: string | null;
  /** Where the rider takes it; null: picked up in the shop. */
  deliveryAddress: string | null;
  deliveryStatus: string | null;
  /** "2 x Blender 1.5L (Black)", one per line. */
  items: string[];
};

/** Open reservations (not yet collected or delivered), soonest date first, then oldest. */
export async function listOpenReservations(): Promise<ReservationRow[]> {
  const { supabase } = await requirePosUser();
  const { data, error } = await supabase
    .from("pos_sales_list")
    .select("id, code, status, created_at, customer_name, customer_phone, total, paid, owed, reserved_until, delivery_address, delivery_status")
    .eq("reserved", true)
    .is("collected_at", null)
    .in("status", ["reserved", "completed", "on_hold"])
    .order("reserved_until", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: true })
    .limit(300);
  if (error) throw new Error(`Could not load reserved orders: ${error.message}`);

  const ids = data.map((r) => r.id!);
  const items = new Map<string, string[]>();
  if (ids.length) {
    const { data: lines, error: linesError } = await supabase
      .from("sale_items")
      .select("sale_id, product_name, option_values, qty")
      .eq("kind", "item")
      .in("sale_id", ids);
    if (linesError) throw new Error(`Could not load reserved items: ${linesError.message}`);
    for (const l of lines) {
      const list = items.get(l.sale_id) ?? [];
      list.push(`${l.qty} x ${lineName(l.product_name, l.option_values)}`);
      items.set(l.sale_id, list);
    }
  }

  return data.map((r) => ({
    id: r.id!,
    code: r.code ?? "",
    status: r.status ?? "reserved",
    createdAt: r.created_at!,
    customerName: r.customer_name,
    customerPhone: r.customer_phone,
    total: r.total ?? 0,
    paid: r.paid ?? 0,
    owed: r.owed ?? 0,
    until: r.reserved_until,
    deliveryAddress: r.delivery_address,
    deliveryStatus: r.delivery_status,
    items: items.get(r.id!) ?? [],
  }));
}

/** Open reservations: the badge on "Reserved". */
export async function countOpenReservations(): Promise<number> {
  const { supabase } = await requirePosUser();
  const { count, error } = await supabase
    .from("sales")
    .select("id", { count: "exact", head: true })
    .eq("reserved", true)
    .is("collected_at", null)
    .in("status", ["reserved", "completed", "on_hold"]);
  if (error) throw new Error(`Could not count reserved orders: ${error.message}`);
  return count ?? 0;
}
