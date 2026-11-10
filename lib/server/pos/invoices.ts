import "server-only";
import { pageRange } from "@/lib/pagination";
import { pesewasToInput } from "@/lib/money";
import { addToBasket, type BasketLine, type CustomerChoice } from "@/lib/pos/basket";
import { phoneText } from "@/lib/pos/format";
import { lineName } from "@/lib/pos/receipt";
import { tillWarnings, type InvoiceFilter, type InvoiceLine, type InvoiceStatus } from "@/lib/pos/invoices";
import { matchChoice } from "@/lib/product";
import { requirePosUser } from "./auth";
import { getPeopleNames } from "./stock";

// Invoices, read as the signed-in person (RLS: shop users only).

export const INVOICES_PAGE_SIZE = 25;

export type InvoiceRow = {
  id: string;
  code: string;
  status: InvoiceStatus;
  createdAt: string;
  validUntil: string;
  customer: string | null;
  items: number;
  deliveryFee: number;
  total: number;
  saleId: string | null;
  saleCode: string | null;
};

/** Characters that would break a PostgREST filter. */
function term(raw: string): string {
  return raw.replace(/[%_,()\\*:"']/g, " ").replace(/\s+/g, " ").trim();
}

export async function listInvoices(options: { filter: InvoiceFilter; search: string; page: number }) {
  const { supabase } = await requirePosUser();
  const { from, to } = pageRange(options.page, INVOICES_PAGE_SIZE);
  let query = supabase
    .from("pos_invoices_list")
    .select("id, code, status, created_at, valid_until, customer_name, items, delivery_fee, total, sale_id, sale_code", { count: "exact" })
    .order("created_at", { ascending: false })
    .order("code", { ascending: false });
  if (options.filter !== "all") query = query.eq("status", options.filter);
  const q = term(options.search);
  if (q) query = query.or(`code.ilike.*${q}*,customer_name.ilike.*${q}*,customer_phone.ilike.*${q}*`);
  const { data, count, error } = await query.range(from, to);
  if (error?.code === "PGRST103") return { rows: [] as InvoiceRow[], total: count ?? 0 };
  if (error) throw new Error(`Could not load invoices: ${error.message}`);
  const rows: InvoiceRow[] = data.map((r) => ({
    id: r.id!,
    code: r.code!,
    status: r.status!,
    createdAt: r.created_at!,
    validUntil: r.valid_until!,
    customer: r.customer_name,
    items: r.items ?? 0,
    deliveryFee: r.delivery_fee ?? 0,
    total: r.total ?? 0,
    saleId: r.sale_id,
    saleCode: r.sale_code,
  }));
  return { rows, total: count ?? 0 };
}

async function loadInvoice(id: string) {
  const { supabase } = await requirePosUser();
  const [{ data: inv, error }, { data: items, error: itemsError }] = await Promise.all([
    supabase
      .from("invoices")
      .select(
        "id, code, status, created_at, created_by, customer_id, subtotal, discount, delivery_fee, delivery_address, delivery_name, delivery_phone, delivery_note, delivery_included, wholesale, total, valid_until, note, sale_id",
      )
      .eq("id", id)
      .maybeSingle(),
    supabase
      .from("invoice_items")
      .select("variant_id, product_name, option_values, unit_price, qty, line_total")
      .eq("invoice_id", id)
      .order("product_name")
      .order("id"),
  ]);
  if (error) throw new Error(`Could not load the invoice: ${error.message}`);
  if (itemsError) throw new Error(`Could not load the invoice lines: ${itemsError.message}`);
  if (!inv) return null;
  const customer = inv.customer_id
    ? (await supabase.from("customers").select("id, name, phone").eq("id", inv.customer_id).maybeSingle()).data
    : null;
  return { supabase, inv, items, customer };
}

/** An invoice with its lines and the shop's details, for the invoice page. */
export async function getInvoice(id: string) {
  const loaded = await loadInvoice(id);
  if (!loaded) return null;
  const { supabase, inv, items, customer } = loaded;
  const [{ data: settings, error: settingsError }, sale, people] = await Promise.all([
    supabase.from("settings").select("store_name, shop_address, whatsapp_number, contact_email, receipt_footer").eq("id", 1).single(),
    inv.sale_id ? supabase.from("sales").select("code").eq("id", inv.sale_id).maybeSingle() : Promise.resolve({ data: null }),
    getPeopleNames(),
  ]);
  if (settingsError) throw new Error(`Could not load the shop's details: ${settingsError.message}`);

  const lines: InvoiceLine[] = items.map((i) => ({
    qty: i.qty,
    productName: i.product_name,
    optionValues: i.option_values,
    unitPrice: i.unit_price,
    lineTotal: i.line_total,
  }));
  return {
    id: inv.id,
    code: inv.code,
    status: inv.status,
    createdAt: inv.created_at,
    validUntil: inv.valid_until,
    madeBy: (inv.created_by && people.get(inv.created_by)) || null,
    customer: customer ? { name: customer.name, phone: customer.phone } : null,
    lines,
    // The items as listed (a fee "in the price" is stored out of the subtotal).
    subtotal: inv.delivery_included ? inv.subtotal + inv.delivery_fee : inv.subtotal,
    discount: inv.discount,
    delivery: inv.delivery_address
      ? {
          fee: inv.delivery_fee,
          included: inv.delivery_included,
          address: inv.delivery_address,
          name: inv.delivery_name,
          phone: inv.delivery_phone,
          note: inv.delivery_note,
        }
      : null,
    total: inv.total,
    wholesale: inv.wholesale,
    note: inv.note,
    sale: inv.sale_id ? { id: inv.sale_id, code: sale.data?.code ?? "the sale" } : null,
    shop: {
      name: settings.store_name,
      address: settings.shop_address,
      whatsapp: settings.whatsapp_number,
      email: settings.contact_email,
      footer: settings.receipt_footer,
    },
  };
}

export type InvoiceDetail = NonNullable<Awaited<ReturnType<typeof getInvoice>>>;

/** What the till needs to sell an invoice: its lines at today's prices and shelf counts. */
export type InvoiceForTill = {
  invoice: { id: string; code: string; warnings: string[] };
  lines: BasketLine[];
  customer: CustomerChoice | null;
  discount: number;
  delivery: { address: string; phone: string; fee: string; note: string; included: boolean } | null;
  /** The invoice was at wholesale prices: the till switches to Wholesale. */
  wholesale: boolean;
};

export async function getInvoiceForTill(id: string): Promise<InvoiceForTill | { error: string }> {
  const loaded = await loadInvoice(id);
  if (!loaded) return { error: "This invoice no longer exists." };
  const { supabase, inv, items, customer } = loaded;
  if (inv.status === "sold") return { error: "This invoice has already been sold." };
  if (inv.status === "cancelled") return { error: "This invoice was cancelled." };

  const ids = items.map((i) => i.variant_id).filter((v): v is string => v !== null);
  const { data: rows, error } = ids.length
    ? await supabase.from("pos_stock_rows").select("variant_id, product_name, choices, sku, price, wholesale_price, on_hand").in("variant_id", ids)
    : { data: [], error: null };
  if (error) throw new Error(`Could not load the shelf: ${error.message}`);
  const now = new Map(rows.map((r) => [r.variant_id!, r]));

  let lines: BasketLine[] = [];
  const checks = items.map((i) => {
    const row = i.variant_id ? now.get(i.variant_id) : undefined;
    const onHand = Math.max(0, row?.on_hand ?? 0);
    if (row && onHand > 0) {
      // The colour written on the invoice, if the product still has it. Colours share the shelf.
      const choice = matchChoice(row.choices ?? [], i.option_values, { required: false }) ?? null;
      lines = addToBasket(
        lines,
        {
          variantId: row.variant_id!,
          name: row.product_name ?? i.product_name,
          choice,
          sku: row.sku,
          unitPrice: row.price ?? 0,
          wholesalePrice: row.wholesale_price,
          maxQty: onHand,
        },
        i.qty,
      );
    }
    // Today's price as the invoice was made: wholesale when it was a wholesale invoice.
    const today = row ? (inv.wholesale && row.wholesale_price != null ? row.wholesale_price : (row.price ?? 0)) : null;
    return { name: lineName(i.product_name, i.option_values), invoicePrice: i.unit_price, price: today, qty: i.qty, onHand };
  });

  return {
    invoice: { id: inv.id, code: inv.code, warnings: tillWarnings(checks) },
    lines,
    customer: customer ? { id: customer.id, name: customer.name, phone: customer.phone } : null,
    discount: inv.discount,
    wholesale: inv.wholesale,
    delivery: inv.delivery_address
      ? {
          address: inv.delivery_address,
          phone: phoneText(inv.delivery_phone) ?? "",
          fee: inv.delivery_fee ? pesewasToInput(inv.delivery_fee) : "",
          note: inv.delivery_note ?? "",
          included: inv.delivery_included,
        }
      : null,
  };
}
