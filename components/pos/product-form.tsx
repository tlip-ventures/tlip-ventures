"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { saveProduct } from "@/app/pos/(app)/products/actions";
import type { PosProductInput } from "@/lib/pos/schemas";
import { buttonClass, Notice } from "./ui";

export type CategoryGroup = { id: string; name: string; children: { id: string; name: string }[] };

const inputClass =
  "min-h-11 w-full rounded-md border border-pos-line bg-white px-3 text-[15px] text-pos-ink tabular-nums placeholder:text-pos-muted aria-[invalid=true]:border-pos-rust";
const labelClass = "flex flex-col gap-1.5 text-[13px] font-semibold text-pos-soft";

function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null;
  return (
    <span id={id} className="text-xs font-semibold leading-4 text-pos-rust">
      {message}
    </span>
  );
}

/**
 * Add a product (one stock entry, no options) or edit a product's name, price,
 * codes, costs and alert levels. Photos, description and options are edited in
 * the shop's website editor.
 */
export function ProductForm({
  initial,
  categories,
  hasOptions,
}: {
  initial: PosProductInput;
  /** Only for a new product. */
  categories?: CategoryGroup[];
  hasOptions: boolean;
}) {
  const router = useRouter();
  const [form, setForm] = useState(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [pending, startTransition] = useTransition();
  const isNew = initial.id === null;

  const set = <K extends keyof PosProductInput>(key: K, value: PosProductInput[K]) => setForm((f) => ({ ...f, [key]: value }));
  const setVariant = (i: number, key: keyof PosProductInput["variants"][number], value: string) =>
    setForm((f) => ({ ...f, variants: f.variants.map((v, j) => (j === i ? { ...v, [key]: value } : v)) }));

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setResult(null);
    startTransition(async () => {
      const saved = await saveProduct(form);
      if (saved.ok) {
        setErrors({});
        if (isNew) {
          router.push(`/pos/products/${saved.id}?added=1`);
          return;
        }
        setResult({ ok: true, message: saved.message });
      } else {
        setErrors(saved.errors ?? {});
        setResult({ ok: false, message: saved.message });
      }
    });
  };

  const err = (key: string) => errors[key];
  const aria = (key: string) => (errors[key] ? { "aria-invalid": true, "aria-describedby": `e-${key}` } : {});

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-5">
      <div className="grid gap-4 md:grid-cols-2">
        <label className={`${labelClass} md:col-span-2`}>
          <span>Product name</span>
          <input
            value={form.name}
            onChange={(e) => set("name", e.target.value)}
            maxLength={200}
            required
            className={inputClass}
            {...aria("name")}
          />
          <FieldError id="e-name" message={err("name")} />
        </label>

        <label className={labelClass}>
          <span>Price (GH₵)</span>
          <input
            value={form.price}
            onChange={(e) => set("price", e.target.value)}
            inputMode="decimal"
            placeholder="450 or 1250.50"
            required
            className={inputClass}
            {...aria("price")}
          />
          <FieldError id="e-price" message={err("price")} />
        </label>

        {isNew && categories && (
          <label className={labelClass}>
            <span>Category</span>
            <select
              value={form.categoryId ?? ""}
              onChange={(e) => set("categoryId", e.target.value || null)}
              className={inputClass}
              {...aria("categoryId")}
            >
              <option value="">Choose later</option>
              {categories.map((top) =>
                top.children.length ? (
                  <optgroup key={top.id} label={top.name}>
                    {top.children.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </optgroup>
                ) : (
                  <option key={top.id} value={top.id}>
                    {top.name}
                  </option>
                ),
              )}
            </select>
          </label>
        )}

        {isNew && (
          <label className={labelClass}>
            <span>On the shelf now</span>
            <input
              value={form.startingStock}
              onChange={(e) => set("startingStock", e.target.value)}
              inputMode="numeric"
              placeholder="0"
              className={inputClass}
              {...aria("startingStock")}
            />
            <FieldError id="e-startingStock" message={err("startingStock")} />
          </label>
        )}

        <label className="flex min-h-11 items-center gap-3 self-end text-sm font-semibold text-pos-ink md:col-span-2">
          <input
            type="checkbox"
            checked={form.onWebsite}
            onChange={(e) => set("onWebsite", e.target.checked)}
            className="h-5 w-5 accent-pos-green"
          />
          <span>Show on the website</span>
        </label>
      </div>

      <fieldset className="m-0 flex flex-col gap-3 border-0 p-0">
        <legend className="mb-2 text-[15px] font-bold">{hasOptions ? "Options" : "Code, cost and alert"}</legend>
        {form.variants.map((v, i) => (
          <div key={v.id ?? i} className="grid gap-3 rounded-lg border border-pos-paper-deep p-3 sm:grid-cols-2 lg:grid-cols-5">
            {hasOptions && <p className="m-0 text-sm font-bold sm:col-span-2 lg:col-span-5">{v.label}</p>}
            <label className={labelClass}>
              <span>Code</span>
              <input value={v.sku} onChange={(e) => setVariant(i, "sku", e.target.value)} maxLength={60} placeholder="RDCM" className={inputClass} {...aria(`variants.${i}.sku`)} />
              <FieldError id={`e-variants.${i}.sku`} message={err(`variants.${i}.sku`)} />
            </label>
            <label className={labelClass}>
              <span>Barcode</span>
              <input value={v.barcode} onChange={(e) => setVariant(i, "barcode", e.target.value)} maxLength={64} placeholder="Scan or type" className={inputClass} {...aria(`variants.${i}.barcode`)} />
              <FieldError id={`e-variants.${i}.barcode`} message={err(`variants.${i}.barcode`)} />
            </label>
            {hasOptions && (
              <label className={labelClass}>
                <span>Price if different (GH₵)</span>
                <input value={v.priceOverride} onChange={(e) => setVariant(i, "priceOverride", e.target.value)} inputMode="decimal" className={inputClass} {...aria(`variants.${i}.priceOverride`)} />
                <FieldError id={`e-variants.${i}.priceOverride`} message={err(`variants.${i}.priceOverride`)} />
              </label>
            )}
            <label className={labelClass}>
              <span>Cost (GH₵)</span>
              <input value={v.cost} onChange={(e) => setVariant(i, "cost", e.target.value)} inputMode="decimal" placeholder="What you pay" className={inputClass} {...aria(`variants.${i}.cost`)} />
              <FieldError id={`e-variants.${i}.cost`} message={err(`variants.${i}.cost`)} />
            </label>
            <label className={labelClass}>
              <span>Alert when down to</span>
              <input value={String(v.reorderLevel)} onChange={(e) => setVariant(i, "reorderLevel", e.target.value)} inputMode="numeric" className={inputClass} {...aria(`variants.${i}.reorderLevel`)} />
              <FieldError id={`e-variants.${i}.reorderLevel`} message={err(`variants.${i}.reorderLevel`)} />
            </label>
          </div>
        ))}
        <FieldError id="e-variants" message={err("variants")} />
      </fieldset>

      {result && <Notice tone={result.ok ? "good" : "bad"}>{result.message}</Notice>}

      <div>
        <button type="submit" disabled={pending} className={`${buttonClass("primary")} min-h-12 px-6 text-base`}>
          {pending ? "Saving…" : isNew ? "Add product" : "Save changes"}
        </button>
      </div>
    </form>
  );
}
