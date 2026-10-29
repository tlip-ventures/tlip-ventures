"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { addCustomer, findCustomers } from "@/app/pos/(app)/sell/actions";
import type { CustomerChoice } from "@/lib/pos/basket";
import { useBasket } from "@/lib/pos/basket-store";
import { formatGhanaPhone } from "@/lib/phone";

const inputClass =
  "min-h-11 w-full rounded-md border border-pos-line bg-white px-3 text-sm text-pos-ink placeholder:text-pos-muted";

function phoneText(phone: string | null): string {
  if (!phone) return "No phone number";
  try {
    return formatGhanaPhone(phone);
  } catch {
    return phone;
  }
}

/**
 * "Customer" on the basket: Walk-in by default; search by name or phone, or
 * add someone new. A customer is needed for Pay later.
 */
export function CustomerPicker() {
  const customer = useBasket((s) => s.customer);
  const setCustomer = useBasket((s) => s.setCustomer);
  const [open, setOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<CustomerChoice[]>([]);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  const search = (value: string) => {
    setQuery(value);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      startTransition(async () => setResults(value.trim() ? await findCustomers(value) : []));
    }, 300);
  };

  const choose = (c: CustomerChoice | null) => {
    setCustomer(c);
    setOpen(false);
    setAdding(false);
    setQuery("");
    setResults([]);
    setError(null);
  };

  const create = () => {
    setError(null);
    startTransition(async () => {
      const result = await addCustomer({ name, phone });
      if (result.ok) {
        setName("");
        setPhone("");
        choose(result.customer);
      } else {
        setError(result.message);
      }
    });
  };

  if (!open) {
    return (
      <div className="flex flex-col gap-1.5 text-[13px] font-semibold text-pos-soft">
        <span id="pos-customer-label">Customer</span>
        <div className="flex min-h-11 items-center justify-between gap-2 rounded-md border border-pos-line bg-white px-3">
          <span className="flex min-w-0 flex-col py-1.5" aria-labelledby="pos-customer-label">
            <span className="truncate text-sm font-semibold text-pos-ink">{customer?.name ?? "Walk-in customer"}</span>
            {customer && <span className="text-xs font-normal text-pos-muted">{phoneText(customer.phone)}</span>}
          </span>
          <span className="flex flex-none gap-1">
            {customer && (
              <button type="button" onClick={() => choose(null)} className="min-h-11 px-2 text-[13px] font-semibold text-pos-muted hover:text-pos-ink">
                Walk-in
              </button>
            )}
            <button type="button" onClick={() => setOpen(true)} className="min-h-11 px-2 text-[13px] font-bold text-pos-green hover:text-pos-forest">
              {customer ? "Change" : "Choose"}
            </button>
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2 rounded-md border border-pos-line bg-pos-row-hover p-3">
      {!adding ? (
        <>
          <label className="flex flex-col gap-1.5 text-[13px] font-semibold text-pos-soft">
            <span>Find a customer</span>
            <input value={query} onChange={(e) => search(e.target.value)} placeholder="Name or phone" autoFocus className={inputClass} />
          </label>
          <ul className="m-0 flex list-none flex-col p-0" aria-live="polite">
            {results.map((c) => (
              <li key={c.id}>
                <button
                  type="button"
                  onClick={() => choose(c)}
                  className="flex min-h-11 w-full flex-col justify-center rounded-md px-2 text-left hover:bg-white"
                >
                  <span className="text-sm font-semibold text-pos-ink">{c.name}</span>
                  <span className="text-xs text-pos-muted">{phoneText(c.phone)}</span>
                </button>
              </li>
            ))}
            {query.trim() && !pending && results.length === 0 && <li className="px-2 py-2 text-[13px] text-pos-muted">No one found.</li>}
          </ul>
          <div className="flex flex-wrap justify-between gap-2">
            <button
              type="button"
              onClick={() => {
                setAdding(true);
                setName(/\d/.test(query) ? "" : query);
                setPhone(/\d/.test(query) ? query : "");
              }}
              className="min-h-11 px-1 text-[13px] font-bold text-pos-green hover:text-pos-forest"
            >
              New customer…
            </button>
            <button type="button" onClick={() => choose(customer)} className="min-h-11 px-1 text-[13px] font-semibold text-pos-muted hover:text-pos-ink">
              Cancel
            </button>
          </div>
        </>
      ) : (
        <>
          <label className="flex flex-col gap-1.5 text-[13px] font-semibold text-pos-soft">
            <span>Name</span>
            <input value={name} onChange={(e) => setName(e.target.value)} maxLength={100} autoFocus className={inputClass} />
          </label>
          <label className="flex flex-col gap-1.5 text-[13px] font-semibold text-pos-soft">
            <span>Phone (for receipts and reminders)</span>
            <input value={phone} onChange={(e) => setPhone(e.target.value)} type="tel" inputMode="tel" placeholder="024 123 4567" className={inputClass} />
          </label>
          {error && (
            <p role="alert" className="m-0 text-[13px] font-semibold text-pos-rust">
              {error}
            </p>
          )}
          <div className="flex flex-wrap justify-between gap-2">
            <button type="button" onClick={create} disabled={pending} className="min-h-11 rounded-md bg-pos-green px-4 text-[13px] font-bold text-white disabled:opacity-60">
              {pending ? "Adding…" : "Add customer"}
            </button>
            <button type="button" onClick={() => setAdding(false)} className="min-h-11 px-1 text-[13px] font-semibold text-pos-muted hover:text-pos-ink">
              Back
            </button>
          </div>
        </>
      )}
    </div>
  );
}
