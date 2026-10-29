"use client";

import type { CompletedSale } from "@/app/pos/(app)/sell/actions";
import { formatPesewas } from "@/lib/money";
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
          Sale saved.
        </h2>
        <p className="m-0 text-sm leading-[22px] text-pos-soft">
          {sale.code} · {formatPesewas(sale.total)} · {sale.method}. Stock for {sale.items} {sale.items === 1 ? "item" : "items"} has been
          taken off the shelf count.
        </p>
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
