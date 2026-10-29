"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { addSupplier, findPurchaseProducts, findSuppliers, savePurchase, type SupplierChoice } from "@/app/pos/(app)/purchases/actions";
import { formatPesewas, parseCedis, pesewasToInput } from "@/lib/money";
import { phoneText } from "@/lib/pos/format";
import type { PurchaseProduct } from "@/lib/server/pos/records";
import { dialogInputClass, dialogLabelClass } from "./action-dialog";
import { CloseIcon, SearchIcon } from "./icons";
import { MethodChoice } from "./record-actions";
import { buttonClass, Card, Notice } from "./ui";

type Line = { variantId: string; name: string; sku: string | null; onHand: number; qty: string; unitCost: string };
type Method = "cash" | "momo" | "bank";

function useDebounced<T>(search: (q: string) => Promise<T[]>) {
  const [results, setResults] = useState<T[]>([]);
  const [pending, startTransition] = useTransition();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);
  const run = (q: string) => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => startTransition(async () => setResults(q.trim() ? await search(q) : [])), 300);
  };
  return { results, setResults, pending, run };
}

const toLine = (p: PurchaseProduct): Line => ({
  variantId: p.variantId,
  name: p.name,
  sku: p.sku,
  onHand: p.onHand,
  qty: "1",
  unitCost: p.cost !== null ? pesewasToInput(p.cost) : "",
});

