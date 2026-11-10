import { formatPesewas, type Pesewas } from "@/lib/money";

// Delivery prices by distance (motorbike). The fee depends only on the road
// distance from the shop: a base fee for the first few km, a rate per km up to
// a middle point, a lower rate after that, rounded up. Very close drops pay a
// flat fee. Used by the till now and by the website checkout later, so both
// always agree. Distances are kept in tenths of a km and money in pesewas, so
// no floats are rounded along the way.

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
  /** Free delivery: orders (items after any discount) of at least freeFrom get freeOff taken off the fee. Null: no free delivery. */
  freeFrom: Pesewas | null;
  freeOff: Pesewas;
};

/** The prices the owner approved (November 2026). The database holds the live ones (settings.delivery_*). */
export const DEFAULT_DELIVERY_PRICING: DeliveryPricing = {
  baseFee: 2000,
  baseKm: 3,
  midRate: 300,
  midEndKm: 10,
  farRate: 150,
  roundTo: 500,
  closeKm: 1,
  closeFee: 1000,
  maxKm: 65,
  freeFrom: 100000,
  freeOff: 4000,
};

/** The settings columns the pricing comes from. */
export const DELIVERY_SETTINGS_COLUMNS =
  "delivery_base_fee, delivery_base_km, delivery_mid_rate, delivery_mid_end_km, delivery_far_rate, delivery_round_to, " +
  "delivery_close_km, delivery_close_fee, delivery_max_km, delivery_free_from, delivery_free_off, shop_lat, shop_lng";

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
  delivery_free_from: number | null;
  delivery_free_off: number;
};

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
    freeFrom: row.delivery_free_from === null ? null : n(row.delivery_free_from),
    freeOff: n(row.delivery_free_off),
  };
}

/** An area on the price list, with its road distance from the shop. */
export type DeliveryArea = { id: string; name: string; km: number; isActive: boolean };

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

/** How much free delivery takes off the fee for an order of this many pesewas of items (after any discount). */
export function freeDeliveryOff(fee: Pesewas, itemsTotal: Pesewas, p: DeliveryPricing): Pesewas {
  if (p.freeFrom === null || p.freeOff <= 0 || itemsTotal < p.freeFrom) return 0;
  return Math.min(fee, p.freeOff);
}

export type DeliveryQuote =
  | { kind: "fee"; listFee: Pesewas; freeOff: Pesewas; fee: Pesewas }
  | { kind: "too_far" };

/** The fee for a distance and an order: the price list, less free delivery when the order qualifies. */
export function deliveryQuote(km: number, itemsTotal: Pesewas, p: DeliveryPricing): DeliveryQuote {
  const listFee = deliveryFeeForKm(km, p);
  if (listFee === null) return { kind: "too_far" };
  const off = freeDeliveryOff(listFee, itemsTotal, p);
  return { kind: "fee", listFee, freeOff: off, fee: listFee - off };
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
