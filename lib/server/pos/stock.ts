import "server-only";
import { pageRange } from "@/lib/pagination";
import { statesForFilter, stockState, toStockState, type MovementKind, type StockFilter, type StockState } from "@/lib/pos/stock";
import { requirePosUser } from "@/lib/server/pos/auth";

// Stock reads for the Stock & POS app, as the signed-in person (RLS applies:
// staff get no costs, and nobody else gets anything).

export const STOCK_PAGE_SIZE = 30;

export type StockRow = {
  variantId: string;
  productId: string;
  productName: string;
  optionLabel: string | null;
  sku: string | null;
  barcode: string | null;
  price: number;
  onWebsite: boolean;
  reorderLevel: number;
  onHand: number;
  state: StockState;
  categoryName: string | null;
  topCategoryName: string | null;
  imageUrl: string | null;
  /** Owner only; null for staff or when no cost is recorded. */
  cost: number | null;
};

/** Characters that would break a PostgREST filter, or act as wildcards. */
function searchTerm(raw: string | undefined): string {
  return (raw ?? "").replace(/[%_,()\\*:"']/g, " ").replace(/\s+/g, " ").trim();
}

type ViewRow = {
  variant_id: string | null;
  product_id: string | null;
  product_name: string | null;
  option_label: string | null;
  sku: string | null;
  barcode: string | null;
  price: number | null;
  on_website: boolean | null;
  reorder_level: number | null;
  on_hand: number | null;
  stock_state: string | null;
  category_name: string | null;
  top_category_name: string | null;
  image_url: string | null;
};

function toStockRow(r: ViewRow, costs: Map<string, number>): StockRow {
  return {
    variantId: r.variant_id!,
    productId: r.product_id!,
    productName: r.product_name ?? "",
    optionLabel: r.option_label,
    sku: r.sku,
    barcode: r.barcode,
    price: r.price ?? 0,
    onWebsite: r.on_website ?? false,
    reorderLevel: r.reorder_level ?? 0,
    onHand: r.on_hand ?? 0,
    state: toStockState(r.stock_state),
    categoryName: r.category_name,
    topCategoryName: r.top_category_name,
    imageUrl: r.image_url,
    cost: costs.get(r.variant_id!) ?? null,
  };
}

const ROW_COLUMNS =
  "variant_id, product_id, product_name, option_label, sku, barcode, price, on_website, reorder_level, on_hand, stock_state, category_name, top_category_name, image_url";

export async function listStockRows(options: {
  search?: string;
  filter?: StockFilter;
  topCategoryId?: string;
  page?: number;
  pageSize?: number;
}) {
  const { supabase, isOwner } = await requirePosUser();
  const { from, to } = pageRange(options.page ?? 1, options.pageSize ?? STOCK_PAGE_SIZE);

  let query = supabase
    .from("pos_stock_rows")
    .select(ROW_COLUMNS, { count: "exact" })
    .order("state_rank")
    .order("on_hand")
    .order("product_name")
    .order("variant_id");

  if (options.filter && options.filter !== "all") query = query.in("stock_state", statesForFilter(options.filter));
  if (options.topCategoryId) query = query.eq("top_category_id", options.topCategoryId);
  const term = searchTerm(options.search);
  if (term) {
    // Name or option contains it; code starts with it; barcode is exactly it (a scan).
    query = query.or(
      `product_name.ilike.*${term}*,option_label.ilike.*${term}*,sku.ilike.${term}*,barcode.eq.${term.replace(/ /g, "")}`,
    );
  }

  const { data, count, error } = await query.range(from, to);
  // Asking for a page past the end.
  if (error?.code === "PGRST103") return { rows: [] as StockRow[], total: count ?? 0 };
  if (error) throw new Error(`Could not load stock: ${error.message}`);

  const costs = new Map<string, number>();
  if (isOwner && data.length) {
    const { data: costRows, error: costError } = await supabase
      .from("variant_costs")
      .select("variant_id, cost_price")
      .in("variant_id", data.map((r) => r.variant_id!));
    if (costError) throw new Error(`Could not load costs: ${costError.message}`);
    for (const c of costRows) costs.set(c.variant_id, c.cost_price);
  }

  return { rows: data.map((r) => toStockRow(r, costs)), total: count ?? 0 };
}

export type StockSummary = { products: number; low: number; recount: number; value: number | null };

export async function getStockSummary(): Promise<StockSummary> {
  const { supabase } = await requirePosUser();
  const { data, error } = await supabase.rpc("pos_stock_summary");
  if (error) throw new Error(`Could not load the stock summary: ${error.message}`);
  const s = data as { products: number; low: number; recount: number; value: number | null };
  return { products: s.products, low: s.low, recount: s.recount, value: s.value };
}

/** Items that need attention (recount, out or low): the badge on "Products and stock". */
export async function countNeedingAttention(): Promise<number> {
  const { supabase } = await requirePosUser();
  const { count, error } = await supabase
    .from("pos_stock_rows")
    .select("variant_id", { count: "exact", head: true })
    .lt("state_rank", 3);
  if (error) throw new Error(`Could not count low stock: ${error.message}`);
  return count ?? 0;
}

/** Top-level categories, for the count screen's filter. */
export async function listTopCategories() {
  const { supabase } = await requirePosUser();
  const { data, error } = await supabase
    .from("categories")
    .select("id, name")
    .is("parent_id", null)
    .order("sort_order")
    .order("name");
  if (error) throw new Error(`Could not load categories: ${error.message}`);
  return data;
}

/** Every category grouped under its top-level one, for the Add product form. */
export async function listCategoryGroups() {
  const { supabase } = await requirePosUser();
  const { data, error } = await supabase
    .from("categories")
    .select("id, name, parent_id, sort_order")
    .order("sort_order")
    .order("name");
  if (error) throw new Error(`Could not load categories: ${error.message}`);
  const tops = data.filter((c) => c.parent_id === null);
  return tops.map((top) => ({
    id: top.id,
    name: top.name,
    children: data.filter((c) => c.parent_id === top.id).map((c) => ({ id: c.id, name: c.name })),
  }));
}

export type ProductVariantDetail = {
  id: string;
  label: string | null;
  sku: string | null;
  barcode: string | null;
  reorderLevel: number;
  priceOverride: number | null;
  onHand: number;
  state: StockState;
  cost: number | null;
};

export type MovementRow = {
  id: number;
  variantId: string;
  change: number;
  kind: MovementKind;
  reason: string | null;
  balanceAfter: number;
  createdAt: string;
  by: string;
};

/** One product with its stock entries, costs (owner) and recent stock history. */
export async function getStockProduct(productId: string) {
  const { supabase, isOwner } = await requirePosUser();
  const { data: p, error } = await supabase
    .from("products")
    .select(
      "id, name, slug, price, is_active, option1_name, option2_name, product_images(url, sort_order), product_categories(categories(name)), product_variants(id, option1_value, option2_value, sku, barcode, reorder_level, price_override, stock_levels(on_hand))",
    )
    .eq("id", productId)
    .order("sort_order", { referencedTable: "product_images" })
    .order("option1_value", { referencedTable: "product_variants" })
    .order("option2_value", { referencedTable: "product_variants" })
    .maybeSingle();
  if (error) throw new Error(`Could not load the product: ${error.message}`);
  if (!p) return null;

  const variantIds = p.product_variants.map((v) => v.id);
  const costs = new Map<string, number>();
  if (isOwner && variantIds.length) {
    const { data: costRows, error: costError } = await supabase
      .from("variant_costs")
      .select("variant_id, cost_price")
      .in("variant_id", variantIds);
    if (costError) throw new Error(`Could not load costs: ${costError.message}`);
    for (const c of costRows) costs.set(c.variant_id, c.cost_price);
  }

  const [{ data: moves, error: movesError }, people] = await Promise.all([
    supabase
      .from("stock_movements")
      .select("id, variant_id, qty_change, kind, reason, balance_after, created_by, created_at")
      .in("variant_id", variantIds.length ? variantIds : ["00000000-0000-0000-0000-000000000000"])
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(50),
    getPeopleNames(),
  ]);
  if (movesError) throw new Error(`Could not load stock history: ${movesError.message}`);

  const variants: ProductVariantDetail[] = p.product_variants.map((v) => {
    const onHand = v.stock_levels?.on_hand ?? 0;
    const label = [v.option1_value, v.option2_value].filter(Boolean).join(" / ") || null;
    return {
      id: v.id,
      label,
      sku: v.sku,
      barcode: v.barcode,
      reorderLevel: v.reorder_level,
      priceOverride: v.price_override,
      onHand,
      state: stockState(onHand, v.reorder_level),
      cost: costs.get(v.id) ?? null,
    };
  });

  const movements: MovementRow[] = moves.map((m) => ({
    id: m.id,
    variantId: m.variant_id,
    change: m.qty_change,
    kind: m.kind,
    reason: m.reason,
    balanceAfter: m.balance_after,
    createdAt: m.created_at,
    by: (m.created_by && people.get(m.created_by)) || "Someone no longer here",
  }));

  return {
    id: p.id,
    name: p.name,
    slug: p.slug,
    price: p.price,
    onWebsite: p.is_active,
    hasOptions: p.option1_name !== null,
    imageUrl: p.product_images[0]?.url ?? null,
    categories: p.product_categories.map((c) => c.categories?.name).filter((n): n is string => Boolean(n)),
    variants,
    movements,
  };
}

/** user id → name, for "who did it". */
export async function getPeopleNames(): Promise<Map<string, string>> {
  const { supabase } = await requirePosUser();
  const { data, error } = await supabase.rpc("pos_people");
  if (error) throw new Error(`Could not load people: ${error.message}`);
  return new Map(data.map((p) => [p.user_id, p.display_name?.trim() || (p.role === "owner" ? "Owner" : "Staff")]));
}
