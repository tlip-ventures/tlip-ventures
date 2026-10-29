"use client";

import { useRouter } from "next/navigation";
import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { createReturn, findReturnProducts, openSaleForReturn } from "@/app/pos/(app)/returns/actions";
import { formatPesewas, parseCedis, pesewasToInput } from "@/lib/money";
import type { SellTile } from "@/lib/server/pos/sell";
import { dialogInputClass, dialogLabelClass } from "./action-dialog";
import { CloseIcon, SearchIcon } from "./icons";
import { MethodChoice } from "./record-actions";
import { buttonClass, Card, Notice } from "./ui";

export type ReturnableLine = { saleItemId: string; name: string; unitPrice: number; left: number; sold: number };
export type ReturnSale = { id: string; code: string; customerName: string | null; owed: number; lines: ReturnableLine[] };

type Line = { key: string; saleItemId: string | null; variantId: string | null; name: string; unitPrice: number; max: number; qty: number; backOnShelf: boolean };
type Method = "cash" | "momo" | "bank";

/** Start of a return: the sale number from the receipt. */
export function FindSaleForm() {
  const [state, action, pending] = useActionState(openSaleForReturn, null);
  return (
    <form action={action} className="flex flex-col gap-3">
      <label className={dialogLabelClass}>
        <span>Sale number on the receipt</span>
        <span className="flex gap-2">
          <input name="code" placeholder="SL_1210" autoCapitalize="characters" required maxLength={20} className={`${dialogInputClass} max-w-[220px]`} />
          <button type="submit" disabled={pending} className={buttonClass("primary")}>
            {pending ? "Finding…" : "Find the sale"}
          </button>
        </span>
      </label>
      {state?.message && <Notice tone="bad">{state.message}</Notice>}
    </form>
  );
}

