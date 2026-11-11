"use client";

import Link from "next/link";
import type { CompletedSale } from "@/app/pos/(app)/sell/actions";
import { formatPesewas } from "@/lib/money";
import { formatDay } from "@/lib/pos/format";
import { ChatIcon, CheckIcon } from "../icons";

/** "Sale saved." with the receipt buttons, as in the design. */
export function SaleDone({ sale, onNext }: { sale: CompletedSale & { method: string }; onNext: () => void }) {
  return (
    <div className="flex flex-1 flex-col gap-[18px] px-6 py-8">
      <span className="flex h-[52px] w-[52px] items-center justify-center rounded-full bg-pos-tint-green text-pos-green">
        <CheckIcon />
      </span>
      <div className="flex flex-col gap-1.5">
        <h2 className="m-0 font-pos-display text-[30px] font-normal leading-[1.1]" tabIndex={-1} id="pos-done">
          {sale.reserved ? "Order reserved." : sale.onHold ? "Sale on hold." : "Sale saved."}
        </h2>
        {sale.onHold && (
          <p className="m-0 rounded-md bg-pos-tint-orange px-3 py-2.5 text-sm font-semibold leading-[22px] text-pos-rust">
            {formatPesewas(sale.onHold.owed)} still to pay. Use Mark paid on{" "}
            <Link href={`/pos/sales/${sale.saleId}`} className="font-bold text-pos-rust">
              {sale.code}
            </Link>{" "}
            as the money comes in; the last payment completes the sale.
          </p>
        )}
        {sale.reserved && (
          <p className="m-0 rounded-md bg-pos-tint-green px-3 py-2.5 text-sm font-semibold leading-[22px] text-pos-green-ink">
            Kept for the customer
            {sale.reserved.until ? ` until ${formatDay(sale.reserved.until)}` : ""}. It is on the{" "}
            <Link href="/pos/reserved" className="font-bold text-pos-green-ink">
              Reserved
            </Link>{" "}
            list until it is {sale.delivery ? "delivered" : "collected"}.
            {sale.reserved.owed > 0 && ` ${formatPesewas(sale.reserved.owed)} still to pay: use Mark paid as the money comes in.`}
          </p>
        )}
        <p className="m-0 text-sm leading-[22px] text-pos-soft">
          {sale.code} · {formatPesewas(sale.total)} · {sale.method}.{" "}
          {sale.reserved && sale.reserved.owed > 0
            ? `The ${sale.items === 1 ? "item stays" : `${sale.items} items stay`} on the shelf until it is paid in full, collected or sent out.`
            : sale.reserved
              ? `Stock for ${sale.items} ${sale.items === 1 ? "item" : "items"} has been taken off the shelf count and put aside.`
              : `Stock for ${sale.items} ${sale.items === 1 ? "item" : "items"} has been taken off the shelf count.`}
        </p>
        {sale.delivery && (
          <p className="m-0 text-sm leading-[22px] text-pos-soft">
            It&apos;s on the{" "}
            <Link href="/pos/deliveries" className="font-bold">
              Deliveries
            </Link>{" "}
            list, ready to send out.
          </p>
        )}
        {sale.change !== null && sale.change > 0 && (
          <p className="m-0 text-sm font-bold text-pos-green-ink">Change to give: {formatPesewas(sale.change)}</p>
        )}
      </div>
      <div className="flex flex-col gap-2">
        <a
          href={sale.whatsappUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex min-h-12 items-center justify-center gap-2 rounded-md bg-pos-terracotta text-sm font-bold text-white no-underline hover:bg-[#963b0f] hover:text-white"
        >
          <ChatIcon size={17} />
          <span>Send receipt on WhatsApp</span>
        </a>
        <a
          href={`/pos/receipt/${sale.saleId}`}
          target="_blank"
          rel="noopener"
          className="flex min-h-12 items-center justify-center rounded-md border border-pos-line text-sm font-bold text-pos-ink no-underline hover:border-pos-muted hover:text-pos-ink"
        >
          Print receipt
        </a>
        <button type="button" onClick={onNext} className="min-h-12 rounded-md bg-pos-orange text-sm font-bold text-pos-ink hover:bg-[#d65a17]">
          Start next sale
        </button>
      </div>
    </div>
  );
}
