import { formatDay } from "./format";

// Reserved orders: sales kept for the customer to pick up or have delivered
// later, with an optional agreed date ("2026-11-14", Ghana time).

export type ReservationDue = "late" | "today" | "later" | "none";

/** Where an open reservation stands against its date. */
export function reservationDue(until: string | null, today: string): ReservationDue {
  if (!until) return "none";
  if (until < today) return "late";
  if (until === today) return "today";
  return "later";
}

/** "Late: was due 9 Nov 2026", "Due today", "By 14 Nov 2026", "No date agreed". */
export function reservationDueText(until: string | null, today: string, delivery = false): string {
  const due = reservationDue(until, today);
  if (due === "none") return "No date agreed";
  if (due === "today") return delivery ? "Deliver today" : "Due today";
  if (due === "late") return `Late: was due ${formatDay(until!)}`;
  return `${delivery ? "Deliver on" : "By"} ${formatDay(until!)}`;
}

export const RESERVATION_DUE_CLASS: Record<ReservationDue, string> = {
  late: "bg-pos-tint-orange text-pos-rust",
  today: "bg-pos-forest text-pos-on-forest",
  later: "bg-pos-tint-green text-pos-green-ink",
  none: "bg-pos-paper-deep text-pos-soft",
};

/** Items still on the shelf (not paid in full) or already put aside. */
export function reservationStockText(status: string): string {
  return status === "reserved" ? "Still on the shelf" : "Put aside";
}
