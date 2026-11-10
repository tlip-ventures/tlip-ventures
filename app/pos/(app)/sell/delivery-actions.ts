"use server";

import { revalidatePath } from "next/cache";
import { friendlyDbError } from "@/lib/pos/errors";
import { newDeliveryAreaSchema, placeSearchSchema } from "@/lib/pos/schemas";
import { findDeliveryPlaces, type FoundPlace } from "@/lib/server/delivery-distance";
import { requirePosUser } from "@/lib/server/pos/auth";
import { loadDeliveryPriceList } from "@/lib/server/pos/delivery";

export type { FoundPlace };

/** Till: find a place that isn't on the price list and measure it from the shop. */
export async function searchDeliveryPlace(text: string): Promise<{ ok: true; places: FoundPlace[] } | { ok: false; message: string }> {
  const { supabase } = await requirePosUser();
  const parsed = placeSearchSchema.safeParse(text);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0].message };
  const { shop } = await loadDeliveryPriceList(supabase);
  if (!shop) return { ok: false, message: "The shop's position isn't set yet. The owner sets it under Settings, Delivery prices." };
  return findDeliveryPlaces(parsed.data, shop);
}

/** Till: keep a place found on the map on the price list, so it is there next time. */
export async function addDeliveryArea(input: { name: string; km: number; lat: number | null; lng: number | null }): Promise<
  { ok: true; id: string } | { ok: false; message: string }
> {
  const { supabase } = await requirePosUser();
  const parsed = newDeliveryAreaSchema.safeParse({ ...input, km: String(input.km) });
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0].message };
  const a = parsed.data;
  const { data, error } = await supabase.rpc("pos_add_delivery_area", { p_name: a.name, p_km: a.km, p_lat: a.lat as number, p_lng: a.lng as number });
  if (error) return { ok: false, message: friendlyDbError(error) };
  revalidatePath("/pos/sell");
  revalidatePath("/pos/settings/delivery");
  return { ok: true, id: data };
}
