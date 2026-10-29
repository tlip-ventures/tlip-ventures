"use client";

import { useState } from "react";
import { cancelWebsiteOrder, markOrderPaid, recordPayment, voidSale } from "@/app/pos/(app)/payments/actions";
import { cancelPurchase, receivePurchase } from "@/app/pos/(app)/purchases/actions";
import { formatPesewas, parseCedis, pesewasToInput } from "@/lib/money";
import { METHOD_LABELS } from "@/lib/pos/records";
import { ActionDialog, dialogInputClass, dialogLabelClass } from "./action-dialog";
import type { ButtonKind } from "./ui";

const TITLES = { sale: "Mark paid", purchase: "Record payment", refund: "Record refund" } as const;

type Method = keyof typeof METHOD_LABELS;

/** Cash / Mobile Money / Bank as large radio buttons; controlled when given a value. */
export function MethodChoice({ legend = "How", value, onChange }: { legend?: string; value?: Method; onChange?: (m: Method) => void }) {
  return (
    <fieldset className="m-0 flex flex-col gap-1.5 border-0 p-0">
      <legend className="mb-1.5 text-[13px] font-semibold text-pos-soft">{legend}</legend>
      <div className="grid grid-cols-3 gap-2">
        {(Object.keys(METHOD_LABELS) as Method[]).map((m, i) => (
          <label
            key={m}
            className="relative flex min-h-11 cursor-pointer items-center justify-center rounded-md border border-pos-line bg-white px-1 text-center text-[13px] font-bold text-pos-ink has-[:checked]:border-pos-green has-[:checked]:bg-pos-tint-green has-[:checked]:text-pos-green-ink has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-pos-green"
          >
            {value === undefined ? (
              <input type="radio" name="method" value={m} defaultChecked={i === 0} className="sr-only" />
            ) : (
              <input type="radio" name="method" value={m} checked={value === m} onChange={() => onChange?.(m)} className="sr-only" />
            )}
            {METHOD_LABELS[m]}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

/** "Mark paid" (sale), "Record payment" (supplier) or "Record refund" (return). */
export function PaymentButton({
  kind,
  id,
  owed,
  code,
  label,
  buttonKind = "green",
  size = "sm",
}: {
  kind: "sale" | "purchase" | "refund";
  id: string;
  owed: number;
  code: string;
  label?: string;
  buttonKind?: ButtonKind;
  size?: "md" | "sm";
}) {
  return (
    <ActionDialog
      label={label ?? TITLES[kind]}
      title={`${TITLES[kind]}: ${code}`}
      kind={buttonKind}
      size={size}
      action={recordPayment}
      submitLabel="Save payment"
    >
      <input type="hidden" name="kind" value={kind} />
      <input type="hidden" name="id" value={id} />
      <p className="m-0 text-sm leading-[22px] text-pos-soft">
        {kind === "refund" ? "Still to refund" : "Still owed"}: <strong className="text-pos-ink">{formatPesewas(owed)}</strong>. Part
        payments are fine.
      </p>
      <label className={dialogLabelClass}>
        <span>Amount (GH₵)</span>
        <input name="amount" defaultValue={pesewasToInput(owed)} inputMode="decimal" required className={dialogInputClass} />
      </label>
      <MethodChoice />
      <label className={dialogLabelClass}>
        <span>Note (optional)</span>
        <input name="note" maxLength={300} placeholder="MoMo reference, who paid…" className={dialogInputClass} />
      </label>
    </ActionDialog>
  );
}

/** Owner: cancel a sale rung up by mistake. Its items go back on the shelf. */
export function VoidSaleButton({ saleId, code, paid }: { saleId: string; code: string; paid: number }) {
  return (
    <ActionDialog label="Cancel sale" title={`Cancel ${code}?`} kind="outline" size="md" action={voidSale} submitLabel="Cancel sale" tone="danger">
      <input type="hidden" name="saleId" value={saleId} />
      <p className="m-0 text-sm leading-[22px] text-pos-soft">
        The items go back on the shelf count and the sale stops counting towards your sales.
        {paid > 0 && <> The customer paid {formatPesewas(paid)}: give it back before cancelling.</>} If only some items came back, record a
        return instead.
      </p>
      <label className={dialogLabelClass}>
        <span>Why</span>
        <input name="reason" required maxLength={300} placeholder="Rung up twice, wrong item…" className={dialogInputClass} />
      </label>
    </ActionDialog>
  );
}

export function ReceivePurchaseButton({ purchaseId, code }: { purchaseId: string; code: string }) {
  return (
    <ActionDialog label="Receive into stock" title={`Receive ${code}?`} kind="primary" size="md" action={receivePurchase} submitLabel="Receive">
      <input type="hidden" name="purchaseId" value={purchaseId} />
      <p className="m-0 text-sm leading-[22px] text-pos-soft">
        Everything on this purchase is added to the shelf count, and its costs become the latest costs. Check the delivery against the list
        first.
      </p>
    </ActionDialog>
  );
}

export function CancelPurchaseButton({ purchaseId, code }: { purchaseId: string; code: string }) {
  return (
    <ActionDialog label="Cancel purchase" title={`Cancel ${code}?`} kind="outline" size="md" action={cancelPurchase} submitLabel="Cancel purchase" tone="danger">
      <input type="hidden" name="purchaseId" value={purchaseId} />
      <p className="m-0 text-sm leading-[22px] text-pos-soft">The delivery isn&apos;t coming. Nothing is added to the shelf.</p>
    </ActionDialog>
  );
}

/** Website basket paid in WhatsApp: takes the items off the shelf. */
export function MarkOrderPaidButton({
  saleId,
  code,
  total,
  buttonKind = "green",
  size = "sm",
  className,
}: {
  saleId: string;
  code: string;
  total: number;
  buttonKind?: ButtonKind;
  size?: "md" | "sm";
  className?: string;
}) {
  const [cash, setCash] = useState("");
  const received = parseCedis(cash);
  const change = received === null ? null : received - total;
  return (
    <ActionDialog
      label="Mark as paid"
      title={`${code} paid?`}
      kind={buttonKind}
      size={size}
      action={markOrderPaid}
      submitLabel="Mark as paid"
      className={className}
    >
      <input type="hidden" name="saleId" value={saleId} />
      <p className="m-0 text-sm leading-[22px] text-pos-soft">
        The customer paid <strong className="text-pos-ink">{formatPesewas(total)}</strong>. Its items come off the shelf count now.
      </p>
      <MethodChoice />
      <label className={dialogLabelClass}>
        <span>Cash received (optional, for change)</span>
        <input
          name="cashReceived"
          value={cash}
          onChange={(e) => setCash(e.target.value)}
          inputMode="decimal"
          placeholder={pesewasToInput(total)}
          className={dialogInputClass}
        />
      </label>
      {change !== null && change > 0 && (
        <p className="m-0 flex justify-between rounded-md bg-pos-tint-green px-3 py-2.5 text-sm font-bold text-pos-green-ink" aria-live="polite">
          <span>Change to give (cash)</span>
          <span className="tabular-nums">{formatPesewas(change)}</span>
        </p>
      )}
    </ActionDialog>
  );
}

export function CancelWebsiteOrderButton({ saleId, code }: { saleId: string; code: string }) {
  return (
    <ActionDialog label="Cancel order" title={`Cancel ${code}?`} kind="outline" size="md" action={cancelWebsiteOrder} submitLabel="Cancel order" tone="danger">
      <input type="hidden" name="saleId" value={saleId} />
      <p className="m-0 text-sm leading-[22px] text-pos-soft">
        The customer isn&apos;t going ahead. The order is cancelled on the website too. Nothing was taken off the shelf.
      </p>
    </ActionDialog>
  );
}
