"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { createInvoice } from "@/app/pos/(app)/invoices/actions";
import { completeSale, type CompletedSale } from "@/app/pos/(app)/sell/actions";
import { formatPesewas, parseCedis, pesewasToInput } from "@/lib/money";
import { phoneText } from "@/lib/pos/format";
import { basketLineKey, basketLineName, basketQty, basketTotals, linePrice, cashOptions, changeDue, deliveryFeeText, deliveryTooBig, draftDeliveryFee, momoSplit, REST_LABELS, REST_METHODS, FULFILMENT_LABELS, FULFILMENTS, PAYMENT_LABELS, PAYMENT_METHODS } from "@/lib/pos/basket";
import { useBasket, useBasketHydrated, type CashChoice } from "@/lib/pos/basket-store";
import { defaultValidUntil, ghanaToday } from "@/lib/pos/invoices";
import type { DeliveryArea, DeliveryPricing } from "@/lib/delivery";
import { CustomerPicker } from "./customer-picker";
import { DeliveryAreaPicker } from "./delivery-area-picker";

const inputClass = "min-h-11 w-full rounded-md border border-pos-line bg-white px-3 text-sm text-pos-ink placeholder:text-pos-muted";

const choiceClass = (on: boolean) =>
  `min-h-11 rounded-md border text-sm font-bold ${
    on ? "border-pos-green bg-pos-tint-green text-pos-green-ink" : "border-pos-line bg-white text-pos-ink hover:border-pos-muted"
  }`;

/** The delivery price list: the formula and its areas. */
export type TillDeliveryPrices = { pricing: DeliveryPricing; areas: DeliveryArea[] };

