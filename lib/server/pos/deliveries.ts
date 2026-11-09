import "server-only";
import { pageRange } from "@/lib/pagination";
import type { DeliveryFilter, DeliveryStatus } from "@/lib/pos/deliveries";
import { requirePosUser } from "./auth";

export const DELIVERIES_PAGE_SIZE = 25;

export type DeliveryRow = {
  saleId: string;
  code: string;
  createdAt: string;
  status: DeliveryStatus;
  address: string;
  contactName: string | null;
  contactPhone: string | null;
  note: string | null;
  rider: string | null;
  outAt: string | null;
  deliveredAt: string | null;
  fee: number;
  total: number;
  owed: number;
  customer: string | null;
  cancelled: boolean;
};

/** Characters that would break a PostgREST filter. */
function term(raw: string | undefined): string {
  return (raw ?? "").replace(/[%_,()\\*:"']/g, " ").replace(/\s+/g, " ").trim();
}

/** The Deliveries screen: open ones oldest first (to send in order), delivered newest first. */
export async function listDeliveries(options: { filter: DeliveryFilter; search?: string; page?: number }) {
  const { supabase } = await requirePosUser();
  const { from, to } = pageRange(options.page ?? 1, DELIVERIES_PAGE_SIZE);
  let query = supabase
    .from("pos_deliveries_list")
    .select("sale_id, code, created_at, status, address, contact_name, contact_phone, note, rider, out_at, delivered_at, fee, total, owed, customer_name, sale_status", {
      count: "exact",
    });
  if (options.filter === "open") query = query.in("status", ["to_deliver", "out"]);
  else if (options.filter !== "all") query = query.eq("status", options.filter);
  if (options.filter !== "all") query = query.not("sale_status", "in", "(voided,cancelled)");
  query =
    options.filter === "delivered" || options.filter === "all"
      ? query.order("created_at", { ascending: false })
      : query.order("created_at", { ascending: true });
  const q = term(options.search);
  if (q) {
    const digits = q.replace(/\D/g, "");
    query = query.or(
      [`code.ilike.*${q}*`, `customer_name.ilike.*${q}*`, `contact_name.ilike.*${q}*`, `address.ilike.*${q}*`, `rider.ilike.*${q}*`]
        .concat(digits.length >= 4 ? [`contact_phone.ilike.*${digits.replace(/^0/, "")}*`] : [])
        .join(","),
    );
  }
  const { data, count, error } = await query.range(from, to);
  if (error?.code === "PGRST103") return { rows: [] as DeliveryRow[], total: count ?? 0 };
  if (error) throw new Error(`Could not load deliveries: ${error.message}`);
  const rows: DeliveryRow[] = data.map((d) => ({
    saleId: d.sale_id!,
    code: d.code!,
    createdAt: d.created_at!,
    status: d.status!,
    address: d.address!,
    contactName: d.contact_name,
    contactPhone: d.contact_phone,
    note: d.note,
    rider: d.rider,
    outAt: d.out_at,
    deliveredAt: d.delivered_at,
    fee: d.fee ?? 0,
    total: d.total ?? 0,
    owed: d.owed ?? 0,
    customer: d.customer_name,
    cancelled: d.sale_status === "voided" || d.sale_status === "cancelled",
  }));
  return { rows, total: count ?? 0 };
}

export type DeliverySummary = { toDeliver: number; out: number; toCollect: number };

/** Counts for the screen's cards and the menu badge: open deliveries and the money riders should bring back. */
export async function getDeliverySummary(): Promise<DeliverySummary> {
  const { supabase } = await requirePosUser();
  const { data, error } = await supabase
    .from("pos_deliveries_list")
    .select("status, owed")
    .in("status", ["to_deliver", "out"])
    .not("sale_status", "in", "(voided,cancelled)");
  if (error) throw new Error(`Could not count deliveries: ${error.message}`);
  return {
    toDeliver: data.filter((d) => d.status === "to_deliver").length,
    out: data.filter((d) => d.status === "out").length,
    toCollect: data.reduce((n, d) => n + (d.owed ?? 0), 0),
  };
}

export type RiderTotals = {
  /** null: deliveries not given to a rider yet. */
  rider: string | null;
  deliveries: number;
  delivered: number;
  /** Delivery fees, in pesewas. */
  fees: number;
  /** The sales' totals, delivery included. */
  total: number;
  /** Still to collect on those sales. */
  owed: number;
};

/** Each rider's deliveries between two times (null: all time), cancelled sales left out. */
export async function getRiderSummary(range: { from: Date; to: Date } | null): Promise<RiderTotals[]> {
  const { supabase } = await requirePosUser();
  const { data, error } = await supabase.rpc("pos_rider_summary", {
    // The function treats null as all time; the generated types don't know it accepts null.
    p_from: (range?.from.toISOString() ?? null) as string,
    p_to: (range?.to.toISOString() ?? null) as string,
  });
  if (error) throw new Error(`Could not load the riders: ${error.message}`);
  return data as unknown as RiderTotals[];
}

/** Riders who have delivered before, for the "Rider" box's suggestions. */
export async function listRiders(): Promise<string[]> {
  const rows = await getRiderSummary(null);
  return rows.map((r) => r.rider).filter((r): r is string => r !== null).sort((a, b) => a.localeCompare(b));
}
