import "server-only";
import { DELIVERY_SETTINGS_COLUMNS, pricingFromSettings, type DeliveryArea, type DeliveryPricing, type DeliverySettingsRow, type LatLng } from "@/lib/delivery";
import type { PosUser } from "./auth";

export type DeliveryPriceList = {
  pricing: DeliveryPricing;
  /** Where every distance starts; null until the owner sets it. */
  shop: LatLng | null;
  areas: DeliveryArea[];
};

/** The delivery pricing and the areas (in use only, unless all), by distance. */
export async function loadDeliveryPriceList(supabase: PosUser["supabase"], { all = false } = {}): Promise<DeliveryPriceList> {
  let areasQuery = supabase.from("delivery_areas").select("id, name, km, is_active").order("km").order("name");
  if (!all) areasQuery = areasQuery.eq("is_active", true);
  const [settings, areas] = await Promise.all([
    supabase.from("settings").select(DELIVERY_SETTINGS_COLUMNS).eq("id", 1).single(),
    areasQuery,
  ]);
  if (settings.error) throw new Error(`Could not load the delivery prices: ${settings.error.message}`);
  if (areas.error) throw new Error(`Could not load the delivery areas: ${areas.error.message}`);
  const row = settings.data as unknown as DeliverySettingsRow & { shop_lat: number | null; shop_lng: number | null };
  return {
    pricing: pricingFromSettings(row),
    shop: row.shop_lat === null || row.shop_lng === null ? null : { lat: Number(row.shop_lat), lng: Number(row.shop_lng) },
    areas: areas.data.map((a) => ({ id: a.id, name: a.name, km: Number(a.km), isActive: a.is_active })),
  };
}