/** The design's "Current sale" panel. */
export function BasketPanel({
  canGiveDiscounts,
  deliveryPrices,
  onDone,
}: {
  canGiveDiscounts: boolean;
  deliveryPrices: TillDeliveryPrices | null;
  onDone: (sale: CompletedSale & { method: string }) => void;
}) {
  const router = useRouter();
  const hydrated = useBasketHydrated();
  const state = useBasket();
  const [editingDiscount, setEditingDiscount] = useState(false);
  const [discountText, setDiscountText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  // "Make invoice": open while the cashier picks the date the prices hold until.
  const [invoicing, setInvoicing] = useState(false);
  const [validUntil, setValidUntil] = useState(() => defaultValidUntil(new Date()));

  const lines = hydrated ? state.lines : [];
  const delivering = hydrated && state.fulfilment === "delivery";
  const feeInPrice = delivering && Boolean(state.delivery.included);
  // Wholesale: items with a wholesale price use it (owner and discount staff only).
  const wholesale = hydrated && canGiveDiscounts && Boolean(state.wholesale);
  // Free delivery looks at the items after any discount.
  const itemsOnly = basketTotals(lines, canGiveDiscounts ? state.discount : 0, 0, false, wholesale);
  const feeText = deliveryFeeText(state.delivery, deliveryPrices?.pricing ?? null, itemsOnly.subtotal - itemsOnly.discount);
  const deliveryFee = draftDeliveryFee(delivering ? "delivery" : "collect", feeText);
  const totals = basketTotals(lines, canGiveDiscounts ? state.discount : 0, deliveryFee ?? 0, feeInPrice, wholesale);
  const options = cashOptions(totals.total);
  const otherCash = parseCedis(state.cashOther);
  const cashReceived: number | null =
    state.cash === "exact" ? null : state.cash === "r50" ? options[1] : state.cash === "r100" ? options[2] : otherCash;
  // null: the cash typed in doesn't cover the total yet.
  const change =
    state.method !== "cash" ? 0 : state.cash === "other" && otherCash === null ? null : changeDue(totals.total, cashReceived);

  // Mobile Money for part of the total, the rest by cash or bank, or owed.
  const split = state.method === "momo" ? momoSplit(totals.total, state.momoPart ?? "", state.restMethod ?? "cash") : null;
  const isSplit = split?.kind === "split";
  const restCash = split?.kind === "split" && split.restMethod === "cash" ? split.rest : 0;
  const splitCashReceived = restCash && state.cashOther.trim() ? parseCedis(state.cashOther) : null;
  // null: the cash typed doesn't cover the cash part yet.
  const splitChange = !restCash
    ? 0
    : state.cashOther.trim() === ""
      ? 0
      : splitCashReceived === null
        ? null
        : changeDue(restCash, splitCashReceived);

  const deliveryBlocker =
    delivering && !state.delivery.address.trim()
      ? "Enter where to deliver: the area and a landmark."
      : delivering && deliveryFee === null
        ? "Enter the delivery fee like 30, or leave it empty."
        : deliveryTooBig(totals)
          ? "The delivery fee can't be more than the total when it is in the price."
          : null;
  const blocker =
    lines.length === 0
      ? null
      : deliveryBlocker
        ? deliveryBlocker
      : split?.kind === "error"
        ? split.message
      : split?.kind === "split" && split.restMethod === "later" && !state.customer
        ? "Choose the customer who will pay the rest later."
      : split?.kind === "split" && split.restMethod === "cash" && splitChange === null
        ? `Enter the cash received: at least ${formatPesewas(restCash)}, or leave it empty.`
      : state.method === "later" && !state.customer
        ? "Choose the customer who will pay later."
        : state.method === "cash" && state.cash === "other" && (otherCash === null || change === null)
          ? "Enter the cash received: at least the total."
          : null;

  const saveDiscount = () => {
    const value = discountText.trim() === "" ? 0 : parseCedis(discountText);
    if (value === null) {
      setError("Enter the discount like 20 or 12.50.");
      return;
    }
    setError(null);
    state.setDiscount(Math.min(value, totals.subtotal));
    setEditingDiscount(false);
  };

  const deliveryInput = () =>
    delivering
      ? {
          fee: totals.delivery,
          address: state.delivery.address,
          // The rider calls this number; the customer's own when none is typed.
          phone: state.delivery.phone.trim() || state.customer?.phone || "",
          note: state.delivery.note,
          included: totals.deliveryIncluded,
        }
      : null;

  const saveInvoice = () => {
    if (lines.length === 0 || deliveryBlocker) return;
    setError(null);
    startTransition(async () => {
      const result = await createInvoice({
        items: lines.map((l) => ({ variantId: l.variantId, qty: l.qty, choice: l.choice ?? null })),
        customerId: state.customer?.id ?? null,
        discount: totals.discount,
        delivery: deliveryInput(),
        validUntil,
        wholesale,
      });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      state.clear();
      setDiscountText("");
      setInvoicing(false);
      router.push(`/pos/invoice/${result.id}`);
    });
  };

  const complete = () => {
    if (blocker || lines.length === 0) return;
    setError(null);
    startTransition(async () => {
      const result = await completeSale({
        items: lines.map((l) => ({ variantId: l.variantId, qty: l.qty, choice: l.choice ?? null })),
        customerId: state.customer?.id ?? null,
        discount: totals.discount,
        method: split?.kind === "split" ? "split" : state.method,
        cashReceived: state.method === "cash" ? cashReceived : restCash ? splitCashReceived : null,
        payments: split?.kind === "split" ? split.payments : null,
        delivery: deliveryInput(),
        invoiceId: state.invoice?.id ?? null,
        wholesale,
      });
      if (!result.ok) {
        setError(result.message);
        // Someone else may have sold the last one: show the shelf as it is now.
        router.refresh();
        return;
      }
      const method =
        split?.kind === "split"
          ? split.restMethod === "later"
            ? "Mobile Money, the rest owed"
            : `Mobile Money + ${REST_LABELS[split.restMethod]}`
          : state.method === "later"
            ? "Unpaid"
            : PAYMENT_LABELS[state.method];
      state.clear();
      setDiscountText("");
      onDone({ ...result.sale, method });
    });
  };

  const cashChoices: { key: CashChoice; label: string }[] = [
    { key: "exact", label: "Exact" },
    { key: "r50", label: formatPesewas(options[1]) },
    { key: "r100", label: formatPesewas(options[2]) },
  ];

  return (
    <div className="flex flex-1 flex-col">
      <div className="flex flex-col gap-3 border-b border-pos-paper-deep px-[22px] pb-3.5 pt-[22px]">
        <div className="flex items-baseline justify-between">
          <h2 id="pos-basket" className="m-0 text-xl font-bold leading-[26px]">
            Current sale
          </h2>
          <span className="text-[13px] text-pos-muted">{hydrated && state.invoice ? `From ${state.invoice.code}` : "New sale"}</span>
        </div>
        {hydrated && state.invoice && (
          <div className="flex flex-col gap-1.5 rounded-md border border-pos-peach-line bg-pos-peach px-3 py-2.5 text-[13px] leading-[19px] text-pos-note-ink">
            <span className="flex items-start justify-between gap-2">
              <span className="font-bold">Selling invoice {state.invoice.code} at today&rsquo;s prices.</span>
              <button
                type="button"
                onClick={state.dropInvoice}
                className="-my-2 min-h-11 shrink-0 px-1 font-bold text-pos-rust hover:text-pos-ink md:min-h-8"
              >
                Not from the invoice
              </button>
            </span>
            {state.invoice.warnings.length > 0 ? (
              <ul className="m-0 flex list-disc flex-col gap-1 pl-4">
                {state.invoice.warnings.map((w) => (
                  <li key={w}>{w}</li>
                ))}
              </ul>
            ) : (
              <span>Nothing has changed since the invoice.</span>
            )}
            {state.discount > 0 && !canGiveDiscounts && (
              <span className="font-semibold">
                The invoice had a discount of {formatPesewas(state.discount)}. Ask someone who can give discounts to finish this sale.
              </span>
            )}
          </div>
        )}
        <div role="group" aria-label="Retail or wholesale prices" className="grid grid-cols-2 gap-2">
          {([
            [false, "Retail"],
            [true, "Wholesale"],
          ] as const).map(([value, label]) => (
            <button
              key={label}
              type="button"
              aria-pressed={wholesale === value}
              disabled={value && !canGiveDiscounts}
              title={value && !canGiveDiscounts ? "Ask the owner: wholesale needs “Can give discounts”." : undefined}
              onClick={() => state.setWholesale(value)}
              className={`${choiceClass(wholesale === value)} disabled:cursor-not-allowed disabled:opacity-60`}
            >
              {label}
            </button>
          ))}
        </div>
        {wholesale && (
          <span className="-mt-1 text-xs leading-[18px] text-pos-muted">
            Items with a wholesale price are sold at it; the others at their normal price.
          </span>
        )}
        <CustomerPicker />
        <div role="group" aria-label="How the customer gets the goods" className="grid grid-cols-2 gap-2">
          {FULFILMENTS.map((f) => (
            <button
              key={f}
              type="button"
              aria-pressed={(hydrated ? state.fulfilment : "collect") === f}
              onClick={() => state.setFulfilment(f)}
              className={choiceClass((hydrated ? state.fulfilment : "collect") === f)}
            >
              {FULFILMENT_LABELS[f]}
            </button>
          ))}
        </div>
        {delivering && (
          <div className="flex flex-col gap-2.5 rounded-md border border-pos-line bg-pos-row-hover p-3">
            {deliveryPrices && (
              <DeliveryAreaPicker
                areas={deliveryPrices.areas}
                pricing={deliveryPrices.pricing}
                itemsTotal={itemsOnly.subtotal - itemsOnly.discount}
              />
            )}
            <label className="flex flex-col gap-1.5 text-[13px] font-semibold text-pos-soft">
              <span>Deliver to (area and a landmark)</span>
              <input
                value={state.delivery.address}
                onChange={(e) => state.setDelivery({ address: e.target.value })}
                maxLength={300}
                placeholder="Dansoman, near Sharp Curve"
                className={inputClass}
              />
            </label>
            <div className="grid grid-cols-[minmax(0,1fr)_110px] gap-2.5">
              <label className="flex flex-col gap-1.5 text-[13px] font-semibold text-pos-soft">
                <span>Phone for the rider</span>
                <input
                  value={state.delivery.phone}
                  onChange={(e) => state.setDelivery({ phone: e.target.value })}
                  type="tel"
                  inputMode="tel"
                  placeholder={state.customer?.phone ? `Customer’s: ${phoneText(state.customer.phone)}` : "024 123 4567"}
                  className={inputClass}
                />
              </label>
              <label className="flex flex-col gap-1.5 text-[13px] font-semibold text-pos-soft">
                <span>Fee (GH₵)</span>
                <input
                  value={feeText}
                  onChange={(e) => state.setDelivery({ fee: e.target.value, auto: false })}
                  inputMode="decimal"
                  placeholder="0"
                  className={`${inputClass} text-right font-bold tabular-nums`}
                />
              </label>
            </div>
            <div role="group" aria-label="The delivery fee" className="flex flex-col gap-1.5">
              <span className="text-[13px] font-semibold text-pos-soft">The fee is</span>
              <div className="grid grid-cols-2 gap-2">
                {([
                  [false, "Added on top"],
                  [true, "Already in the price"],
                ] as const).map(([value, label]) => (
                  <button
                    key={label}
                    type="button"
                    aria-pressed={Boolean(state.delivery.included) === value}
                    onClick={() => state.setDelivery({ included: value })}
                    className={`${choiceClass(Boolean(state.delivery.included) === value)} px-2 text-[13px]`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              {state.delivery.included && (
                <span className="text-xs leading-[18px] text-pos-muted">
                  The customer pays the total below; the fee is part of it, so the sale shows items and delivery apart.
                </span>
              )}
            </div>
            <label className="flex flex-col gap-1.5 text-[13px] font-semibold text-pos-soft">
              <span>Note for the rider (optional)</span>
              <input
                value={state.delivery.note}
                onChange={(e) => state.setDelivery({ note: e.target.value })}
                maxLength={300}
                placeholder="Call before coming, blue gate…"
                className={inputClass}
              />
            </label>
          </div>
        )}
      </div>

      <div className="flex min-h-40 flex-1 flex-col px-[22px] py-1.5">
        {lines.map((l) => {
          const key = basketLineKey(l);
          const name = basketLineName(l);
          const full = basketQty(lines, l.variantId) >= l.maxQty;
          return (
          <div key={key} className="flex items-center gap-2.5 border-b border-pos-paper-deep py-3">
            <span className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="text-sm font-semibold leading-[19px]">{name}</span>
              <span className="text-xs tabular-nums text-pos-muted">
                {formatPesewas(linePrice(l, wholesale))} each
                {wholesale && l.wholesalePrice != null && l.wholesalePrice !== l.unitPrice && (
                  <>
                    {" "}
                    <s>{formatPesewas(l.unitPrice)}</s> <span className="font-semibold text-pos-green-ink">wholesale</span>
                  </>
                )}
              </span>
            </span>
            <span className="flex items-center rounded-md border border-pos-line">
              <button
                type="button"
                onClick={() => state.setQty(key, l.qty - 1)}
                aria-label={`Remove one ${name}`}
                className="h-11 w-10 text-lg text-pos-ink md:h-9 md:w-9"
              >
                −
              </button>
              <span className="min-w-6 text-center text-sm font-bold tabular-nums" aria-label={`${l.qty} in basket`}>
                {l.qty}
              </span>
              <button
                type="button"
                onClick={() => state.setQty(key, l.qty + 1)}
                disabled={full}
                aria-label={`Add one ${name}`}
                title={full ? `Only ${l.maxQty} on the shelf` : undefined}
                className="h-11 w-10 text-lg text-pos-ink disabled:cursor-not-allowed disabled:text-pos-faint md:h-9 md:w-9"
              >
                +
              </button>
            </span>
            <span className="w-[92px] text-right text-sm font-bold tabular-nums">{formatPesewas(linePrice(l, wholesale) * l.qty)}</span>
          </div>
          );
        })}
        {lines.length === 0 && (
          <p className="my-6 text-center text-sm leading-[22px] text-pos-muted">Tap a product or scan its barcode to add it.</p>
        )}
      </div>

      <div className="flex flex-col gap-3.5 border-t border-pos-paper-deep bg-pos-row-hover px-[22px] pb-[22px] pt-4">
        <div className="flex flex-col gap-1.5 text-sm tabular-nums text-pos-soft">
          <div className="flex justify-between">
            <span>
              {totals.items} {totals.items === 1 ? "item" : "items"}
            </span>
            <span>{formatPesewas(totals.subtotal)}</span>
          </div>
          <div className="flex items-center justify-between gap-2">
            <span className="flex items-center gap-2">
              Discount
              {canGiveDiscounts && lines.length > 0 && !editingDiscount && (
                <button
                  type="button"
                  onClick={() => {
                    setDiscountText(totals.discount ? pesewasToInput(totals.discount) : "");
                    setEditingDiscount(true);
                  }}
                  className="min-h-11 px-1 text-[13px] font-bold text-pos-green hover:text-pos-forest md:min-h-8"
                >
                  {totals.discount ? "Change" : "Add"}
                </button>
              )}
            </span>
            {editingDiscount ? (
              <span className="flex items-center gap-1.5">
                <label htmlFor="pos-discount" className="sr-only">
                  Discount in cedis
                </label>
                <input
                  id="pos-discount"
                  value={discountText}
                  onChange={(e) => setDiscountText(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), saveDiscount())}
                  inputMode="decimal"
                  placeholder="0"
                  autoFocus
                  className="h-10 w-24 rounded-md border border-pos-line bg-white px-2 text-right text-sm"
                />
                <button type="button" onClick={saveDiscount} className="min-h-10 rounded-md bg-pos-green px-3 text-[13px] font-bold text-white">
                  OK
                </button>
              </span>
            ) : (
              <span>{totals.discount ? `−${formatPesewas(totals.discount)}` : "GH₵ 0"}</span>
            )}
          </div>
          {delivering && (
            <div className="flex justify-between">
              <span>{totals.deliveryIncluded ? "Delivery (in the price)" : "Delivery"}</span>
              <span>{formatPesewas(totals.delivery)}</span>
            </div>
          )}
          {totals.deliveryIncluded && (
            <div className="flex justify-between">
              <span>Items</span>
              <span>{formatPesewas(totals.total - totals.delivery)}</span>
            </div>
          )}
          <div className="flex items-baseline justify-between border-t border-pos-card-line pt-2 text-pos-ink">
            <span className="text-[15px] font-bold">Total</span>
            <span className="font-pos-display text-[32px] leading-none">{formatPesewas(totals.total)}</span>
          </div>
        </div>

        <div role="group" aria-label="How the customer pays" className="grid grid-cols-2 gap-2">
          {PAYMENT_METHODS.map((m) => (
            <button key={m} type="button" aria-pressed={state.method === m} onClick={() => state.setMethod(m)} className={choiceClass(state.method === m)}>
              {PAYMENT_LABELS[m]}
            </button>
          ))}
        </div>

        {state.method === "cash" && (
          <div className="flex flex-col gap-2">
            <span id="pos-cash" className="text-[13px] font-semibold text-pos-soft">
              Cash received
            </span>
            <div role="group" aria-labelledby="pos-cash" className="flex gap-2">
              {cashChoices.map((c) => (
                <button
                  key={c.key}
                  type="button"
                  aria-pressed={state.cash === c.key}
                  onClick={() => state.setCash(c.key)}
                  className={`${choiceClass(state.cash === c.key)} min-h-11 flex-1 whitespace-nowrap px-1 text-[13px] tabular-nums md:min-h-10`}
                >
                  {c.label}
                </button>
              ))}
            </div>
            <label className="flex items-center justify-between gap-3 text-sm text-pos-soft">
              <span>Other amount</span>
              <input
                value={state.cashOther}
                onChange={(e) => state.setCash("other", e.target.value)}
                onFocus={() => state.setCash("other")}
                inputMode="decimal"
                placeholder="GH₵"
                className={`min-h-11 w-32 rounded-md border px-3 text-right text-sm font-bold tabular-nums text-pos-ink md:min-h-10 ${
                  state.cash === "other" ? "border-pos-green bg-pos-tint-green" : "border-pos-line bg-white"
                }`}
              />
            </label>
            <div className="flex justify-between text-sm">
              <span className="text-pos-soft">Change to give</span>
              <span className="font-bold tabular-nums text-pos-green-ink">{change === null ? "—" : formatPesewas(change)}</span>
            </div>
          </div>
        )}

        {state.method === "momo" && (
          <div className="flex flex-col gap-2">
            <label className="flex items-center justify-between gap-3 text-sm text-pos-soft">
              <span>MoMo amount</span>
              <input
                value={state.momoPart ?? ""}
                onChange={(e) => state.setMomoSplit({ momoPart: e.target.value })}
                inputMode="decimal"
                placeholder={formatPesewas(totals.total)}
                aria-describedby="pos-momo-help"
                className={`min-h-11 w-32 rounded-md border px-3 text-right text-sm font-bold tabular-nums text-pos-ink md:min-h-10 ${
                  isSplit ? "border-pos-green bg-pos-tint-green" : "border-pos-line bg-white"
                }`}
              />
            </label>
            <span id="pos-momo-help" className="text-xs leading-[18px] text-pos-muted">
              Leave it empty when the whole total is paid by MoMo. A smaller amount splits the payment.
            </span>
            {split?.kind === "split" && (
              <div className="flex flex-col gap-2 rounded-md border border-pos-line bg-white p-3">
                <span id="pos-rest" className="text-[13px] font-semibold text-pos-soft">
                  The rest, <strong className="tabular-nums text-pos-ink">{formatPesewas(split.rest)}</strong>, is paid by
                </span>
                <div role="group" aria-labelledby="pos-rest" className="grid grid-cols-3 gap-2">
                  {REST_METHODS.map((m) => (
                    <button
                      key={m}
                      type="button"
                      aria-pressed={split.restMethod === m}
                      onClick={() => state.setMomoSplit({ restMethod: m })}
                      className={`${choiceClass(split.restMethod === m)} px-1 text-[13px]`}
                    >
                      {REST_LABELS[m]}
                    </button>
                  ))}
                </div>
                {split.restMethod === "cash" && (
                  <>
                    <label className="flex items-center justify-between gap-3 text-sm text-pos-soft">
                      <span>Cash received</span>
                      <input
                        value={state.cashOther}
                        onChange={(e) => state.setCash(state.cash, e.target.value)}
                        inputMode="decimal"
                        placeholder={formatPesewas(split.rest)}
                        className="min-h-11 w-32 rounded-md border border-pos-line bg-white px-3 text-right text-sm font-bold tabular-nums text-pos-ink md:min-h-10"
                      />
                    </label>
                    <div className="flex justify-between text-sm">
                      <span className="text-pos-soft">Change to give</span>
                      <span className="font-bold tabular-nums text-pos-green-ink">{splitChange === null ? "—" : formatPesewas(splitChange)}</span>
                    </div>
                  </>
                )}
                {split.restMethod === "later" && (
                  <span className="text-[13px] font-semibold leading-[19px] text-pos-rust">
                    {formatPesewas(split.rest)} stays owed by the customer until it is paid (Mark paid on the sale).
                  </span>
                )}
              </div>
            )}
          </div>
        )}

        {state.method === "later" && (
          <p className="m-0 rounded-md bg-pos-tint-orange px-3 py-2.5 text-[13px] font-semibold leading-[19px] text-pos-rust">
            {delivering
              ? "Pay on delivery: saved as unpaid until the rider brings the money. Mark it paid then."
              : "This sale is saved as unpaid. It shows under “Customers owe you” until it is settled."}
          </p>
        )}

        {(error || blocker) && (
          <p role="alert" className="m-0 rounded-md bg-pos-tint-orange px-3 py-2.5 text-[13px] font-semibold leading-[19px] text-pos-rust">
            {error ?? blocker}
          </p>
        )}

        <button
          type="button"
          onClick={complete}
          disabled={lines.length === 0 || pending || Boolean(blocker)}
          className="min-h-[52px] rounded-md bg-pos-green text-base font-bold text-white hover:bg-pos-forest disabled:cursor-not-allowed disabled:opacity-60"
        >
          {pending ? "Saving…" : `Complete sale · ${formatPesewas(totals.total)}`}
        </button>
        {hydrated && !state.invoice && lines.length > 0 && !invoicing && (
          <button type="button" onClick={() => setInvoicing(true)} className="min-h-11 rounded-md border border-pos-line bg-white text-sm font-bold text-pos-ink hover:border-pos-muted">
            Make invoice instead
          </button>
        )}
        {invoicing && lines.length > 0 && (
          <div className="flex flex-col gap-2.5 rounded-md border border-pos-line bg-white p-3">
            <span className="text-[13px] leading-[19px] text-pos-soft">
              An invoice shows the customer what they would pay. Nothing comes off the shelf until they buy.
            </span>
            <label className="flex items-center justify-between gap-3 text-sm font-semibold text-pos-soft">
              <span>Prices held until</span>
              <input
                type="date"
                value={validUntil}
                min={ghanaToday(new Date())}
                max={defaultValidUntil(new Date(), 365)}
                onChange={(e) => setValidUntil(e.target.value)}
                className="min-h-11 rounded-md border border-pos-line bg-white px-3 text-sm text-pos-ink md:min-h-10"
              />
            </label>
            {deliveryBlocker && <span className="text-[13px] font-semibold text-pos-rust">{deliveryBlocker}</span>}
            <div className="grid grid-cols-[auto_minmax(0,1fr)] gap-2">
              <button type="button" onClick={() => setInvoicing(false)} className="min-h-11 px-3 text-[13px] font-semibold text-pos-muted hover:text-pos-ink">
                Back
              </button>
              <button
                type="button"
                onClick={saveInvoice}
                disabled={pending || Boolean(deliveryBlocker) || !validUntil}
                className="min-h-11 rounded-md bg-pos-forest px-3 text-sm font-bold text-white hover:bg-pos-ink disabled:cursor-not-allowed disabled:opacity-60"
              >
                {pending ? "Saving…" : `Save invoice · ${formatPesewas(totals.total)}`}
              </button>
            </div>
          </div>
        )}
        <button
          type="button"
          onClick={() => {
            state.clear();
            setError(null);
            setEditingDiscount(false);
            setInvoicing(false);
          }}
          disabled={lines.length === 0 && !state.customer && state.fulfilment === "collect"}
          className="min-h-11 text-[13px] font-semibold text-pos-muted hover:text-pos-ink disabled:opacity-60 md:min-h-10"
        >
          Clear basket
        </button>
      </div>
    </div>
  );
}
