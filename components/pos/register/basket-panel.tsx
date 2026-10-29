"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { completeSale, type CompletedSale } from "@/app/pos/(app)/sell/actions";
import { formatPesewas, parseCedis, pesewasToInput } from "@/lib/money";
import { basketTotals, cashOptions, changeDue, PAYMENT_LABELS, PAYMENT_METHODS } from "@/lib/pos/basket";
import { useBasket, useBasketHydrated, type CashChoice } from "@/lib/pos/basket-store";
import { CustomerPicker } from "./customer-picker";

const choiceClass = (on: boolean) =>
  `min-h-11 rounded-md border text-sm font-bold ${
    on ? "border-pos-green bg-pos-tint-green text-pos-green-ink" : "border-pos-line bg-white text-pos-ink hover:border-pos-muted"
  }`;

/** The design's "Current sale" panel. */
export function BasketPanel({ canGiveDiscounts, onDone }: { canGiveDiscounts: boolean; onDone: (sale: CompletedSale & { method: string }) => void }) {
  const router = useRouter();
  const hydrated = useBasketHydrated();
  const state = useBasket();
  const [editingDiscount, setEditingDiscount] = useState(false);
  const [discountText, setDiscountText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const lines = hydrated ? state.lines : [];
  const totals = basketTotals(lines, canGiveDiscounts ? state.discount : 0);
  const options = cashOptions(totals.total);
  const otherCash = parseCedis(state.cashOther);
  const cashReceived: number | null =
    state.cash === "exact" ? null : state.cash === "r50" ? options[1] : state.cash === "r100" ? options[2] : otherCash;
  // null: the cash typed in doesn't cover the total yet.
  const change =
    state.method !== "cash" ? 0 : state.cash === "other" && otherCash === null ? null : changeDue(totals.total, cashReceived);

  const blocker =
    lines.length === 0
      ? null
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

  const complete = () => {
    if (blocker || lines.length === 0) return;
    setError(null);
    startTransition(async () => {
      const result = await completeSale({
        items: lines.map((l) => ({ variantId: l.variantId, qty: l.qty })),
        customerId: state.customer?.id ?? null,
        discount: totals.discount,
        method: state.method,
        cashReceived: state.method === "cash" ? cashReceived : null,
      });
      if (!result.ok) {
        setError(result.message);
        // Someone else may have sold the last one: show the shelf as it is now.
        router.refresh();
        return;
      }
      const method = state.method === "later" ? "Unpaid" : PAYMENT_LABELS[state.method];
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
          <span className="text-[13px] text-pos-muted">New sale</span>
        </div>
        <CustomerPicker />
      </div>

      <div className="flex min-h-40 flex-1 flex-col px-[22px] py-1.5">
        {lines.map((l) => (
          <div key={l.variantId} className="flex items-center gap-2.5 border-b border-pos-paper-deep py-3">
            <span className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="text-sm font-semibold leading-[19px]">{l.name}</span>
              <span className="text-xs tabular-nums text-pos-muted">{formatPesewas(l.unitPrice)} each</span>
            </span>
            <span className="flex items-center rounded-md border border-pos-line">
              <button
                type="button"
                onClick={() => state.setQty(l.variantId, l.qty - 1)}
                aria-label={`Remove one ${l.name}`}
                className="h-11 w-10 text-lg text-pos-ink md:h-9 md:w-9"
              >
                −
              </button>
              <span className="min-w-6 text-center text-sm font-bold tabular-nums" aria-label={`${l.qty} in basket`}>
                {l.qty}
              </span>
              <button
                type="button"
                onClick={() => state.setQty(l.variantId, l.qty + 1)}
                disabled={l.qty >= l.maxQty}
                aria-label={`Add one ${l.name}`}
                title={l.qty >= l.maxQty ? `Only ${l.maxQty} on the shelf` : undefined}
                className="h-11 w-10 text-lg text-pos-ink disabled:cursor-not-allowed disabled:text-pos-faint md:h-9 md:w-9"
              >
                +
              </button>
            </span>
            <span className="w-[92px] text-right text-sm font-bold tabular-nums">{formatPesewas(l.unitPrice * l.qty)}</span>
          </div>
        ))}
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

        {state.method === "later" && (
          <p className="m-0 rounded-md bg-pos-tint-orange px-3 py-2.5 text-[13px] font-semibold leading-[19px] text-pos-rust">
            This sale is saved as unpaid. It shows under “Customers owe you” until it is settled.
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
        <button
          type="button"
          onClick={() => {
            state.clear();
            setError(null);
            setEditingDiscount(false);
          }}
          disabled={lines.length === 0 && !state.customer}
          className="min-h-11 text-[13px] font-semibold text-pos-muted hover:text-pos-ink disabled:opacity-60 md:min-h-10"
        >
          Clear basket
        </button>
      </div>
    </div>
  );
}
