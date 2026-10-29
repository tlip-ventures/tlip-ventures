import { formatPesewas, type Pesewas } from "@/lib/money";
import { formatGhanaPhone, type GhanaPhone } from "@/lib/phone";

export type MessageLine = {
  qty: number;
  productName: string;
  /** "Black" or "Black / Large"; null for products without options. */
  optionValues: string | null;
  lineTotal: Pesewas;
};

export type OrderMessage = {
  storeName: string;
  orderCode: string;
  lines: readonly MessageLine[];
  itemsTotal: Pesewas;
  customerName: string;
  phone: GhanaPhone;
  /** Area and landmark; shown on one line. */
  location: string;
  /** The customer's optional note; shown on one line. */
  notes?: string | null;
  orderUrl: string;
};

/**
 * The pre-filled WhatsApp order message (CLAUDE.md "WhatsApp message format"):
 *
 *   Hi Tlip Ventures, I'd like to place this order.
 *   Order: TV-1042
 *   1 x Blender 1.5L (Black) - GH₵ 450
 *   Items total: GH₵ 690
 *   Name: Ama Mensah | Phone: 024 123 4567
 *   Location: Dansoman, near Sharp Curve
 *   Note: Please call before delivery      (only when there is a note)
 *   Order link: https://<site>/o/<token>
 */
export function buildOrderMessage(order: OrderMessage): string {
  const lines = order.lines.map((line) => {
    const options = line.optionValues ? ` (${line.optionValues})` : "";
    return `${line.qty} x ${line.productName}${options} - ${formatPesewas(line.lineTotal)}`;
  });
  const oneLine = (text: string | null | undefined) => text?.replace(/\s+/g, " ").trim();
  const note = oneLine(order.notes);
  return [
    `Hi ${order.storeName}, I'd like to place this order.`,
    `Order: ${order.orderCode}`,
    ...lines,
    `Items total: ${formatPesewas(order.itemsTotal)}`,
    `Name: ${order.customerName} | Phone: ${formatGhanaPhone(order.phone)}`,
    `Location: ${oneLine(order.location)}`,
    ...(note ? [`Note: ${note}`] : []),
    `Order link: ${order.orderUrl}`,
  ].join("\n");
}

/** https://wa.me/233XXXXXXXXX?text=… The number must be 233 followed by 9 digits (no +, no leading 0). */
export function whatsappUrl(number: string, message?: string): string {
  if (!/^233\d{9}$/.test(number)) {
    throw new Error(`WhatsApp number must look like 233XXXXXXXXX, got ${number}`);
  }
  const base = `https://wa.me/${number}`;
  return message ? `${base}?text=${encodeURIComponent(message)}` : base;
}
