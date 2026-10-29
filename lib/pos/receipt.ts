import { formatPesewas, type Pesewas } from "@/lib/money";
import { formatDayTime } from "./format";

export type ReceiptLine = { qty: number; productName: string; optionValues: string | null; lineTotal: Pesewas };

export type ReceiptPayment = { method: "cash" | "momo" | "bank"; amount: Pesewas; cashReceived: Pesewas | null; changeGiven: Pesewas | null };

export type Receipt = {
  storeName: string;
  code: string;
  createdAt: string;
  lines: readonly ReceiptLine[];
  subtotal: Pesewas;
  discount: Pesewas;
  total: Pesewas;
  payments: readonly ReceiptPayment[];
  /** total minus what has been paid. */
  owed: Pesewas;
  footer: string | null;
};

const METHOD_NAMES = { cash: "cash", momo: "Mobile Money", bank: "bank transfer" } as const;

export function lineName(productName: string, optionValues: string | null): string {
  return optionValues ? `${productName} (${optionValues})` : productName;
}

/** How a sale was paid, in a few words: "Cash", "Mobile Money", "Unpaid", "Part paid". */
export function paymentSummary(payments: readonly ReceiptPayment[], owed: Pesewas): string {
  if (payments.length === 0) return owed > 0 ? "Unpaid" : "Paid";
  if (owed > 0) return "Part paid";
  const methods = [...new Set(payments.map((p) => p.method))];
  if (methods.length > 1) return "Paid";
  return { cash: "Cash", momo: "Mobile Money", bank: "Bank transfer" }[methods[0]];
}

/**
 * The receipt as a WhatsApp message (one item per line, like the shop's order
 * messages):
 *
 *   Tlip Ventures receipt
 *   Sale SL_1210 · 29 Oct 2026, 14:05
 *   2 x Frying pan 28 cm - GH₵ 320
 *   Discount: -GH₵ 20
 *   Total: GH₵ 300
 *   Paid by cash: GH₵ 500, change GH₵ 200
 *   Thank you for shopping with us.
 */
export function buildReceiptMessage(r: Receipt): string {
  const out = [`${r.storeName} receipt`, `Sale ${r.code} · ${formatDayTime(r.createdAt)}`];
  for (const line of r.lines) {
    out.push(`${line.qty} x ${lineName(line.productName, line.optionValues)} - ${formatPesewas(line.lineTotal)}`);
  }
  if (r.discount > 0) out.push(`Discount: -${formatPesewas(r.discount)}`);
  out.push(`Total: ${formatPesewas(r.total)}`);
  for (const p of r.payments) {
    if (p.method === "cash" && p.cashReceived !== null && (p.changeGiven ?? 0) > 0) {
      out.push(`Paid by cash: ${formatPesewas(p.cashReceived)}, change ${formatPesewas(p.changeGiven ?? 0)}`);
    } else {
      out.push(`Paid by ${METHOD_NAMES[p.method]}: ${formatPesewas(p.amount)}`);
    }
  }
  if (r.owed > 0) out.push(`Still to pay: ${formatPesewas(r.owed)}`);
  out.push(r.footer?.trim() || "Thank you for shopping with us.");
  return out.join("\n");
}

/**
 * wa.me link with the receipt filled in: to the customer's number when we have
 * it, otherwise WhatsApp asks who to send it to.
 */
export function receiptWhatsappUrl(phone: string | null, message: string): string {
  const number = phone && /^233\d{9}$/.test(phone) ? phone : "";
  return `https://wa.me/${number}?text=${encodeURIComponent(message)}`;
}