/** What comes back, whether it goes back on the shelf, and the refund. */
export function ReturnForm({ sale }: { sale: ReturnSale | null }) {
  const router = useRouter();
  const [lines, setLines] = useState<Line[]>(
    sale
      ? sale.lines.map((l) => ({ key: l.saleItemId, saleItemId: l.saleItemId, variantId: null, name: l.name, unitPrice: l.unitPrice, max: l.left, qty: 0, backOnShelf: true }))
      : [],
  );
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SellTile[]>([]);
  const [searching, startSearch] = useTransition();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);
  const [refund, setRefund] = useState<string | null>(null); // null: the value of the items
  const [refundNow, setRefundNow] = useState(true);
  const [method, setMethod] = useState<Method>("cash");
  const [note, setNote] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [saving, startSaving] = useTransition();

  const chosen = lines.filter((l) => l.qty > 0);
  const value = chosen.reduce((n, l) => n + l.unitPrice * l.qty, 0);
  const refundText = refund ?? pesewasToInput(value);
  const refundAmount = parseCedis(refundText);

  const search = (q: string) => {
    setQuery(q);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => startSearch(async () => setResults(q.trim() ? await findReturnProducts(q) : [])), 300);
  };
  const addProduct = (t: SellTile) => {
    setLines((ls) =>
      ls.some((l) => l.variantId === t.variantId)
        ? ls
        : [...ls, { key: t.variantId, saleItemId: null, variantId: t.variantId, name: t.name, unitPrice: t.price, max: 999, qty: 1, backOnShelf: true }],
    );
    setQuery("");
    setResults([]);
  };
  const update = (key: string, change: Partial<Line>) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...change } : l)));

  const save = () => {
    setMessage(null);
    startSaving(async () => {
      const r = await createReturn({
        saleId: sale?.id ?? null,
        customerId: null,
        note,
        lines: chosen.map((l) => ({ saleItemId: l.saleItemId, variantId: l.variantId, qty: l.qty, backOnShelf: l.backOnShelf })),
        refundTotal: refundText,
        refundNow,
        method,
      });
      if (r.ok) router.push(`/pos/returns/${r.id}`);
      else setMessage(r.message);
    });
  };

  return (
    <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
      <Card label="Items coming back">
        <div className="flex flex-col gap-3 border-b border-pos-paper-deep p-5">
          <h2 className="m-0 text-lg font-bold leading-6">{sale ? `Items on ${sale.code}` : "Items coming back"}</h2>
          {sale ? (
            <p className="m-0 text-sm text-pos-soft">
              {sale.customerName ?? "Walk-in customer"}. Set how many of each item come back. Refunds use the price on the sale.
            </p>
          ) : (
            <label className="relative flex flex-col gap-1.5 text-[13px] font-semibold text-pos-soft">
              <span>Add a product</span>
              <span className="pointer-events-none absolute bottom-3 left-3 text-pos-muted">
                <SearchIcon size={18} />
              </span>
              <input value={query} onChange={(e) => search(e.target.value)} placeholder="Name, SKU or barcode" className={`${dialogInputClass} pl-10`} />
            </label>
          )}
          {!sale && query.trim() && (
            <ul className="m-0 flex list-none flex-col rounded-md border border-pos-line p-1" aria-live="polite">
              {results.map((t) => (
                <li key={t.variantId}>
                  <button
                    type="button"
                    onClick={() => addProduct(t)}
                    className="flex min-h-11 w-full items-center justify-between gap-3 rounded px-2 text-left text-sm hover:bg-pos-row-hover"
                  >
                    <span className="font-semibold">{t.name}</span>
                    <span className="whitespace-nowrap tabular-nums text-pos-muted">{formatPesewas(t.price)}</span>
                  </button>
                </li>
              ))}
              {!searching && results.length === 0 && <li className="px-2 py-2 text-[13px] text-pos-muted">No product found.</li>}
            </ul>
          )}
        </div>
        {lines.length === 0 ? (
          <p className="m-0 px-5 py-6 text-sm text-pos-soft">Search above to add what the customer brought back.</p>
        ) : (
          <ul className="m-0 flex list-none flex-col p-0">
            {lines.map((l) => (
              <li key={l.key} className="flex flex-wrap items-center gap-3 border-t border-pos-paper-deep px-5 py-3 first:border-t-0">
                <span className="flex min-w-[180px] flex-1 flex-col">
                  <span className="text-sm font-semibold">{l.name}</span>
                  <span className="text-xs text-pos-muted">
                    {formatPesewas(l.unitPrice)} each
                    {l.saleItemId ? ` · ${l.max ? `${l.max} can come back` : "all returned already"}` : ""}
                  </span>
                </span>
                <label className={`${dialogLabelClass} w-20`}>
                  <span>Qty back</span>
                  <input
                    type="number"
                    min={0}
                    max={l.max}
                    value={l.qty}
                    disabled={l.max === 0}
                    onChange={(e) => update(l.key, { qty: Math.max(0, Math.min(l.max, Math.trunc(Number(e.target.value) || 0))) })}
                    className={dialogInputClass}
                  />
                </label>
                <label className="flex min-h-11 items-center gap-2 text-[13px] font-semibold">
                  <input
                    type="checkbox"
                    checked={l.backOnShelf}
                    disabled={l.max === 0}
                    onChange={(e) => update(l.key, { backOnShelf: e.target.checked })}
                    className="h-5 w-5 accent-pos-green"
                  />
                  Back on shelf
                </label>
                {!l.saleItemId && (
                  <button
                    type="button"
                    onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))}
                    aria-label={`Remove ${l.name}`}
                    className="inline-flex h-11 w-11 items-center justify-center rounded-md text-pos-muted hover:bg-pos-paper-deep hover:text-pos-ink"
                  >
                    <CloseIcon size={16} />
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
        <p className="m-0 border-t border-pos-paper-deep px-5 py-3 text-[13px] text-pos-muted">
          Untick Back on shelf for damaged items: they are recorded but not added to the shelf count.
        </p>
      </Card>

      <Card label="Refund" className="flex flex-col gap-4 p-5 lg:sticky lg:top-6">
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-sm font-semibold text-pos-muted">Items worth</span>
          <span className="font-pos-display text-[30px] leading-none tabular-nums">{formatPesewas(value)}</span>
        </div>
        {sale && sale.owed > 0 && (
          <Notice tone="bad">
            This sale still owes {formatPesewas(sale.owed)}. A return doesn&apos;t lower that: refund only what the customer actually paid, or 0.
          </Notice>
        )}
        <label className={dialogLabelClass}>
          <span>Refund (GH₵)</span>
          <input value={refundText} onChange={(e) => setRefund(e.target.value)} inputMode="decimal" className={dialogInputClass} />
          <span className="text-xs font-normal text-pos-muted">Less than the items are worth for a part refund, or 0 for an exchange.</span>
        </label>
        <label className="flex min-h-11 items-start gap-3 text-sm">
          <input type="checkbox" checked={refundNow} onChange={(e) => setRefundNow(e.target.checked)} className="mt-0.5 h-5 w-5 flex-none accent-pos-green" />
          <span className="flex flex-col">
            <span className="font-semibold">Handed back now</span>
            <span className="text-[13px] text-pos-muted">{refundNow ? "The money left the till today." : "Saved as still to refund."}</span>
          </span>
        </label>
        {refundNow && (refundAmount ?? 0) > 0 && (
          <MethodChoice legend="Refunded by" value={method} onChange={setMethod} />
        )}
        <label className={dialogLabelClass}>
          <span>Reason or note (optional)</span>
          <textarea value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} rows={2} placeholder="Faulty, wrong colour…" className={`${dialogInputClass} py-2`} />
        </label>
        {message && <Notice tone="bad">{message}</Notice>}
        <button type="button" onClick={save} disabled={saving || chosen.length === 0} className={buttonClass("primary")}>
          {saving ? "Saving…" : "Record return"}
        </button>
      </Card>
    </div>
  );
}
