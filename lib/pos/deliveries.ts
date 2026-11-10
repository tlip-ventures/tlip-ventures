// Deliveries at the till: where a delivery is, and the words and colours for it.

import { normaliseGhanaPhone } from "@/lib/phone";

export const BAD_RIDER_PHONE = "Enter the rider's phone number like 024 123 4567, or leave it empty.";

/**
 * A delivery typed at the till as the database takes it, with the phone stored
 * as 233…; "bad phone" when the phone isn't a Ghana number.
 */
export function deliveryForDb(d: { fee: number; address: string; phone: string; note: string; included?: boolean } | null) {
  if (!d) return null;
  let phone: string | null = null;
  if (d.phone) {
    phone = normaliseGhanaPhone(d.phone);
    if (!phone) return "bad phone" as const;
  }
  return { fee: d.fee, address: d.address, phone, note: d.note, included: d.included ?? false };
}

export const DELIVERY_STATUSES = ["to_deliver", "out", "delivered"] as const;
export type DeliveryStatus = (typeof DELIVERY_STATUSES)[number];

export const DELIVERY_FILTERS = ["open", "to_deliver", "out", "delivered", "all"] as const;
export type DeliveryFilter = (typeof DELIVERY_FILTERS)[number];

export const DELIVERY_FILTER_LABELS: Record<DeliveryFilter, string> = {
  open: "Not delivered yet",
  to_deliver: "To deliver",
  out: "Out now",
  delivered: "Delivered",
  all: "All",
};

export const DELIVERY_PILLS: Record<DeliveryStatus, { label: string; className: string }> = {
  to_deliver: { label: "To deliver", className: "bg-pos-tint-orange text-pos-rust" },
  out: { label: "Out for delivery", className: "bg-pos-paper-deep text-pos-soft" },
  delivered: { label: "Delivered", className: "bg-pos-tint-green text-pos-green-ink" },
};

/** "With Kofi since 14:05" style line for a delivery on its way, or null. */
export function deliveryProgress(status: DeliveryStatus, rider: string | null): string | null {
  if (status === "out") return rider ? `With ${rider}` : "Out with the rider";
  if (status === "delivered" && rider) return `Delivered by ${rider}`;
  return null;
}
