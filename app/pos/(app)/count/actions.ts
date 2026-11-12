"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { friendlyDbError } from "@/lib/pos/errors";
import { countPartsSchema } from "@/lib/pos/schemas";
import { requirePosUser } from "@/lib/server/pos/auth";
import { refreshPosAndShop } from "@/lib/server/pos/refresh";
import type { ActionResult } from "../products/actions";

const NOT_ALLOWED = { ok: false, message: "You are not allowed to count stock. Ask the owner to switch it on for you." } as const;

/** The place a count is for (1 = the shop); missing or bad: the shop. */
const placeIdSchema = z.coerce.number().int().min(1).max(32767).catch(1);

export async function startCount(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const { supabase, canAdjustStock } = await requirePosUser();
  if (!canAdjustStock) return NOT_ALLOWED;
  const note = z.string().trim().max(300).safeParse(formData.get("note") ?? "");
  if (!note.success) return { ok: false, message: "Keep the note under 300 characters." };
  const placeId = placeIdSchema.parse(formData.get("placeId"));

  const { error } = await supabase.rpc("pos_start_count", { p_note: note.data, p_location: placeId });
  if (error) return { ok: false, message: friendlyDbError(error) };
  revalidatePath("/pos/count");
  return { ok: true, message: "Count started." };
}

/** Saves one counted product as cartons + singles (both empty clears it); the database works out the total. */
export async function saveCountLine(countId: string, variantId: string, cartons: string, singles: string): Promise<ActionResult> {
  const { supabase, canAdjustStock } = await requirePosUser();
  if (!canAdjustStock) return NOT_ALLOWED;
  const parsed = countPartsSchema.safeParse({ countId, variantId, cartons: cartons.trim(), singles: singles.trim() });
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0].message };
  const p = parsed.data;

  const { error } = await supabase.rpc("pos_save_count_line", {
    p_count_id: p.countId,
    p_variant_id: p.variantId,
    // null leaves that part empty; the generated type doesn't know the function takes null.
    p_cartons: p.cartons as number,
    p_singles: p.singles as number,
  });
  if (error) return { ok: false, message: friendlyDbError(error) };
  revalidatePath("/pos/count");
  return { ok: true, message: p.cartons === null && p.singles === null ? "Cleared." : "Saved." };
}

/** How many single items are in a carton of a product (empty clears it). */
export async function setCartonSize(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const { supabase, canAdjustStock } = await requirePosUser();
  if (!canAdjustStock) return NOT_ALLOWED;
  const parsed = z
    .object({
      variantId: z.uuid(),
      units: z.union([
        z.literal(""),
        z.coerce.number().int("Whole numbers only.").min(2, "A carton holds 2 or more items.").max(10000, "At most 10,000 items."),
      ]),
    })
    .safeParse({ variantId: formData.get("variantId"), units: String(formData.get("units") ?? "").trim() });
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0].message };

  const units = parsed.data.units === "" ? null : parsed.data.units;
  const { error } = await supabase.rpc("pos_set_carton_size", {
    p_variant_id: parsed.data.variantId,
    // null clears it; the generated type doesn't know the function takes null.
    p_units: units as number,
  });
  if (error) return { ok: false, message: friendlyDbError(error) };
  revalidatePath("/pos", "layout");
  return { ok: true, message: units ? `A carton holds ${units}.` : "Carton size cleared." };
}

export async function finishCount(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const { supabase, canAdjustStock } = await requirePosUser();
  if (!canAdjustStock) return NOT_ALLOWED;
  const id = z.uuid().safeParse(formData.get("countId"));
  if (!id.success) return { ok: false, message: "Unknown stock count." };

  const { data: changed, error } = await supabase.rpc("pos_finish_count", { p_count_id: id.data });
  if (error) return { ok: false, message: friendlyDbError(error) };
  refreshPosAndShop();
  // The count is gone from the page once finished, so the result goes in the address.
  redirect(`/pos/count?place=${placeIdSchema.parse(formData.get("placeId"))}&finished=${changed}`);
}

export async function cancelCount(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const { supabase, canAdjustStock } = await requirePosUser();
  if (!canAdjustStock) return NOT_ALLOWED;
  const id = z.uuid().safeParse(formData.get("countId"));
  if (!id.success) return { ok: false, message: "Unknown stock count." };

  const { error } = await supabase.rpc("pos_cancel_count", { p_count_id: id.data });
  if (error) return { ok: false, message: friendlyDbError(error) };
  revalidatePath("/pos/count");
  redirect(`/pos/count?place=${placeIdSchema.parse(formData.get("placeId"))}&cancelled=1`);
}
