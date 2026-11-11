import { formatPesewas, type Pesewas } from "@/lib/money";

// Delivery prices by distance (motorbike). The fee depends on the road
// distance from the shop: a base fee for the first few km, a rate per km up to
// a middle point, a lower rate after that, rounded up. Very close drops pay a
// flat fee. An area on the list can have its own set price instead. Bigger
// orders get a delivery discount (levels by order size). Used by the till now
// and by the website checkout later, so both always agree. Distances are kept
// in tenths of a km and money in pesewas, so no floats are rounded along the way.

/** A delivery discount level: orders (items after any discount) of at least `from` get `off` taken off the fee; off null = free delivery. */
export type DeliveryDiscount = { from: Pesewas; off: Pesewas | null };

/** At most this many discount levels. */
export const MAX_DELIVERY_DISCOUNTS = 5;

export type DeliveryPricing = {
  /** Pesewas: covers the first baseKm. */
  baseFee: Pesewas;
  baseKm: number;
  /** Pesewas per km from baseKm up to midEndKm. */
  midRate: Pesewas;
  midEndKm: number;
  /** Pesewas per km after midEndKm. */
  farRate: Pesewas;
  /** Pesewas: the fee is rounded up to a multiple of this (500 = the next GH₵ 5). */
  roundTo: Pesewas;
  /** Up to this many km is "very close": a flat closeFee. */
  closeKm: number;
  closeFee: Pesewas;
  /** Further than this: no price, agree it on WhatsApp. */
  maxKm: number;
  /** Discount levels by order size, lowest first. Empty: no delivery discount. */
  discounts: DeliveryDiscount[];
};

/**
 * The prices the owner approved (11 November 2026): GH₵ 20 for the first 2 km,
 * GH₵ 4 per km to 7 km, GH₵ 1.50 per km after, rounded up to GH₵ 5; GH₵ 20
 * within 1 km. The database holds the live ones (settings.delivery_*).
 */
export const DEFAULT_DELIVERY_PRICING: DeliveryPricing = {
  baseFee: 2000,
  baseKm: 2,
  midRate: 400,
  midEndKm: 7,
  farRate: 150,
  roundTo: 500,
  closeKm: 1,
  closeFee: 2000,
  maxKm: 65,
  discounts: [{ from: 100000, off: 4000 }],
};

/** The settings columns the pricing comes from. */
export const DELIVERY_SETTINGS_COLUMNS =
  "delivery_base_fee, delivery_base_km, delivery_mid_rate, delivery_mid_end_km, delivery_far_rate, delivery_round_to, " +
  "delivery_close_km, delivery_close_fee, delivery_max_km, delivery_discounts, shop_lat, shop_lng";

export type DeliverySettingsRow = {
  delivery_base_fee: number;
  delivery_base_km: number;
  delivery_mid_rate: number;
  delivery_mid_end_km: number;
  delivery_far_rate: number;
  delivery_round_to: number;
  delivery_close_km: number;
  delivery_close_fee: number;
  delivery_max_km: number;
  /** [{ from, off }] as saved; checked by readDiscounts. */
  delivery_discounts: unknown;
};

/** Discount levels as saved in the database, keeping only well-formed ones, lowest first. */
export function readDiscounts(value: unknown): DeliveryDiscount[] {
  if (!Array.isArray(value)) return [];
  const whole = (v: unknown) => typeof v === "number" && Number.isSafeInteger(v) && v >= 0;
  return value
    .filter((d): d is { from: number; off: number | null } => {
      if (!d || typeof d !== "object") return false;
      const { from, off } = d as { from?: unknown; off?: unknown };
      return whole(from) && (off === null || whole(off));
    })
    .map((d) => ({ from: d.from, off: d.off }))
    .sort((a, b) => a.from - b.from)
    .slice(0, MAX_DELIVERY_DISCOUNTS);
}

