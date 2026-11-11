"use server";

import { revalidatePath } from "next/cache";
import { friendlyDbError } from "@/lib/pos/errors";
import { deliveryAreaUpdateSchema, deliveryDiscountsSchema, deliveryPricingSchema, newDeliveryAreaSchema, placeSearchSchema } from "@/lib/pos/schemas";
import { findDeliveryPlaces, resolveMapPosition } from "@/lib/server/delivery-distance";
import { requirePosUser } from "@/lib/server/pos/auth";
import { loadDeliveryPriceList } from "@/lib/server/pos/delivery";
import type { ActionResult } from "../../products/actions";

const OWNER_ONLY = { ok: false, message: "Only the owner can change delivery prices." } as const;

const refresh = () => {
  revalidatePath("/pos/settings/delivery");
  revalidatePath("/pos/sell");
};

/** Owner: the price formula and where the shop is. */
export async function saveDeliveryPricing(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const { supabase, isOwner } = await requirePosUser();
  if (!isOwner) return OWNER_ONLY;
  const field = (name: string) => String(formData.get(name) ?? "");
  const parsed = deliveryPricingSchema.safeParse({
    baseFee: field("baseFee"),
    baseKm: field("baseKm"),
    midRate: field("midRate"),
    midEndKm: field("midEndKm"),
    farRate: field("farRate"),
    roundTo: field("roundTo"),
    closeKm: field("closeKm"),
    closeFee: field("closeFee"),
    maxKm: field("maxKm"),
    shopLocation: field("shopLocation"),
  });
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0].message };
  const p = parsed.data;
  if (p.midEndKm < p.baseKm) return { ok: false, message: "The middle band must end at or after the km the base fee covers." };

  let shop: { shop_lat: number; shop_lng: number } | Record<string, never> = {};
  if (p.shopLocation) {
    const pin = await resolveMapPosition(p.shopLocation);
    if (!pin) return { ok: false, message: "Paste the shop’s Google Maps link, or a position like 5.5675, -0.2567." };
    shop = { shop_lat: pin.lat, shop_lng: pin.lng };
  }

  const { error } = await supabase
    .from("settings")
    .update({
      delivery_base_fee: p.baseFee,
      delivery_base_km: p.baseKm,
      delivery_mid_rate: p.midRate,
      delivery_mid_end_km: p.midEndKm,
      delivery_far_rate: p.farRate,
      delivery_round_to: p.roundTo,
      delivery_close_km: p.closeKm,
      delivery_close_fee: p.closeFee,
      delivery_max_km: p.maxKm,
      ...shop,
    })
    .eq("id", 1);
  if (error) return { ok: false, message: friendlyDbError(error) };
  refresh();
  return { ok: true, message: "Saved. The till uses the new prices now." };
}

/** Owner: delivery discounts by order size (up to 5 levels). */
export async function saveDeliveryDiscounts(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const { supabase, isOwner } = await requirePosUser();
  if (!isOwner) return OWNER_ONLY;
  const froms = formData.getAll("from").map(String);
  const offs = formData.getAll("off").map(String);
  const free = new Set(formData.getAll("free").map(String));
  const parsed = deliveryDiscountsSchema.safeParse(froms.map((from, i) => ({ from, off: offs[i] ?? "", free: free.has(String(i)) })));
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0].message };
  const { error } = await supabase.from("settings").update({ delivery_discounts: parsed.data }).eq("id", 1);
  if (error) return { ok: false, message: friendlyDbError(error) };
  refresh();
  return { ok: true, message: parsed.data.length ? "Saved. The till uses these discounts now." : "Saved: no delivery discounts." };
}

/** Owner: rename an area, change its km or set price, or take it off the list. */
export async function updateDeliveryArea(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const { supabase, isOwner } = await requirePosUser();
  if (!isOwner) return OWNER_ONLY;
  const parsed = deliveryAreaUpdateSchema.safeParse({
    id: formData.get("id"),
    name: String(formData.get("name") ?? ""),
    km: String(formData.get("km") ?? ""),
    isActive: formData.get("isActive") === "on",
    fixedFee: String(formData.get("fixedFee") ?? ""),
  });
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0].message };
  const a = parsed.data;
  const { error } = await supabase.rpc("pos_update_delivery_area", {
    p_id: a.id,
    p_name: a.name,
    p_km: a.km,
    p_is_active: a.isActive,
    // Null: the formula prices it.
    p_fixed_fee: a.fixedFee as number,
  });
  if (error) return { ok: false, message: friendlyDbError(error) };
  refresh();
  return { ok: true, message: "Saved." };
}

/** Owner: add an area with its distance typed in (from Google Maps directions) or measured with "Find on the map". */
export async function addDeliveryAreaByHand(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const { supabase, isOwner } = await requirePosUser();
  if (!isOwner) return OWNER_ONLY;
  const lat = formData.get("lat") ? Number(formData.get("lat")) : null;
  const lng = formData.get("lng") ? Number(formData.get("lng")) : null;
  const parsed = newDeliveryAreaSchema.safeParse({
    name: String(formData.get("name") ?? ""),
    km: String(formData.get("km") ?? ""),
    lat: Number.isFinite(lat) ? lat : null,
    lng: Number.isFinite(lng) ? lng : null,
  });
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0].message };
  const a = parsed.data;
  const exists = await supabase.from("delivery_areas").select("id").ilike("name", a.name.replace(/[%_\\]/g, "\\$&")).maybeSingle();
  if (exists.data) return { ok: false, message: `${a.name} is already on the list. Change its km there.` };
  const { error } = await supabase.rpc("pos_add_delivery_area", { p_name: a.name, p_km: a.km, p_lat: a.lat as number, p_lng: a.lng as number });
  if (error) return { ok: false, message: friendlyDbError(error) };
  refresh();
  return { ok: true, message: `${a.name} added.` };
}

/** Owner: measure a place by road from the shop, to fill in an area's km. */
export async function measurePlace(text: string) {
  const { supabase, isOwner } = await requirePosUser();
  if (!isOwner) return OWNER_ONLY;
  const parsed = placeSearchSchema.safeParse(text);
  if (!parsed.success) return { ok: false as const, message: parsed.error.issues[0].message };
  const { shop } = await loadDeliveryPriceList(supabase);
  if (!shop) return { ok: false as const, message: "Set the shop’s position first (above)." };
  return findDeliveryPlaces(parsed.data, shop);
}
