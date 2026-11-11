"use client";

import { useState } from "react";
import { cancelWebsiteOrder, markOrderPaid, recordPayment, voidSale } from "@/app/pos/(app)/payments/actions";
import { cancelPurchase, receivePurchase } from "@/app/pos/(app)/purchases/actions";
import { formatPesewas, parseCedis, pesewasToInput } from "@/lib/money";
import { NO_PAID_NOW, paidNowParts, type PaidNow } from "@/lib/pos/basket";
import { METHOD_LABELS } from "@/lib/pos/records";
import { ActionDialog, dialogInputClass, dialogLabelClass } from "./action-dialog";
import { PaidNowFields } from "./paid-now-fields";
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
  deliveryOwed = 0,
}: {
  kind: "sale" | "purchase" | "refund";
  id: string;
  owed: number;
  code: string;
  label?: string;
  buttonKind?: ButtonKind;
  size?: "md" | "sm";
  /** Sales: of what is owed, the part for the delivery fee. Shows the "for delivery" box. */
  deliveryOwed?: number;
}) {
  const splitDelivery = kind === "sale" && deliveryOwed > 0;
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
        {kind === "refund" ? "Still to refund" : "Still owed"}: <strong className="text-pos-ink">{formatPesewas(owed)}</strong>
        {splitDelivery && ` (${formatPesewas(owed - deliveryOwed)} for items, ${formatPesewas(deliveryOwed)} for delivery)`}. Part
        payments are fine.
      </p>
      <label className={dialogLabelClass}>
        <span>Amount (GH₵)</span>
        <input name="amount" defaultValue={pesewasToInput(owed)} inputMode="decimal" required className={dialogInputClass} />
      </label>
      {splitDelivery && (
        <label className={dialogLabelClass}>
          <span>Of this, for delivery (GH₵)</span>
          <input name="deliveryAmount" defaultValue={pesewasToInput(deliveryOwed)} inputMode="decimal" className={dialogInputClass} />
          <span className="text-xs font-normal leading-[18px] text-pos-muted">
            The rest of the amount counts for the items. Put 0 if none of it is for delivery.
          </span>
        </label>
      )}
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
  const [paidNow, setPaidNow] = useState<PaidNow>(NO_PAID_NOW);
  const [deliver, setDeliver] = useState(false);
  const [fee, setFee] = useState("");
  // The fee agreed is already in the order total: nothing is added.
  const [inPrice, setInPrice] = useState(false);
  const feeAmount = deliver ? (parseCedis(fee) ?? 0) : 0;
  const due = total + (inPrice ? 0 : feeAmount);
  const parts = paidNowParts(paidNow, due);
  const paid = parts.kind === "ok" ? parts.paid : 0;
  const cashPart = parts.kind === "ok" ? parts.cash : 0;
  const onHold = parts.kind === "ok" && paid > 0 && paid < due;
  const received = parseCedis(cash);
  const change = received === null || cashPart === 0 ? null : received - cashPart;
  return (
    <ActionDialog
      label="Mark as paid"
      title={`${code} paid?`}
      kind={buttonKind}
      size={size}
      action={markOrderPaid}
      submitLabel={onHold ? `Put on hold · ${formatPesewas(due - paid)} to pay` : "Mark as paid"}
      className={className}
    >
      <input type="hidden" name="saleId" value={saleId} />
      <p className="m-0 text-sm leading-[22px] text-pos-soft">
        The order comes to <strong className="text-pos-ink">{formatPesewas(due)}</strong>
        {feeAmount > 0 && <> ({inPrice ? "of which" : "with"} {formatPesewas(feeAmount)} delivery)</>}. Its items come off the shelf count now.
      </p>
      <label className="flex min-h-11 items-start gap-3 text-sm">
        <input
          type="checkbox"
          name="deliver"
          checked={deliver}
          onChange={(e) => setDeliver(e.target.checked)}
          className="mt-0.5 h-5 w-5 flex-none accent-pos-green"
        />
        <span className="flex flex-col">
          <span className="font-semibold">We deliver it</span>
          <span className="text-[13px] text-pos-muted">Adds the delivery fee agreed in WhatsApp and puts it on the Deliveries list.</span>
        </span>
      </label>
      {deliver && (
        <div className="grid grid-cols-[110px_minmax(0,1fr)] gap-2.5">
          <label className={dialogLabelClass}>
            <span>Fee (GH₵)</span>
            <input name="deliveryFee" value={fee} onChange={(e) => setFee(e.target.value)} inputMode="decimal" placeholder="0" className={dialogInputClass} />
          </label>
          <label className={dialogLabelClass}>
            <span>Deliver to</span>
            <input name="deliveryAddress" maxLength={300} placeholder="Order’s location" className={dialogInputClass} />
          </label>
          <label className="col-span-2 flex min-h-11 items-start gap-3 text-sm">
            <input
              type="checkbox"
              name="deliveryIncluded"
              checked={inPrice}
              onChange={(e) => setInPrice(e.target.checked)}
              className="mt-0.5 h-5 w-5 flex-none accent-pos-green"
            />
            <span className="flex flex-col">
              <span className="font-semibold">The fee is already in the price</span>
              <span className="text-[13px] text-pos-muted">The customer pays the order total; part of it counts as delivery.</span>
            </span>
          </label>
        </div>
      )}
      <PaidNowFields value={paidNow} onChange={setPaidNow} due={due} />
      {parts.kind === "error" ? (
        <p role="alert" className="m-0 text-[13px] font-semibold text-pos-rust">
          {parts.message}
        </p>
      ) : onHold ? (
        <p className="m-0 rounded-md bg-pos-tint-orange px-3 py-2.5 text-[13px] font-semibold leading-[19px] text-pos-rust" aria-live="polite">
          Part paid: the order goes On hold with {formatPesewas(due - paid)} still to pay. Use Mark paid when the rest comes in; the last payment
          completes it.
        </p>
      ) : null}
      {cashPart > 0 && (
        <label className={dialogLabelClass}>
          <span>Cash received (optional, for change)</span>
          <input
            name="cashReceived"
            value={cash}
            onChange={(e) => setCash(e.target.value)}
            inputMode="decimal"
            placeholder={pesewasToInput(cashPart)}
            className={dialogInputClass}
          />
        </label>
      )}
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