/** The pricing as the settings row holds it (numeric columns may arrive as strings). */
export function pricingFromSettings(row: DeliverySettingsRow): DeliveryPricing {
  const n = (v: number | string) => Number(v);
  return {
    baseFee: n(row.delivery_base_fee),
    baseKm: n(row.delivery_base_km),
    midRate: n(row.delivery_mid_rate),
    midEndKm: n(row.delivery_mid_end_km),
    farRate: n(row.delivery_far_rate),
    roundTo: n(row.delivery_round_to),
    closeKm: n(row.delivery_close_km),
    closeFee: n(row.delivery_close_fee),
    maxKm: n(row.delivery_max_km),
    discounts: readDiscounts(row.delivery_discounts),
  };
}

/** An area on the price list, with its road distance from the shop and, when the owner set one, its own price (pesewas). */
export type DeliveryArea = { id: string; name: string; km: number; isActive: boolean; fixedFee: Pesewas | null };

/** Areas whose name has every word typed, best matches (name starts with it) first. */
export function matchAreas<T extends { name: string }>(areas: readonly T[], text: string, limit = 8): T[] {
  const words = text.toLowerCase().split(/[\s,]+/).filter(Boolean);
  if (words.length === 0) return [];
  const q = words.join(" ");
  return areas
    .filter((a) => {
      const name = a.name.toLowerCase();
      return words.every((w) => name.includes(w));
    })
    .sort((a, b) => Number(!a.name.toLowerCase().startsWith(q)) - Number(!b.name.toLowerCase().startsWith(q)))
    .slice(0, limit);
}

/** The farthest distance the price list takes, in km. */
export const MAX_DELIVERY_KM = 999.9;

const tenths = (km: number) => Math.round(km * 10);

/** A distance rounded to one decimal, as it is shown and stored: 17.26 → 17.3. */
export function roundKm(km: number): number {
  return tenths(km) / 10;
}

/** "17.3 km" */
export function formatKm(km: number): string {
  return `${roundKm(km).toLocaleString("en-GB", { maximumFractionDigits: 1 })} km`;
}

/**
 * The delivery fee for a road distance, in pesewas; null when it is further
 * than the shop delivers by motorbike (agree it on WhatsApp).
 *
 * fee = baseFee + midRate × (km between baseKm and midEndKm) + farRate × (km beyond midEndKm),
 * rounded up to the next roundTo. Up to closeKm: closeFee.
 */
export function deliveryFeeForKm(km: number, p: DeliveryPricing): Pesewas | null {
  if (!Number.isFinite(km) || km < 0) return null;
  const d = tenths(km);
  if (d > tenths(p.maxKm)) return null;
  if (d <= tenths(p.closeKm)) return p.closeFee;
  const base = tenths(p.baseKm);
  const midEnd = Math.max(base, tenths(p.midEndKm));
  const mid = Math.max(0, Math.min(d, midEnd) - base);
  const far = Math.max(0, d - midEnd);
  // In tenths of a pesewa: the rates are per km and the distances in tenths of a km.
  const raw = p.baseFee * 10 + p.midRate * mid + p.farRate * far;
  const step = Math.max(1, p.roundTo) * 10;
  return (Math.ceil(raw / step) * step) / 10;
}

/** An area's price: its set price when the owner gave it one, else the formula for its distance (null: too far). */
export function areaFee(area: { km: number; fixedFee?: Pesewas | null }, p: DeliveryPricing): Pesewas | null {
  return area.fixedFee != null ? area.fixedFee : deliveryFeeForKm(area.km, p);
}

/** The discount level an order of this many pesewas of items (after any discount) reaches, or null. */
export function discountLevel(itemsTotal: Pesewas, discounts: readonly DeliveryDiscount[]): DeliveryDiscount | null {
  let best: DeliveryDiscount | null = null;
  for (const d of discounts) if (itemsTotal >= d.from && (best === null || d.from >= best.from)) best = d;
  return best;
}

/** How much the order's discount level takes off the fee: the whole fee for free delivery, never more than the fee. */
export function deliveryDiscountOff(fee: Pesewas, itemsTotal: Pesewas, p: DeliveryPricing): Pesewas {
  const level = discountLevel(itemsTotal, p.discounts);
  if (!level) return 0;
  return level.off === null ? fee : Math.min(fee, level.off);
}

