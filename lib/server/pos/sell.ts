import "server-only";
import type { CustomerChoice } from "@/lib/pos/basket";
import type { ReceiptPayment } from "@/lib/pos/receipt";
import { requirePosUser } from "@/lib/server/pos/auth";
import { getPeopleNames, listStockRows } from "@/lib/server/pos/stock";

// Reads for the point of sale, as the signed-in person.

export const SELL_PAGE_SIZE = 48;

export type SellTile = {
  variantId: string;
  name: string;
  /** "Colour" when the cashier picks one; null otherwise. */
  choiceName: string | null;
  choices: string[];
  sku: string | null;
  price: number;
  /** null: no wholesale price (sold at the normal price on wholesale sales too). */
  wholesalePrice: number | null;
  /** In the shop: what can be sold. */
  onHand: number;
  /** In the warehouse: not for sale until moved to the shop. */
  warehouseOnHand: number;
  imageUrl: string | null;
  topCategory: string | null;
};

/** Products for the till grid: every product, on the website or not, A–Z. */
export async function listSellTiles(options: { search?: string; topCategoryId?: string }) {
  const { rows, total } = await listStockRows({
    search: options.search,
    topCategoryId: options.topCategoryId,
    page: 1,
    pageSize: SELL_PAGE_SIZE,
    order: "name",
  });
  const tiles: SellTile[] = rows.map((r) => ({
    variantId: r.variantId,
    name: r.productName,
    choiceName: r.choiceName,
    choices: r.choices,
    sku: r.sku,
    price: r.price,
    wholesalePrice: r.wholesalePrice,
    onHand: r.onHand,
    warehouseOnHand: r.warehouseOnHand,
    imageUrl: r.imageUrl,
    topCategory: r.topCategoryName,
  }));
  return { tiles, total };
}

/** A scanned barcode or a typed code, matched exactly. */
export async function findTileByCode(code: string): Promise<SellTile | null> {
  const term = code.trim();
  if (!term || term.length > 64 || /[,()"'\\]/.test(term)) return null;
  const { supabase } = await requirePosUser();
  const { data, error } = await supabase
    .from("pos_stock_rows")
    .select("variant_id, product_name, choice_name, choices, sku, price, on_hand, warehouse_on_hand, image_url, top_category_name, wholesale_price")
    .or(`barcode.eq.${term},sku.ilike.${term}`)
    .limit(2);
  if (error) throw new Error(`Could not look up the code: ${error.message}`);
  // Two matches (a code that is also someone's barcode) is ambiguous: search instead.
  if (data.length !== 1) return null;
  const r = data[0];
  return {
    variantId: r.variant_id!,
    name: r.product_name ?? "",
    choiceName: r.choice_name,
    choices: r.choices ?? [],
    sku: r.sku,
    price: r.price ?? 0,
    wholesalePrice: r.wholesale_price,
    onHand: r.on_hand ?? 0,
    warehouseOnHand: r.warehouse_on_hand ?? 0,
    imageUrl: r.image_url,
    topCategory: r.top_category_name,
  };
}

export async function searchCustomers(query: string): Promise<CustomerChoice[]> {
  const { supabase } = await requirePosUser();
  const term = query.replace(/[%_,()\\*:"']/g, " ").trim();
  if (!term) return [];
  const digits = term.replace(/\D/g, "");
  let q = supabase.from("customers").select("id, name, phone").order("name").limit(8);
  // "024 123 4567" and "0241234567" both find 233241234567.
  if (digits.length >= 4 && digits.length === term.replace(/[\s+-]/g, "").length) {
    q = q.ilike("phone", `%${digits.replace(/^0/, "")}%`);
  } else {
    q = q.ilike("name", `%${term}%`);
  }
  const { data, error } = await q;
  if (error) throw new Error(`Could not search customers: ${error.message}`);
  return data;
}

/** Everything the receipt page and the WhatsApp receipt need. */
export async function getSaleReceipt(saleId: string) {
  const { supabase } = await requirePosUser();
  const [{ data: sale, error }, { data: settings, error: settingsError }] = await Promise.all([
    supabase
      .from("sales")
      .select(
        "id, code, status, subtotal, discount, total, note, created_at, created_by, delivery_included, wholesale, customers(name, phone), sale_items(product_name, option_values, unit_price, qty, line_total, kind), payments(method, amount, cash_received, change_given, paid_at), deliveries(address, contact_name, contact_phone, status, rider)",
      )
      .eq("id", saleId)
      .maybeSingle(),
    supabase.from("settings").select("store_name, shop_address, whatsapp_number, receipt_footer").eq("id", 1).single(),
  ]);
  if (error) throw new Error(`Could not load the sale: ${error.message}`);
  if (settingsError) throw new Error(`Could not load the shop's details: ${settingsError.message}`);
  if (!sale) return null;

  const people = await getPeopleNames();
  const payments: ReceiptPayment[] = sale.payments.map((p) => ({
    method: p.method,
    amount: p.amount,
    cashReceived: p.cash_received,
    changeGiven: p.change_given,
  }));
  const paid = payments.reduce((n, p) => n + p.amount, 0);
  // The delivery fee is a sale line of its own; the receipt shows it under the items.
  const items = sale.sale_items.filter((i) => i.kind !== "delivery");
  const deliveryFee = sale.sale_items.filter((i) => i.kind === "delivery").reduce((n, i) => n + i.line_total, 0);

  return {
    id: sale.id,
    code: sale.code,
    status: sale.status,
    createdAt: sale.created_at,
    wholesale: sale.wholesale,
    servedBy: (sale.created_by && people.get(sale.created_by)) || null,
    customer: sale.customers ? { name: sale.customers.name, phone: sale.customers.phone } : null,
    note: sale.note,
    lines: items.map((i) => ({
      qty: i.qty,
      productName: i.product_name,
      optionValues: i.option_values,
      unitPrice: i.unit_price,
      lineTotal: i.line_total,
    })),
    // The items before any discount (a fee "in the price" was never added to the subtotal).
    subtotal: sale.delivery_included ? sale.subtotal : sale.subtotal - deliveryFee,
    discount: sale.discount,
    delivery: sale.deliveries
      ? {
          fee: deliveryFee,
          included: sale.delivery_included,
          address: sale.deliveries.address,
          name: sale.deliveries.contact_name,
          phone: sale.deliveries.contact_phone,
          status: sale.deliveries.status,
          rider: sale.deliveries.rider,
        }
      : null,
    total: sale.total,
    payments,
    owed: Math.max(0, sale.total - paid),
    shop: {
      name: settings.store_name,
      address: settings.shop_address,
      whatsapp: settings.whatsapp_number,
      footer: settings.receipt_footer,
    },
  };
}

export type SaleReceipt = NonNullable<Awaited<ReturnType<typeof getSaleReceipt>>>;
