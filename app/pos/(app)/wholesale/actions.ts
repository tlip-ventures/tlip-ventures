"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { parseCedis } from "@/lib/money";
import { friendlyDbError } from "@/lib/pos/errors";
import { requirePosUser } from "@/lib/server/pos/auth";
import type { ActionResult } from "../products/actions";

const priceSchema = z.object({
  productId: z.uuid(),
  // Cedis as typed; empty: no wholesale price (sold at the normal price).
  price: z
    .string()
    .trim()
    .max(20)
    .transform((v, ctx) => {
      if (v === "") return null;
      const pesewas = parseCedis(v);
      if (pesewas === null) {
        ctx.addIssue({ code: "custom", message: "Enter the wholesale price like 55 or 12.50, or leave it empty." });
        return z.NEVER;
      }
      return pesewas;
    }),
});

/** Owner: a product's wholesale price (empty clears it). The database checks the owner too. */
export async function setWholesalePrice(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const { supabase, isOwner } = await requirePosUser();
  if (!isOwner) return { ok: false, message: "Only the owner can set wholesale prices." };
  const parsed = priceSchema.safeParse({ productId: formData.get("productId"), price: formData.get("price") ?? "" });
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0].message };
  const { error } = await supabase.rpc("pos_set_wholesale_price", {
    p_product_id: parsed.data.productId,
    // null clears it; the generated type doesn't know it accepts null.
    p_price: parsed.data.price as number,
  });
  if (error) return { ok: false, message: friendlyDbError(error) };
  revalidatePath("/pos/wholesale");
  revalidatePath("/pos/sell");
  return { ok: true, message: parsed.data.price === null ? "Wholesale price removed." : "Saved." };
}
