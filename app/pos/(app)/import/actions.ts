"use server";

import { revalidatePath } from "next/cache";
import { friendlyDbError } from "@/lib/pos/errors";
import { importBatchSchema, type ImportBatch } from "@/lib/pos/schemas";
import { requirePosUser } from "@/lib/server/pos/auth";

export type ImportRowResult = { row: number; action: "new" | "update" | "skip" | "error"; message: string };
export type ImportBatchResult = { ok: true; results: ImportRowResult[] } | { ok: false; message: string };

/**
 * One batch of an import: a dry run (apply false) reports what each row would
 * do; apply saves it. The database does the matching (see the pos_import migration).
 */
export async function importBatch(input: ImportBatch): Promise<ImportBatchResult> {
  const { supabase, isOwner } = await requirePosUser();
  if (!isOwner) return { ok: false, message: "Only the owner can import data." };
  const parsed = importBatchSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: "Some rows couldn't be read. Check the file again." };
  const b = parsed.data;

  const { data, error } =
    b.kind === "products"
      ? await supabase.rpc("pos_import_products", { p_rows: b.rows, p_apply: b.apply, p_update_prices: b.updatePrices, p_set_stock: b.setStock })
      : b.kind === "customers" || b.kind === "suppliers"
        ? await supabase.rpc("pos_import_people", { p_kind: b.kind, p_rows: b.rows, p_apply: b.apply })
        : await supabase.rpc("pos_import_records", { p_kind: b.kind, p_rows: b.rows, p_apply: b.apply });
  if (error) return { ok: false, message: friendlyDbError(error, "The import stopped. Nothing in this batch was saved; try again.") };
  if (b.apply) revalidatePath("/pos", "layout");
  return { ok: true, results: data as unknown as ImportRowResult[] };
}
