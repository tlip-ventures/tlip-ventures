"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { cancelInvoice, loadInvoiceForTill } from "@/app/pos/(app)/invoices/actions";
import { useBasket } from "@/lib/pos/basket-store";
import { ActionDialog } from "./action-dialog";
import { buttonClass } from "./ui";

/** Loads the invoice into the till at today's prices, then opens the till. */
export function SellInvoiceButton({ invoiceId, code }: { invoiceId: string; code: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const sell = () => {
    const basket = useBasket.getState();
    if (basket.lines.length > 0 && basket.invoice?.id !== invoiceId) {
      if (!window.confirm(`The till has a sale in progress. Replace it with ${code}?`)) return;
    }
    setError(null);
    startTransition(async () => {
      const result = await loadInvoiceForTill(invoiceId);
      if (!result.ok) {
        setError(result.message);
        return;
      }
      useBasket.getState().loadInvoice(result.till);
      router.push("/pos/sell");
    });
  };

  return (
    <span className="flex flex-col items-end gap-1">
      <button type="button" onClick={sell} disabled={pending} className={buttonClass("primary", "sm")}>
        {pending ? "Loading…" : "Sell this invoice"}
      </button>
      {error && (
        <span role="alert" className="text-[13px] font-semibold text-pos-rust">
          {error}
        </span>
      )}
    </span>
  );
}

export function CancelInvoiceButton({ invoiceId, code }: { invoiceId: string; code: string }) {
  const router = useRouter();
  return (
    <ActionDialog
      label="Cancel invoice"
      title={`Cancel ${code}?`}
      kind="outline"
      size="sm"
      tone="danger"
      submitLabel="Cancel invoice"
      action={async (prev, formData) => {
        const result = await cancelInvoice(prev, formData);
        if (result.ok) router.refresh();
        return result;
      }}
    >
      <input type="hidden" name="invoiceId" value={invoiceId} />
      <p className="m-0 text-sm leading-[21px] text-pos-soft">The customer no longer wants it. It stays on the Invoices list as cancelled.</p>
    </ActionDialog>
  );
}
