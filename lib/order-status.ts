import { Constants, type Enums } from "@/lib/database.types";

export type OrderStatus = Enums<"order_status">;

export const ORDER_STATUSES = Constants.public.Enums.order_status;

export const STATUS_LABELS: Record<OrderStatus, string> = {
  awaiting_whatsapp: "Awaiting WhatsApp",
  confirmed: "Confirmed",
  paid: "Paid",
  dispatched: "Dispatched",
  delivered: "Delivered",
  cancelled: "Cancelled",
  not_sent: "Not sent",
};

/** Badge colours; every pair meets WCAG AA for small text. */
export const STATUS_STYLES: Record<OrderStatus, string> = {
  awaiting_whatsapp: "bg-brand-gold/25 text-ink",
  confirmed: "bg-blue-100 text-blue-900",
  paid: "bg-brand-green/15 text-brand-green",
  dispatched: "bg-purple-100 text-purple-900",
  delivered: "bg-brand-green text-white",
  cancelled: "bg-neutral-200 text-neutral-800",
  not_sent: "bg-neutral-200 text-neutral-800",
};

/** The usual next step: awaiting_whatsapp -> confirmed -> paid -> dispatched -> delivered. */
export function nextStatus(status: OrderStatus): OrderStatus | null {
  const flow: OrderStatus[] = ["awaiting_whatsapp", "confirmed", "paid", "dispatched", "delivered"];
  const i = flow.indexOf(status);
  return i >= 0 && i < flow.length - 1 ? flow[i + 1] : null;
}
