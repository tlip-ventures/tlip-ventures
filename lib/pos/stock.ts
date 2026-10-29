import type { Database } from "@/lib/database.types";

/** Stock states, worked out in the database view pos_stock_rows. */
export const STOCK_STATES = ["recount", "out", "low", "ok"] as const;
export type StockState = (typeof STOCK_STATES)[number];

export type MovementKind = Database["public"]["Enums"]["stock_movement_kind"];

/** The Products and stock filter chips, in the design's order. */
export const STOCK_FILTERS = ["all", "low", "recount", "ok"] as const;
export type StockFilter = (typeof STOCK_FILTERS)[number];

export const STOCK_FILTER_LABELS: Record<StockFilter, string> = {
  all: "All",
  low: "Low or out",
  recount: "Need a recount",
  ok: "In stock",
};

/** The states a filter shows. "Low or out" includes sold out. */
export function statesForFilter(filter: StockFilter): readonly StockState[] {
  switch (filter) {
    case "low":
      return ["low", "out"];
    case "recount":
      return ["recount"];
    case "ok":
      return ["ok"];
    default:
      return STOCK_STATES;
  }
}

export function stockState(onHand: number, reorderLevel: number): StockState {
  if (onHand < 0) return "recount";
  if (onHand === 0) return "out";
  if (onHand <= reorderLevel) return "low";
  return "ok";
}

export function toStockState(value: string | null): StockState {
  return (STOCK_STATES as readonly string[]).includes(value ?? "") ? (value as StockState) : "out";
}

export type Pill = { label: string; className: string };

/** Status pill colours from the design (text on tint, AA contrast). */
export const STOCK_PILLS: Record<StockState, Pill> = {
  recount: { label: "Recount", className: "bg-pos-tint-orange text-pos-rust" },
  out: { label: "Out of stock", className: "bg-pos-paper-deep text-pos-soft" },
  low: { label: "Running low", className: "bg-pos-tint-orange text-pos-rust" },
  ok: { label: "In stock", className: "bg-pos-tint-green text-pos-green-ink" },
};

/** "−4 (sold before stock arrived)" or "3 on shelf · alert at 4". */
export function shelfText(onHand: number, reorderLevel: number): string {
  if (onHand < 0) return `${onHand} (sold before stock arrived)`;
  return `${onHand} on shelf · alert at ${reorderLevel}`;
}

/**
 * Width of the shelf bar, 0–100. Full at three times the alert level (at
 * least 15, the design's scale), so the bar reads as "how far above the alert".
 */
export function shelfBarPercent(onHand: number, reorderLevel: number): number {
  const full = Math.max(15, reorderLevel * 3);
  return Math.round(Math.max(0, Math.min(100, (onHand / full) * 100)));
}

const MOVEMENT_LABELS: Record<MovementKind, string> = {
  opening: "Opening stock",
  sale: "Sale",
  sale_void: "Sale cancelled",
  purchase: "Delivery received",
  purchase_void: "Delivery cancelled",
  return: "Customer return",
  adjustment: "Adjustment",
  count: "Count",
};

export function movementLabel(kind: MovementKind): string {
  return MOVEMENT_LABELS[kind];
}

/** "+4", "−2" (a real minus sign, which reads better than a hyphen). */
export function signedQty(change: number): string {
  if (change > 0) return `+${change}`;
  if (change < 0) return `−${Math.abs(change)}`;
  return "0";
}

/** Tile behind a product code, by top category, like the design's sage/clay/sand tiles. */
const TILES = ["bg-pos-sage", "bg-pos-clay", "bg-pos-paper-deep"] as const;

export function tileClass(key: string | null): string {
  if (!key) return TILES[2];
  let hash = 0;
  for (const ch of key) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return TILES[hash % TILES.length];
}

/** Short code for a tile when a product has no code: initials of the first words. */
export function tileCode(sku: string | null, name: string): string {
  if (sku) return sku.slice(0, 6).toUpperCase();
  const initials = name
    .split(/\s+/)
    .filter((w) => /[a-z0-9]/i.test(w))
    .slice(0, 3)
    .map((w) => w.replace(/[^a-z0-9]/gi, "").charAt(0))
    .join("");
  return initials.toUpperCase() || "—";
}

/** "Blender 1.5L (Black)", as on the shop's WhatsApp orders; just the name without options. */
export function variantName(productName: string, optionLabel: string | null): string {
  return optionLabel ? `${productName} (${optionLabel})` : productName;
}
