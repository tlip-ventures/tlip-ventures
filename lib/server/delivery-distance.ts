import "server-only";
import { coordinatesFromText, isShortMapsLink, roundKm, ROAD_FACTOR, straightLineKm, type LatLng } from "@/lib/delivery";

// Finds a place typed at the till and measures the road distance to it from
// the shop. Uses OpenStreetMap's free services (no key, no cost): Nominatim
// to find the place, the OSRM route server to measure the road. Both ask for
// light use with an identifying User-Agent, which suits a shop's few lookups
// a day. If the road can't be measured, the straight line times ROAD_FACTOR
// stands in, marked as a guess. To switch to Google Maps later, replace
// searchPlaces and roadKm here; nothing else changes.

const USER_AGENT = "shop-delivery-pricing/1.0";
const TIMEOUT_MS = 8000;

export type FoundPlace = {
  /** "Kokrobite" */
  name: string;
  /** "Ga South Municipal District, Greater Accra Region" */
  detail: string;
  lat: number;
  lng: number;
  km: number;
  /** The road couldn't be measured: km is the straight line times ROAD_FACTOR. */
  approximate: boolean;
};

export type PlaceSearch = { ok: true; places: FoundPlace[] } | { ok: false; message: string };

async function getJson(url: string): Promise<unknown> {
  const res = await fetch(url, {
    headers: { "User-Agent": USER_AGENT, Accept: "application/json", "Accept-Language": "en" },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

/** Opens a short Google Maps share link (maps.app.goo.gl/…) to find the position it points to. */
async function followShortLink(url: string): Promise<LatLng | null> {
  let next = url.trim();
  for (let hop = 0; hop < 4; hop++) {
    const res = await fetch(next, { redirect: "manual", headers: { "User-Agent": USER_AGENT }, signal: AbortSignal.timeout(TIMEOUT_MS) });
    const location = res.headers.get("location");
    if (!location) return null;
    const found = coordinatesFromText(location);
    if (found) return found;
    next = new URL(location, next).toString();
  }
  return null;
}

type NominatimResult = { lat: string; lon: string; name?: string; display_name?: string };

/** Up to 5 places in Ghana matching the text, nearest Accra first. */
async function searchPlaces(query: string): Promise<Omit<FoundPlace, "km" | "approximate">[]> {
  const params = new URLSearchParams({
    q: query,
    format: "jsonv2",
    limit: "5",
    countrycodes: "gh",
    // Prefer Greater Accra and Kasoa without ruling out the rest of Ghana.
    viewbox: "-0.60,5.95,0.15,5.40",
    bounded: "0",
  });
  const data = (await getJson(`https://nominatim.openstreetmap.org/search?${params}`)) as NominatimResult[];
  if (!Array.isArray(data)) return [];
  return data
    .map((r) => {
      const parts = (r.display_name ?? "").split(",").map((p) => p.trim()).filter((p) => p && p !== "Ghana");
      const name = (r.name || parts[0] || query).slice(0, 80);
      const detail = parts.filter((p) => p !== name && !/^[A-Z]{2}-\d/.test(p)).slice(0, 3).join(", ");
      return { name, detail, lat: Number(r.lat), lng: Number(r.lon) };
    })
    .filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng));
}

/** Road distances in km from the shop to each point, or null for a point the road server couldn't measure. */
async function roadKm(shop: LatLng, points: LatLng[]): Promise<(number | null)[]> {
  try {
    const coords = [shop, ...points].map((p) => `${p.lng.toFixed(6)},${p.lat.toFixed(6)}`).join(";");
    const data = (await getJson(`https://router.project-osrm.org/table/v1/driving/${coords}?sources=0&annotations=distance`)) as {
      code?: string;
      distances?: (number | null)[][];
    };
    if (data.code !== "Ok" || !data.distances?.[0]) return points.map(() => null);
    return points.map((_, i) => {
      const m = data.distances![0][i + 1];
      return typeof m === "number" ? m / 1000 : null;
    });
  } catch {
    return points.map(() => null);
  }
}

/** Measures each point from the shop: by road when possible, else a straight-line guess. */
async function measure(shop: LatLng, places: Omit<FoundPlace, "km" | "approximate">[]): Promise<FoundPlace[]> {
  const road = await roadKm(shop, places);
  return places.map((p, i) => {
    const km = road[i];
    return km === null
      ? { ...p, km: roundKm(straightLineKm(shop, p) * ROAD_FACTOR), approximate: true }
      : { ...p, km: roundKm(km), approximate: false };
  });
}

/** A position from a pasted Google Maps link (short or full) or "5.60, -0.18"; null when there is none. */
export async function resolveMapPosition(text: string): Promise<LatLng | null> {
  const pin = coordinatesFromText(text);
  if (pin || !isShortMapsLink(text)) return pin;
  try {
    return await followShortLink(text);
  } catch {
    return null;
  }
}

/**
 * What was typed at the till: a place name ("Kokrobite", "Spintex Coca-Cola"),
 * a Google Maps link (short or full) or a position like "5.60, -0.18".
 */
export async function findDeliveryPlaces(text: string, shop: LatLng): Promise<PlaceSearch> {
  const query = text.trim();
  try {
    let pin = coordinatesFromText(query);
    if (!pin && isShortMapsLink(query)) {
      pin = await followShortLink(query);
      if (!pin) return { ok: false, message: "Couldn't read that map link. Open it, copy the full address from the browser, or type the area." };
    }
    if (pin) {
      return { ok: true, places: await measure(shop, [{ name: "Pinned location", detail: `${pin.lat.toFixed(5)}, ${pin.lng.toFixed(5)}`, ...pin }]) };
    }
    const found = await searchPlaces(query);
    if (found.length === 0) return { ok: true, places: [] };
    // The map often has a place several times (an area, its road, a bus stop): keep one per name and distance.
    const seen = new Set<string>();
    const places = (await measure(shop, found)).filter((p) => {
      const key = `${p.name.toLowerCase()}|${Math.round(p.km)}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    return { ok: true, places };
  } catch {
    return { ok: false, message: "The map search isn't answering. Try again, or type the fee yourself." };
  }
}
