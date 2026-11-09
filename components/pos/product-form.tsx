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
 * Add a product or edit its name, price, colours, code, cost and alert level.
 * A product has one stock number: colours are only what the customer picks.
 * Photos and description are edited in the shop's website editor.
 */
export function ProductForm({
  initial,
  categories,
}: {
  initial: PosProductInput;
  /** Only for a new product. */
  categories?: CategoryGroup[];
}) {
  const router = useRouter();
  const [form, setForm] = useState(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [pending, startTransition] = useTransition();
  const isNew = initial.id === null;

  const set = <K extends keyof PosProductInput>(key: K, value: PosProductInput[K]) => setForm((f) => ({ ...f, [key]: value }));

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

      <fieldset className="m-0 grid gap-3 border-0 p-0 sm:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
        <legend className="mb-2 text-[15px] font-bold">Colours (optional)</legend>
        <label className={labelClass}>
          <span>Customers pick a</span>
          <input
            value={form.choiceName}
            onChange={(e) => set("choiceName", e.target.value)}
            maxLength={40}
            placeholder="Colour"
            className={inputClass}
            {...aria("choiceName")}
          />
          <FieldError id="e-choiceName" message={err("choiceName")} />
        </label>
        <label className={labelClass}>
          <span>Choices, separated by commas</span>
          <input
            value={form.choices}
            onChange={(e) => set("choices", e.target.value)}
            placeholder="Black, Red, Grey"
            className={inputClass}
            {...aria("choices")}
          />
          <FieldError id="e-choices" message={err("choices")} />
        </label>
        <p className="m-0 text-xs text-pos-muted sm:col-span-2">
          Stock is one number for the product: colours are not counted separately. The till asks which colour was sold.
        </p>
      </fieldset>

      <fieldset className="m-0 grid gap-3 border-0 p-0 sm:grid-cols-2 lg:grid-cols-4">
        <legend className="mb-2 text-[15px] font-bold">Code, cost and alert</legend>
        <label className={labelClass}>
          <span>Code</span>
          <input value={form.sku} onChange={(e) => set("sku", e.target.value)} maxLength={60} placeholder="RDCM" className={inputClass} {...aria("sku")} />
          <FieldError id="e-sku" message={err("sku")} />
        </label>
        <label className={labelClass}>
          <span>Barcode</span>
          <input value={form.barcode} onChange={(e) => set("barcode", e.target.value)} maxLength={64} placeholder="Scan or type" className={inputClass} {...aria("barcode")} />
          <FieldError id="e-barcode" message={err("barcode")} />
        </label>
        <label className={labelClass}>
          <span>Cost (GH₵)</span>
          <input value={form.cost} onChange={(e) => set("cost", e.target.value)} inputMode="decimal" placeholder="What you pay" className={inputClass} {...aria("cost")} />
          <FieldError id="e-cost" message={err("cost")} />
        </label>
        <label className={labelClass}>
          <span>Alert when down to</span>
          <input value={String(form.reorderLevel)} onChange={(e) => set("reorderLevel", e.target.value)} inputMode="numeric" className={inputClass} {...aria("reorderLevel")} />
          <FieldError id="e-reorderLevel" message={err("reorderLevel")} />
        </label>
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
