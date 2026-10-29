import "server-only";
import { requirePosUser } from "@/lib/server/pos/auth";
import { getPeopleNames } from "@/lib/server/pos/stock";

export type CountLine = { variantId: string; expected: number; counted: number };

/** The stock count in progress, if any, with its lines. */
export async function getOpenCount() {
  const { supabase } = await requirePosUser();
  const { data: count, error } = await supabase
    .from("stock_counts")
    .select("id, note, created_at, created_by, stock_count_lines(variant_id, expected, counted)")
    .eq("status", "open")
    .maybeSingle();
  if (error) throw new Error(`Could not load the stock count: ${error.message}`);
  if (!count) return null;

  const people = await getPeopleNames();
  const lines: CountLine[] = count.stock_count_lines.map((l) => ({ variantId: l.variant_id, expected: l.expected, counted: l.counted }));
  return {
    id: count.id,
    note: count.note,
    createdAt: count.created_at,
    by: (count.created_by && people.get(count.created_by)) || "Someone no longer here",
    lines,
  };
}

/** Lines of the open count that differ from the shelf, with their names. */
export async function getCountDifferences(lines: CountLine[]) {
  const differing = lines.filter((l) => l.counted !== l.expected);
  if (!differing.length) return [];
  const { supabase } = await requirePosUser();
  const { data, error } = await supabase
    .from("pos_stock_rows")
    .select("variant_id, product_name, option_label, sku")
    .in("variant_id", differing.map((l) => l.variantId));
  if (error) throw new Error(`Could not load the differences: ${error.message}`);
  const names = new Map(data.map((r) => [r.variant_id!, r]));
  return differing
    .map((l) => ({ ...l, row: names.get(l.variantId) }))
    .filter((l) => l.row)
    .map((l) => ({
      variantId: l.variantId,
      productName: l.row!.product_name ?? "",
      optionLabel: l.row!.option_label,
      sku: l.row!.sku,
      expected: l.expected,
      counted: l.counted,
    }))
    .sort((a, b) => a.productName.localeCompare(b.productName));
}

/** The last few finished or cancelled counts, with how many items each changed. */
export async function listRecentCounts(limit = 8) {
  const { supabase } = await requirePosUser();
  const { data: counts, error } = await supabase
    .from("stock_counts")
    .select("id, status, note, created_at, finished_at, finished_by")
    .neq("status", "open")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(`Could not load past counts: ${error.message}`);
  if (!counts.length) return [];

  const [{ data: moves, error: movesError }, people] = await Promise.all([
    supabase.from("stock_movements").select("count_id").in("count_id", counts.map((c) => c.id)),
    getPeopleNames(),
  ]);
  if (movesError) throw new Error(`Could not load past counts: ${movesError.message}`);
  const changed = new Map<string, number>();
  for (const m of moves) if (m.count_id) changed.set(m.count_id, (changed.get(m.count_id) ?? 0) + 1);

  return counts.map((c) => ({
    id: c.id,
    status: c.status,
    note: c.note,
    createdAt: c.created_at,
    finishedAt: c.finished_at,
    by: (c.finished_by && people.get(c.finished_by)) || "—",
    changed: changed.get(c.id) ?? 0,
  }));
}
