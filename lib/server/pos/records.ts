import "server-only";
import { pageRange } from "@/lib/pagination";
import type { RecordFilter, RecordKind } from "@/lib/pos/records";
import type { ReceiptPayment } from "@/lib/pos/receipt";
import { requirePosUser } from "@/lib/server/pos/auth";
import { getPeopleNames } from "@/lib/server/pos/stock";
import type { Database } from "@/lib/database.types";

// Sales, purchases and returns, as the signed-in person (RLS: staff never see
// purchases or suppliers).

export const RECORDS_PAGE_SIZE = 25;

type SaleStatus = Database["public"]["Enums"]["sale_status"];
type PurchaseStatus = Database["public"]["Enums"]["purchase_status"];

export type RecordRow = {
  id: string;
  kind: RecordKind;
  createdAt: string;
  code: string;
  party: string;
  /** The grey line under the customer / supplier. */
  sub: string;
  saleStatus?: SaleStatus;
  purchaseStatus?: PurchaseStatus;
  items?: number;
  restocked?: number;
  total: number;
  paid: number;
  owed: number;
  cancelled: boolean;
};

/** Characters that would break a PostgREST filter. */
function term(raw: string | undefined): string {
  return (raw ?? "").replace(/[%_,()\\*:"']/g, " ").replace(/\s+/g, " ").trim();
}

export async function listRecords(kind: RecordKind, options: { search?: string; filter?: RecordFilter; page?: number; pageSize?: number }) {
  const { supabase } = await requirePosUser();
  const { from, to } = pageRange(options.page ?? 1, options.pageSize ?? RECORDS_PAGE_SIZE);
  const q = term(options.search);
  const people = await getPeopleNames();
  const by = (id: string | null) => (id && people.get(id)) || "Someone no longer here";

  if (kind === "sales") {
    let query = supabase
      .from("pos_sales_list")
      .select("id, code, source, status, created_at, created_by, total, paid, owed, customer_name", { count: "exact" })
      .order("created_at", { ascending: false })
      .order("code", { ascending: false });
    if (q) query = query.or(`code.ilike.*${q}*,customer_name.ilike.*${q}*`);
    if (options.filter === "unpaid") query = query.gt("owed", 0);
    if (options.filter === "paid") query = query.eq("owed", 0).not("status", "in", "(voided,cancelled)");
    const { data, count, error } = await query.range(from, to);
    if (error?.code === "PGRST103") return { rows: [] as RecordRow[], total: count ?? 0 };
    if (error) throw new Error(`Could not load sales: ${error.message}`);
    const rows: RecordRow[] = data.map((r) => ({
      id: r.id!,
      kind,
      createdAt: r.created_at!,
      code: r.code!,
      party: r.customer_name ?? (r.source === "website" ? "Online customer" : "Walk-in customer"),
      sub:
        r.source === "website"
          ? "From the website · Accra shop"
          : r.source === "import"
            ? "From the old system · Accra shop"
            : `Sold by ${by(r.created_by)} · Accra shop`,
      saleStatus: r.status!,
      total: r.total!,
      paid: r.paid!,
      owed: r.owed!,
      cancelled: r.status === "voided" || r.status === "cancelled",
    }));
    return { rows, total: count ?? 0 };
  }

  if (kind === "purchases") {
    let query = supabase
      .from("pos_purchases_list")
      .select("id, code, status, created_at, total, paid, owed, supplier_name", { count: "exact" })
      .order("created_at", { ascending: false })
      .order("code", { ascending: false });
    if (q) query = query.or(`code.ilike.*${q}*,supplier_name.ilike.*${q}*`);
    if (options.filter === "unpaid") query = query.gt("owed", 0);
    if (options.filter === "paid") query = query.eq("owed", 0).neq("status", "cancelled");
    const { data, count, error } = await query.range(from, to);
    if (error?.code === "PGRST103") return { rows: [] as RecordRow[], total: count ?? 0 };
    if (error) throw new Error(`Could not load purchases: ${error.message}`);
    const rows: RecordRow[] = data.map((r) => ({
      id: r.id!,
      kind,
      createdAt: r.created_at!,
      code: r.code!,
      party: r.supplier_name!,
      sub: r.status === "ordered" ? "Not received yet" : "Into Accra shop",
      purchaseStatus: r.status!,
      total: r.total!,
      paid: r.paid!,
      owed: r.owed!,
      cancelled: r.status === "cancelled",
    }));
    return { rows, total: count ?? 0 };
  }

  let query = supabase
    .from("pos_returns_list")
    .select("id, code, created_at, created_by, total, paid, owed, customer_name, sale_code, items, restocked", { count: "exact" })
    .order("created_at", { ascending: false })
    .order("code", { ascending: false });
  if (q) query = query.or(`code.ilike.*${q}*,customer_name.ilike.*${q}*,sale_code.ilike.*${q}*`);
  if (options.filter === "unpaid") query = query.gt("owed", 0);
  if (options.filter === "paid") query = query.eq("owed", 0);
  const { data, count, error } = await query.range(from, to);
  if (error?.code === "PGRST103") return { rows: [] as RecordRow[], total: count ?? 0 };
  if (error) throw new Error(`Could not load returns: ${error.message}`);
  const rows: RecordRow[] = data.map((r) => ({
    id: r.id!,
    kind,
    createdAt: r.created_at!,
    code: r.code!,
    party: r.customer_name ?? "Walk-in customer",
    sub: `${r.sale_code ? `From ${r.sale_code}` : "No receipt"} · ${r.items} ${r.items === 1 ? "item" : "items"}`,
    items: r.items!,
    restocked: r.restocked!,
    total: r.total!,
    paid: r.paid!,
    owed: r.owed!,
    cancelled: false,
  }));
  return { rows, total: count ?? 0 };
}

export type RecordsSummary = {
  total: number;
  paid: number;
  owed: number;
  counts: Record<RecordKind, number>;
};

export async function getRecordsSummary(kind: RecordKind, search?: string): Promise<RecordsSummary> {
  const { supabase } = await requirePosUser();
  const { data, error } = await supabase.rpc("pos_records_summary", { p_kind: kind, p_search: term(search) || undefined });
  if (error) throw new Error(`Could not load the totals: ${error.message}`);
  return data as unknown as RecordsSummary;
}

type PaymentLine = ReceiptPayment & { paidAt: string; by: string; note: string | null };

/** A sale with its lines, payments, returns and stock moves. */
export async function getSaleDetail(id: string) {
  const { supabase } = await requirePosUser();
  const { data: s, error } = await supabase
    .from("sales")
    .select(
      "id, code, source, status, subtotal, discount, total, note, created_at, created_by, completed_at, voided_at, voided_by, void_reason, order_id, customers(id, name, phone), sale_items(id, variant_id, product_name, option_values, unit_price, qty, line_total), payments(method, amount, cash_received, change_given, paid_at, created_by, note), returns(id, code, created_at, refund_total)",
    )
    .eq("id", id)
    .order("paid_at", { referencedTable: "payments" })
    .maybeSingle();
  if (error) throw new Error(`Could not load the sale: ${error.message}`);
  if (!s) return null;

  const people = await getPeopleNames();
  const by = (uid: string | null) => (uid && people.get(uid)) || "Someone no longer here";
  const payments: PaymentLine[] = s.payments.map((p) => ({
    method: p.method,
    amount: p.amount,
    cashReceived: p.cash_received,
    changeGiven: p.change_given,
    paidAt: p.paid_at,
    by: by(p.created_by),
    note: p.note,
  }));
  const paid = payments.reduce((n, p) => n + p.amount, 0);
  const cancelled = s.status === "voided" || s.status === "cancelled";

  // What is left to return on each line.
  const itemIds = s.sale_items.map((i) => i.id);
  const returned = new Map<string, number>();
  if (itemIds.length) {
    const { data: ri, error: riError } = await supabase.from("return_items").select("sale_item_id, qty").in("sale_item_id", itemIds);
    if (riError) throw new Error(`Could not load returns: ${riError.message}`);
    for (const r of ri) if (r.sale_item_id) returned.set(r.sale_item_id, (returned.get(r.sale_item_id) ?? 0) + r.qty);
  }

  return {
    id: s.id,
    code: s.code,
    source: s.source,
    status: s.status,
    createdAt: s.created_at,
    soldBy: by(s.created_by),
    customer: s.customers,
    note: s.note,
    lines: s.sale_items.map((i) => ({ ...i, returned: returned.get(i.id) ?? 0 })),
    subtotal: s.subtotal,
    discount: s.discount,
    total: s.total,
    payments,
    paid,
    owed: cancelled ? 0 : Math.max(0, s.total - paid),
    cancelled,
    voided: s.voided_at ? { at: s.voided_at, by: by(s.voided_by), reason: s.void_reason } : null,
    returns: s.returns,
  };
}

export async function getPurchaseDetail(id: string) {
  const { supabase } = await requirePosUser();
  const { data: p, error } = await supabase
    .from("purchases")
    .select(
      "id, code, status, total, note, created_at, created_by, received_at, received_by, cancelled_at, suppliers(id, name, phone), purchase_items(id, variant_id, product_name, option_values, unit_cost, qty, line_total), purchase_payments(method, amount, paid_at, created_by, note)",
    )
    .eq("id", id)
    .order("paid_at", { referencedTable: "purchase_payments" })
    .maybeSingle();
  if (error) throw new Error(`Could not load the purchase: ${error.message}`);
  if (!p) return null;
  const people = await getPeopleNames();
  const by = (uid: string | null) => (uid && people.get(uid)) || "Someone no longer here";
  const paid = p.purchase_payments.reduce((n, x) => n + x.amount, 0);
  return {
    id: p.id,
    code: p.code,
    status: p.status,
    total: p.total,
    note: p.note,
    createdAt: p.created_at,
    createdBy: by(p.created_by),
    receivedAt: p.received_at,
    receivedBy: p.received_by ? by(p.received_by) : null,
    supplier: p.suppliers,
    lines: p.purchase_items,
    payments: p.purchase_payments.map((x) => ({ method: x.method, amount: x.amount, paidAt: x.paid_at, by: by(x.created_by), note: x.note })),
    paid,
    owed: p.status === "cancelled" ? 0 : Math.max(0, p.total - paid),
  };
}

export async function getReturnDetail(id: string) {
  const { supabase } = await requirePosUser();
  const { data: r, error } = await supabase
    .from("returns")
    .select(
      "id, code, refund_total, note, created_at, created_by, sale_id, sales(code), customers(name, phone), return_items(id, product_name, option_values, unit_price, qty, line_total, back_on_shelf), refund_payments(method, amount, paid_at, created_by, note)",
    )
    .eq("id", id)
    .order("paid_at", { referencedTable: "refund_payments" })
    .maybeSingle();
  if (error) throw new Error(`Could not load the return: ${error.message}`);
  if (!r) return null;
  const people = await getPeopleNames();
  const by = (uid: string | null) => (uid && people.get(uid)) || "Someone no longer here";
  const paid = r.refund_payments.reduce((n, x) => n + x.amount, 0);
  return {
    id: r.id,
    code: r.code,
    refundTotal: r.refund_total,
    note: r.note,
    createdAt: r.created_at,
    createdBy: by(r.created_by),
    sale: r.sale_id && r.sales ? { id: r.sale_id, code: r.sales.code } : null,
    customer: r.customers,
    lines: r.return_items,
    payments: r.refund_payments.map((x) => ({ method: x.method, amount: x.amount, paidAt: x.paid_at, by: by(x.created_by), note: x.note })),
    paid,
    owed: Math.max(0, r.refund_total - paid),
  };
}

/** A sale by its code (SL_1210), for starting a return from the receipt. */
export async function findSaleIdByCode(code: string): Promise<string | null> {
  const { supabase } = await requirePosUser();
  // SL_1210 from the till, TV-1042 from the website.
  const clean = code.trim().toUpperCase().replace(/^SL[\s_-]?/, "SL_").replace(/^TV[\s_-]?/, "TV-");
  if (!/^(SL_|TV-)\d{1,9}$/.test(clean)) return null;
  const { data, error } = await supabase.from("sales").select("id").eq("code", clean).maybeSingle();
  if (error) throw new Error(`Could not look up the sale: ${error.message}`);
  return data?.id ?? null;
}

export type SupplierRow = { id: string; name: string; phone: string | null; purchases: number; total: number; owed: number };

export async function listSuppliers(): Promise<SupplierRow[]> {
  const { supabase } = await requirePosUser();
  const [{ data: suppliers, error }, { data: purchases, error: pError }] = await Promise.all([
    supabase.from("suppliers").select("id, name, phone").order("name"),
    supabase.from("pos_purchases_list").select("supplier_id, total, owed, status"),
  ]);
  if (error || pError) throw new Error(`Could not load suppliers: ${(error ?? pError)!.message}`);
  const sums = new Map<string, { purchases: number; total: number; owed: number }>();
  for (const p of purchases) {
    if (!p.supplier_id || p.status === "cancelled") continue;
    const s = sums.get(p.supplier_id) ?? { purchases: 0, total: 0, owed: 0 };
    s.purchases += 1;
    s.total += p.total ?? 0;
    s.owed += p.owed ?? 0;
    sums.set(p.supplier_id, s);
  }
  return suppliers.map((s) => ({ ...s, ...(sums.get(s.id) ?? { purchases: 0, total: 0, owed: 0 }) }));
}

export async function searchSuppliers(query: string) {
  const { supabase } = await requirePosUser();
  const q = term(query);
  let req = supabase.from("suppliers").select("id, name, phone").order("name").limit(8);
  if (q) req = req.ilike("name", `%${q}%`);
  const { data, error } = await req;
  if (error) throw new Error(`Could not search suppliers: ${error.message}`);
  return data;
}

export type CustomerRow = { id: string; name: string; phone: string | null; sales: number; total: number; owed: number };

/** Customers, people who owe first. */
export async function listCustomers(search: string, page: number) {
  const { supabase } = await requirePosUser();
  const q = term(search);
  const { from, to } = pageRange(page, RECORDS_PAGE_SIZE);
  let req = supabase.from("customers").select("id, name, phone", { count: "exact" }).order("name");
  if (q) {
    const digits = q.replace(/\D/g, "");
    req = digits.length >= 4 ? req.ilike("phone", `%${digits.replace(/^0/, "")}%`) : req.ilike("name", `%${q}%`);
  }
  const { data, count, error } = await req.range(from, to);
  if (error?.code === "PGRST103") return { rows: [] as CustomerRow[], total: count ?? 0 };
  if (error) throw new Error(`Could not load customers: ${error.message}`);
  const ids = data.map((c) => c.id);
  const sums = new Map<string, { sales: number; total: number; owed: number }>();
  if (ids.length) {
    const { data: sales, error: sError } = await supabase.from("pos_sales_list").select("customer_id, total, owed, status").in("customer_id", ids);
    if (sError) throw new Error(`Could not load customer sales: ${sError.message}`);
    for (const s of sales) {
      if (!s.customer_id || s.status === "voided" || s.status === "cancelled") continue;
      const x = sums.get(s.customer_id) ?? { sales: 0, total: 0, owed: 0 };
      x.sales += 1;
      x.total += s.total ?? 0;
      x.owed += s.owed ?? 0;
      sums.set(s.customer_id, x);
    }
  }
  const rows: CustomerRow[] = data.map((c) => ({ ...c, ...(sums.get(c.id) ?? { sales: 0, total: 0, owed: 0 }) }));
  return { rows, total: count ?? 0 };
}

/** Products for the purchase form: any product, with its latest cost (owner). */
export async function searchPurchaseProducts(query: string) {
  const { supabase } = await requirePosUser();
  const q = term(query);
  if (!q) return [];
  const { data, error } = await supabase
    .from("pos_stock_rows")
    .select("variant_id, product_name, option_label, sku, on_hand")
    .or(`product_name.ilike.*${q}*,option_label.ilike.*${q}*,sku.ilike.${q}*,barcode.eq.${q.replace(/ /g, "")}`)
    .order("product_name")
    .limit(10);
  if (error) throw new Error(`Could not search products: ${error.message}`);
  const ids = data.map((r) => r.variant_id!);
  const costs = new Map<string, number>();
  if (ids.length) {
    const { data: c } = await supabase.from("variant_costs").select("variant_id, cost_price").in("variant_id", ids);
    for (const x of c ?? []) costs.set(x.variant_id, x.cost_price);
  }
  return data.map((r) => ({
    variantId: r.variant_id!,
    name: r.option_label ? `${r.product_name} (${r.option_label})` : r.product_name!,
    sku: r.sku,
    onHand: r.on_hand ?? 0,
    cost: costs.get(r.variant_id!) ?? null,
  }));
}

export type PurchaseProduct = Awaited<ReturnType<typeof searchPurchaseProducts>>[number];

/** One variant for the purchase form, e.g. from Reorder on the stock list. */
export async function getPurchaseProduct(variantId: string): Promise<PurchaseProduct | null> {
  const { supabase } = await requirePosUser();
  const [{ data: r, error }, { data: c }] = await Promise.all([
    supabase.from("pos_stock_rows").select("variant_id, product_name, option_label, sku, on_hand").eq("variant_id", variantId).maybeSingle(),
    supabase.from("variant_costs").select("cost_price").eq("variant_id", variantId).maybeSingle(),
  ]);
  if (error) throw new Error(`Could not load the product: ${error.message}`);
  if (!r) return null;
  return {
    variantId: r.variant_id!,
    name: r.option_label ? `${r.product_name} (${r.option_label})` : r.product_name!,
    sku: r.sku,
    onHand: r.on_hand ?? 0,
    cost: c?.cost_price ?? null,
  };
}
