import { formatPesewas } from "@/lib/money";
import { formatDay, phoneText } from "@/lib/pos/format";
import { invoicePill, isExpired } from "@/lib/pos/invoices";
import { lineName } from "@/lib/pos/receipt";
import type { InvoiceDetail } from "@/lib/server/pos/invoices";

function Total({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={`flex justify-between gap-6 py-1 ${strong ? "border-t-2 border-black pt-2 text-[17px] font-bold" : ""}`}>
      <span>{label}</span>
      <span className="tabular-nums">{value}</span>
    </div>
  );
}

/**
 * The invoice on an A4 page: the shop, who it is for, the items and the total,
 * and the date its prices hold until. Prints in black on white.
 */
export function InvoiceView({ inv, today }: { inv: InvoiceDetail; today: string }) {
  const pill = invoicePill(inv.status, inv.validUntil, today);
  const stamp = inv.status !== "open" || isExpired(inv.status, inv.validUntil, today) ? pill.label : null;

  return (
    <article
      aria-label={`Invoice ${inv.code}`}
      className="relative flex w-full max-w-[210mm] flex-col gap-7 bg-white px-6 py-8 text-[13px] leading-[19px] text-black shadow-[0_1px_3px_rgba(17,17,17,0.12)] sm:px-12 sm:py-12 print:max-w-none print:p-0 print:shadow-none"
    >
      {stamp && (
        <span className="absolute right-6 top-6 rotate-[-6deg] rounded border-2 border-current px-3 py-1 text-lg font-bold uppercase tracking-[0.12em] text-pos-rust sm:right-12 print:text-black">
          {stamp}
        </span>
      )}

      <header className="flex flex-wrap items-start justify-between gap-6">
        <div className="flex flex-col gap-0.5">
          <span className="font-pos-display text-[28px] leading-tight">{inv.shop.name}</span>
          {inv.shop.address && <span>{inv.shop.address}</span>}
          {inv.shop.whatsapp && <span>WhatsApp {phoneText(inv.shop.whatsapp)}</span>}
          {inv.shop.email && <span>{inv.shop.email}</span>}
        </div>
        <div className="flex flex-col gap-0.5 sm:text-right">
          <span className="text-[26px] font-bold uppercase leading-tight tracking-[0.18em]">Invoice</span>
          <span>
            No. <strong>{inv.code}</strong>
          </span>
          <span>Date: {formatDay(inv.createdAt)}</span>
          <span className="font-bold">Prices held until: {formatDay(inv.validUntil)}</span>
        </div>
      </header>

      <div className="grid gap-6 sm:grid-cols-2">
        <div className="flex flex-col gap-0.5">
          <span className="text-[11px] font-bold uppercase tracking-[0.12em] text-pos-soft print:text-black">For</span>
          {inv.customer ? (
            <>
              <span className="font-semibold">{inv.customer.name}</span>
              {inv.customer.phone && <span>{phoneText(inv.customer.phone)}</span>}
            </>
          ) : (
            <span>Customer</span>
          )}
        </div>
        {inv.delivery && (
          <div className="flex flex-col gap-0.5">
            <span className="text-[11px] font-bold uppercase tracking-[0.12em] text-pos-soft print:text-black">Deliver to</span>
            <span>{inv.delivery.address}</span>
            {(inv.delivery.name || inv.delivery.phone) && (
              <span>{[inv.delivery.name, phoneText(inv.delivery.phone)].filter(Boolean).join(", ")}</span>
            )}
          </div>
        )}
      </div>

      <div>
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b-2 border-black text-left text-[11px] uppercase tracking-[0.08em]">
              <th scope="col" className="hidden w-8 py-2 pr-2 font-bold sm:table-cell print:table-cell">
                #
              </th>
              <th scope="col" className="py-2 pr-2 font-bold">
                Item
              </th>
              <th scope="col" className="w-10 py-2 pr-2 text-right font-bold sm:w-14">
                Qty
              </th>
              <th scope="col" className="hidden w-28 py-2 pr-2 text-right font-bold sm:table-cell print:table-cell">
                Unit price
              </th>
              <th scope="col" className="w-24 py-2 text-right font-bold sm:w-28">
                Amount
              </th>
            </tr>
          </thead>
          <tbody>
            {inv.lines.map((l, i) => (
              <tr key={i} className="break-inside-avoid border-b border-[#d9d9d9]">
                <td className="hidden py-2 pr-2 align-top tabular-nums sm:table-cell print:table-cell">{i + 1}</td>
                <td className="py-2 pr-2 align-top">
                  <span className="flex flex-col">
                    <span>{lineName(l.productName, l.optionValues)}</span>
                    {/* Phones: the unit price goes under the name. */}
                    <span className="text-[12px] tabular-nums text-pos-soft sm:hidden print:hidden">{formatPesewas(l.unitPrice)} each</span>
                  </span>
                </td>
                <td className="py-2 pr-2 text-right align-top tabular-nums">{l.qty}</td>
                <td className="hidden whitespace-nowrap py-2 pr-2 text-right align-top tabular-nums sm:table-cell print:table-cell">{formatPesewas(l.unitPrice)}</td>
                <td className="whitespace-nowrap py-2 text-right align-top tabular-nums">{formatPesewas(l.lineTotal)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex justify-end">
        <div className="flex w-full max-w-[300px] flex-col">
          <Total label="Items" value={formatPesewas(inv.subtotal)} />
          {inv.discount > 0 && <Total label="Discount" value={`-${formatPesewas(inv.discount)}`} />}
          {inv.delivery && <Total label="Delivery" value={formatPesewas(inv.delivery.fee)} />}
          <Total label="Total" value={formatPesewas(inv.total)} strong />
        </div>
      </div>

      <footer className="flex flex-col gap-1 border-t border-[#d9d9d9] pt-4 text-[12px] leading-[18px]">
        <span>
          This is an invoice, not a receipt. Nothing has been paid. Prices are held until {formatDay(inv.validUntil)}.
        </span>
        {inv.shop.footer?.trim() && <span>{inv.shop.footer.trim()}</span>}
      </footer>
    </article>
  );
}