/** New purchase: supplier, items with what each cost, received now or later, what was paid. */
export function PurchaseForm({ start }: { start: PurchaseProduct | null }) {
  const router = useRouter();
  const [supplier, setSupplier] = useState<SupplierChoice | null>(null);
  const [supplierQuery, setSupplierQuery] = useState("");
  const [addingSupplier, setAddingSupplier] = useState(false);
  const [supplierPhone, setSupplierPhone] = useState("");
  const suppliers = useDebounced(findSuppliers);
  const [lines, setLines] = useState<Line[]>(start ? [toLine(start)] : []);
  const [productQuery, setProductQuery] = useState("");
  const products = useDebounced(findPurchaseProducts);
  const [received, setReceived] = useState(true);
  const [paidNow, setPaidNow] = useState("");
  const [method, setMethod] = useState<Method>("cash");
  const [note, setNote] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, startSaving] = useTransition();

  const total = lines.reduce((n, l) => {
    const cost = parseCedis(l.unitCost);
    const qty = Number(l.qty);
    return cost !== null && Number.isInteger(qty) && qty > 0 ? n + cost * qty : n;
  }, 0);
  const paid = parseCedis(paidNow) ?? 0;

  const addLine = (p: PurchaseProduct) => {
    setLines((ls) => (ls.some((l) => l.variantId === p.variantId) ? ls : [...ls, toLine(p)]));
    setProductQuery("");
    products.setResults([]);
  };
  const update = (i: number, change: Partial<Line>) => setLines((ls) => ls.map((l, j) => (j === i ? { ...l, ...change } : l)));

  const createSupplier = () => {
    setMessage(null);
    startSaving(async () => {
      const r = await addSupplier({ name: supplierQuery, phone: supplierPhone });
      if (!r.ok) return setMessage(r.message);
      setSupplier(r.supplier);
      setAddingSupplier(false);
      setSupplierQuery("");
      setSupplierPhone("");
    });
  };

  const save = () => {
    setMessage(null);
    setErrors({});
    startSaving(async () => {
      const r = await savePurchase({
        supplierId: supplier?.id ?? "",
        received,
        note,
        lines: lines.map((l) => ({ variantId: l.variantId, qty: l.qty, unitCost: l.unitCost })),
        paidNow,
        method,
      });
      if (r.ok) {
        router.push(`/pos/purchases/${r.id}`);
      } else {
        setMessage(r.message);
        setErrors(r.errors ?? {});
      }
    });
  };

  const fieldError = (key: string) =>
    errors[key] ? (
      <span role="alert" className="text-xs font-semibold text-pos-rust">
        {errors[key]}
      </span>
    ) : null;

  return (
    <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
      <div className="flex min-w-0 flex-col gap-5">
        <Card label="Supplier" className="flex flex-col gap-3 p-5">
          <h2 className="m-0 text-lg font-bold leading-6">Supplier</h2>
          {supplier ? (
            <div className="flex min-h-11 items-center justify-between gap-3 rounded-md border border-pos-line px-3">
              <span className="flex flex-col py-1.5">
                <span className="text-sm font-semibold">{supplier.name}</span>
                {supplier.phone && <span className="text-xs text-pos-muted">{phoneText(supplier.phone)}</span>}
              </span>
              <button type="button" onClick={() => setSupplier(null)} className="min-h-11 px-2 text-[13px] font-bold text-pos-green">
                Change
              </button>
            </div>
          ) : addingSupplier ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <label className={dialogLabelClass}>
                <span>Supplier name</span>
                <input value={supplierQuery} onChange={(e) => setSupplierQuery(e.target.value)} maxLength={100} autoFocus className={dialogInputClass} />
              </label>
              <label className={dialogLabelClass}>
                <span>Phone (optional)</span>
                <input value={supplierPhone} onChange={(e) => setSupplierPhone(e.target.value)} type="tel" inputMode="tel" placeholder="024 123 4567" className={dialogInputClass} />
              </label>
              <div className="flex gap-2 sm:col-span-2">
                <button type="button" onClick={createSupplier} disabled={saving} className={buttonClass("primary")}>
                  Add supplier
                </button>
                <button type="button" onClick={() => setAddingSupplier(false)} className={buttonClass("quiet")}>
                  Back
                </button>
              </div>
            </div>
          ) : (
            <>
              <label className={dialogLabelClass}>
                <span>Find a supplier</span>
                <input
                  value={supplierQuery}
                  onChange={(e) => {
                    setSupplierQuery(e.target.value);
                    suppliers.run(e.target.value);
                  }}
                  placeholder="Supplier name"
                  className={dialogInputClass}
                />
              </label>
              <ul className="m-0 flex list-none flex-col p-0" aria-live="polite">
                {suppliers.results.map((s) => (
                  <li key={s.id}>
                    <button type="button" onClick={() => setSupplier(s)} className="flex min-h-11 w-full items-center rounded-md px-2 text-left text-sm font-semibold hover:bg-pos-row-hover">
                      {s.name}
                    </button>
                  </li>
                ))}
                {supplierQuery.trim() && !suppliers.pending && suppliers.results.length === 0 && (
                  <li className="px-2 py-2 text-[13px] text-pos-muted">No supplier by that name.</li>
                )}
              </ul>
              <button type="button" onClick={() => setAddingSupplier(true)} className="min-h-11 self-start px-1 text-[13px] font-bold text-pos-green">
                New supplier…
              </button>
            </>
          )}
          {fieldError("supplierId")}
        </Card>

        <Card label="Items">
          <div className="flex flex-col gap-3 border-b border-pos-paper-deep p-5">
            <h2 className="m-0 text-lg font-bold leading-6">Items</h2>
            <label className="relative flex flex-col gap-1.5 text-[13px] font-semibold text-pos-soft">
              <span>Add a product</span>
              <span className="pointer-events-none absolute bottom-3 left-3 text-pos-muted">
                <SearchIcon size={18} />
              </span>
              <input
                value={productQuery}
                onChange={(e) => {
                  setProductQuery(e.target.value);
                  products.run(e.target.value);
                }}
                placeholder="Name, SKU or barcode"
                className={`${dialogInputClass} pl-10`}
              />
            </label>
            {productQuery.trim() && (
              <ul className="m-0 flex list-none flex-col rounded-md border border-pos-line p-1" aria-live="polite">
                {products.results.map((p) => (
                  <li key={p.variantId}>
                    <button
                      type="button"
                      onClick={() => addLine(p)}
                      className="flex min-h-11 w-full items-center justify-between gap-3 rounded px-2 text-left text-sm hover:bg-pos-row-hover"
                    >
                      <span className="font-semibold">{p.name}</span>
                      <span className="whitespace-nowrap text-xs text-pos-muted">
                        {p.onHand} on shelf{p.cost !== null ? ` · last cost ${formatPesewas(p.cost)}` : ""}
                      </span>
                    </button>
                  </li>
                ))}
                {!products.pending && products.results.length === 0 && <li className="px-2 py-2 text-[13px] text-pos-muted">No product found.</li>}
              </ul>
            )}
          </div>
          {lines.length === 0 ? (
            <p className="m-0 px-5 py-6 text-sm text-pos-soft">Search above to add what you bought.</p>
          ) : (
            <ul className="m-0 flex list-none flex-col p-0">
              {lines.map((l, i) => {
                const cost = parseCedis(l.unitCost);
                const qty = Number(l.qty);
                return (
                  <li key={l.variantId} className="flex flex-wrap items-end gap-3 border-t border-pos-paper-deep px-5 py-3 first:border-t-0">
                    <span className="flex min-w-[180px] flex-1 flex-col self-center">
                      <span className="text-sm font-semibold">{l.name}</span>
                      <span className="text-xs text-pos-muted">
                        {l.sku ? `${l.sku} · ` : ""}
                        {l.onHand} on shelf
                      </span>
                    </span>
                    <label className={`${dialogLabelClass} w-20`}>
                      <span>Qty</span>
                      <input value={l.qty} onChange={(e) => update(i, { qty: e.target.value })} inputMode="numeric" className={dialogInputClass} />
                    </label>
                    <label className={`${dialogLabelClass} w-28`}>
                      <span>Cost each</span>
                      <input value={l.unitCost} onChange={(e) => update(i, { unitCost: e.target.value })} inputMode="decimal" placeholder="0.00" className={dialogInputClass} />
                    </label>
                    <span className="flex min-h-11 w-28 items-center justify-end text-sm font-semibold tabular-nums">
                      {cost !== null && Number.isInteger(qty) && qty > 0 ? formatPesewas(cost * qty) : "—"}
                    </span>
                    <button
                      type="button"
                      onClick={() => setLines((ls) => ls.filter((_, j) => j !== i))}
                      aria-label={`Remove ${l.name}`}
                      className="inline-flex h-11 w-11 items-center justify-center rounded-md text-pos-muted hover:bg-pos-paper-deep hover:text-pos-ink"
                    >
                      <CloseIcon size={16} />
                    </button>
                    {(errors[`lines.${i}.qty`] || errors[`lines.${i}.unitCost`]) && (
                      <span role="alert" className="basis-full text-xs font-semibold text-pos-rust">
                        {errors[`lines.${i}.qty`] ?? errors[`lines.${i}.unitCost`]}
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
          {errors.lines && <p className="m-0 px-5 pb-4 text-xs font-semibold text-pos-rust">{errors.lines}</p>}
        </Card>
      </div>

      <Card label="Save the purchase" className="flex flex-col gap-4 p-5 lg:sticky lg:top-6">
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-sm font-semibold text-pos-muted">Total</span>
          <span className="font-pos-display text-[30px] leading-none tabular-nums">{formatPesewas(total)}</span>
        </div>
        <label className="flex min-h-11 items-start gap-3 text-sm">
          <input type="checkbox" checked={received} onChange={(e) => setReceived(e.target.checked)} className="mt-0.5 h-5 w-5 flex-none accent-pos-green" />
          <span className="flex flex-col">
            <span className="font-semibold">Received now</span>
            <span className="text-[13px] text-pos-muted">
              {received ? "The items go on the shelf count when you save." : "Saved as ordered. Press Received when the delivery comes."}
            </span>
          </span>
        </label>
        <label className={dialogLabelClass}>
          <span>Paid now (GH₵)</span>
          <input value={paidNow} onChange={(e) => setPaidNow(e.target.value)} inputMode="decimal" placeholder="0.00" className={dialogInputClass} />
          {fieldError("paidNow")}
        </label>
        {paid > 0 && (
          <MethodChoice legend="Paid by" value={method} onChange={setMethod} />
        )}
        <div className="flex justify-between gap-3 text-sm tabular-nums">
          <span>You will owe the supplier</span>
          <span className={total - paid > 0 ? "font-bold text-pos-rust" : ""}>{formatPesewas(Math.max(0, total - paid))}</span>
        </div>
        <label className={dialogLabelClass}>
          <span>Note (optional)</span>
          <textarea value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} rows={2} placeholder="Invoice number, delivery details…" className={`${dialogInputClass} py-2`} />
        </label>
        {message && <Notice tone="bad">{message}</Notice>}
        <button type="button" onClick={save} disabled={saving || lines.length === 0} className={buttonClass("primary")}>
          {saving ? "Saving…" : received ? "Save and add to stock" : "Save as ordered"}
        </button>
      </Card>
    </div>
  );
}
