"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { friendlyDbError } from "@/lib/pos/errors";
import { returnSchema, type ReturnInput } from "@/lib/pos/schemas";
import { requirePosUser } from "@/lib/server/pos/auth";
import { findSaleIdByCode } from "@/lib/server/pos/records";
import { refreshPosAndShop } from "@/lib/server/pos/refresh";
import { findTileByCode, listSellTiles, type SellTile } from "@/lib/server/pos/sell";

export type CreateReturnResult = { ok: true; id: string } | { ok: false; message: string };

/**
 * Records a return. Items from a sale use the price it was sold at; the
 * database checks nothing is returned twice and puts "back on shelf" items
 * back on the shelf count.
 */
export async function createReturn(input: ReturnInput): Promise<CreateReturnResult> {
  const { supabase } = await requirePosUser();
  const parsed = returnSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0].message };
  const r = parsed.data;

  const { data, error } = await supabase.rpc("pos_create_return", {
    p: {
      sale_id: r.saleId,
      customer_id: r.customerId,
      note: r.note,
      lines: r.lines.map((l) => ({ sale_item_id: l.saleItemId, variant_id: l.variantId, qty: l.qty, back_on_shelf: l.backOnShelf })),
      refund_total: r.refundTotal,
      refund: r.refundNow && r.refundTotal > 0 ? { method: r.method, amount: r.refundTotal } : null,
    },
  });
  if (error || !data?.[0]) return { ok: false, message: friendlyDbError(error, "The return wasn't saved. Please try again.") };
  refreshPosAndShop();
  return { ok: true, id: data[0].return_id };
}

/** "Find the sale": the code from the receipt, e.g. SL_1210. */
export async function openSaleForReturn(_prev: { message: string } | null, formData: FormData): Promise<{ message: string }> {
  await requirePosUser();
  const code = z.string().max(20).catch("").parse(formData.get("code"));
  const id = await findSaleIdByCode(code);
  if (!id) return { message: `No sale ${code.trim() || "with that number"}. Check the receipt, or return it without a receipt.` };
  redirect(`/pos/returns/new?sale=${id}`);
}

/** Products for a return without a receipt. */
export async function findReturnProducts(query: string): Promise<SellTile[]> {
  await requirePosUser();
  const q = z.string().max(100).catch("").parse(query).trim();
  if (!q) return [];
  const exact = await findTileByCode(q);
  if (exact) return [exact];
  return (await listSellTiles({ search: q })).tiles.slice(0, 10);
}