export type DeliveryQuote =
  | { kind: "fee"; listFee: Pesewas; fixed: boolean; discount: Pesewas; level: DeliveryDiscount | null; fee: Pesewas }
  | { kind: "too_far" };

/** The fee for an area (or a place found on the map) and an order: its price, less the order's delivery discount. */
export function deliveryQuote(
  area: { km: number; fixedFee?: Pesewas | null },
  itemsTotal: Pesewas,
  p: DeliveryPricing,
): DeliveryQuote {
  const listFee = areaFee(area, p);
  if (listFee === null) return { kind: "too_far" };
  const discount = deliveryDiscountOff(listFee, itemsTotal, p);
  const level = discount > 0 ? discountLevel(itemsTotal, p.discounts) : null;
  return { kind: "fee", listFee, fixed: area.fixedFee != null, discount, level, fee: listFee - discount };
}

/** "Orders of GH₵ 1,000 or more: GH₵ 40 off delivery" / "…: free delivery". */
export function describeDiscount(d: DeliveryDiscount): string {
  return `Orders of ${formatPesewas(d.from)} or more: ${d.off === null ? "free delivery" : `${formatPesewas(d.off)} off delivery`}`;
}

/** One line explaining the formula, for the settings page. */
export function describePricing(p: DeliveryPricing): string {
  return (
    `${formatPesewas(p.baseFee)} for the first ${formatKm(p.baseKm)}, ` +
    `then ${formatPesewas(p.midRate)} per km up to ${formatKm(p.midEndKm)}, ` +
    `then ${formatPesewas(p.farRate)} per km, rounded up to the next ${formatPesewas(p.roundTo)}. ` +
    `Up to ${formatKm(p.closeKm)}: ${formatPesewas(p.closeFee)}.`
  );
}

export type LatLng = { lat: number; lng: number };

function validLatLng(lat: number, lng: number): LatLng | null {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  return { lat, lng };
}

/**
 * A location pasted at the till: a Google Maps link with the position in it
 * (…?q=5.567,-0.256, …/@5.567,-0.256,17z, …!3d5.567!4d-0.256) or plain
 * "5.567, -0.256". Null when the text holds no position (a place name, or a
 * short maps.app.goo.gl link, which the server opens first).
 */
export function coordinatesFromText(text: string): LatLng | null {
  let t = text.trim().replace(/\+/g, " ");
  try {
    t = decodeURIComponent(t);
  } catch {
    // Not URL-encoded: read it as it is.
  }
  const pair = "(-?\\d{1,2}\\.\\d+)\\s*,\\s*(-?\\d{1,3}\\.\\d+)";
  const patterns = [
    new RegExp(`^${pair}$`),
    new RegExp(`!3d(-?\\d{1,2}\\.\\d+)!4d(-?\\d{1,3}\\.\\d+)`),
    new RegExp(`[?&](?:q|query|ll|destination|daddr)=(?:loc:)?${pair}`),
    new RegExp(`@${pair}`),
    new RegExp(`/maps/(?:place|search|dir)/[^?]*?${pair}`),
  ];
  for (const re of patterns) {
    const m = re.exec(t);
    if (m) return validLatLng(Number(m[1]), Number(m[2]));
  }
  return null;
}

/** A short Google Maps share link (maps.app.goo.gl/…, goo.gl/maps/…) that must be opened to find the position. */
export function isShortMapsLink(text: string): boolean {
  return /^https?:\/\/(maps\.app\.goo\.gl|goo\.gl\/maps)\/[A-Za-z0-9_-]+/i.test(text.trim());
}

/** Straight-line distance in km ("as the crow flies"). */
export function straightLineKm(a: LatLng, b: LatLng): number {
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

/** Roads in Accra wind: when the road distance can't be measured, the straight line times this is a fair guess. */
export const ROAD_FACTOR = 1.35;
