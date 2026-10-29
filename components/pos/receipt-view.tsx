import { formatPesewas } from "@/lib/money";
import { formatGhanaPhone } from "@/lib/phone";
import { formatDayTime } from "@/lib/pos/format";
import { lineName } from "@/lib/pos/receipt";
import type { SaleReceipt } from "@/lib/server/pos/sell";

const METHOD = { cash: "Cash", momo: "Mobile Money", bank: "Bank transfer" } as const;

function phone(p: string | null): string | null {
  if (!p) return null;
  try {
    return formatGhanaPhone(p);
  } catch {
    return p;
  }
}

function Row({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={`flex justify-between gap-3 ${strong ? "text-base font-bold" : ""}`}>
      <span>{label}</span>
      <span className="tabular-nums">{value}</span>
    </div>
  );
}

/** The receipt itself: 72 mm wide so it fits an 80 mm receipt printer. */
export function ReceiptView({ r }: { r: SaleReceipt }) {
  return (
    <article
      aria-label={`Receipt ${r.code}`}
      className="w-full max-w-[72mm] bg-white px-4 py-5 font-sans text-[13px] leading-[18px] text-black shadow-[0_1px_3px_rgba(17,17,17,0.12)] print:max-w-none print:px-0 print:py-0 print:shadow-none"
    >
      <header className="flex flex-col items-center gap-0.5 text-center">
        <span className="font-pos-display text-[22px] leading-tight">{r.shop.name}</span>
        {r.shop.address && <span>{r.shop.address}</span>}
        {r.shop.whatsapp && <span>WhatsApp {phone(r.shop.whatsapp)}</span>}
      </header>

      <div className="my-3 border-t border-dashed border-black" />
      <div className="flex flex-col gap-0.5">
        <Row label="Receipt" value={r.code} strong />
        <span>{formatDayTime(r.createdAt)}</span>
        {r.servedBy && <span>Served by {r.servedBy}</span>}
        {r.customer && (
          <span>
            Customer: {r.customer.name}
            {r.customer.phone ? `, ${phone(r.customer.phone)}` : ""}
          </span>
        )}
        {r.status !== "completed" && <span className="font-bold uppercase">{r.status}</span>}
      </div>

      <div className="my-3 border-t border-dashed border-black" />
      <ul className="m-0 flex list-none flex-col gap-2 p-0">
        {r.lines.map((l, i) => (
          <li key={i} className="flex flex-col">
            <span>{lineName(l.productName, l.optionValues)}</span>
            <span className="flex justify-between tabular-nums">
              <span>
                {l.qty} x {formatPesewas(l.unitPrice)}
              </span>
              <span>{formatPesewas(l.lineTotal)}</span>
            </span>
          </li>
        ))}
      </ul>

      <div className="my-3 border-t border-dashed border-black" />
      <div className="flex flex-col gap-0.5">
        {r.discount > 0 && <Row label="Subtotal" value={formatPesewas(r.subtotal)} />}
        {r.discount > 0 && <Row label="Discount" value={`-${formatPesewas(r.discount)}`} />}
        <Row label="Total" value={formatPesewas(r.total)} strong />
        {r.payments.map((p, i) => (
          <div key={i} className="flex flex-col gap-0.5">
            <Row label={`Paid by ${p.method === "cash" ? "cash" : METHOD[p.method]}`} value={formatPesewas(p.cashReceived ?? p.amount)} />
            {p.method === "cash" && (p.changeGiven ?? 0) > 0 && <Row label="Change" value={formatPesewas(p.changeGiven ?? 0)} />}
          </div>
        ))}
        {r.owed > 0 && <Row label="Still to pay" value={formatPesewas(r.owed)} strong />}
      </div>

      <div className="my-3 border-t border-dashed border-black" />
      <p className="m-0 text-center">{r.shop.footer?.trim() || "Thank you for shopping with us."}</p>
    </article>
  );
}
