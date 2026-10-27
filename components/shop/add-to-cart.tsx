"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import type { NewCartLine } from "@/lib/cart";
import { useCart } from "@/lib/cart-store";
import { formatPesewas } from "@/lib/money";

export type PickerVariant = {
  id: string;
  /** "Black", "Black / Large", or null for a product without options. */
  label: string | null;
  price: number;
  inStock: boolean;
};

/** How long the "Added to your cart" popup stays, unless the customer is touching or tabbing through it. */
const TOAST_MS = 6000;

type Props = {
  product: Omit<NewCartLine, "variantId" | "optionValues" | "unitPrice">;
  /** "Colour" or "Colour / Size"; null when the product has no options. */
  optionHeading: string | null;
  variants: PickerVariant[];
};

/** Option picker and "Add to cart" button. Out-of-stock options can't be chosen. */
export function AddToCart({ product, optionHeading, variants }: Props) {
  const add = useCart((s) => s.add);
  const groupId = useId();
  const [selectedId, setSelectedId] = useState(() => variants.find((v) => v.inStock)?.id ?? null);
  // What was just added, shown in a popup fixed to the bottom of the screen so it is
  // seen without scrolling. `key` restarts the popup when the same item is added again.
  const [added, setAdded] = useState<{ name: string; key: number } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  function hideLater() {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setAdded(null), TOAST_MS);
  }
  function keepOpen() {
    clearTimeout(timer.current);
  }
  useEffect(() => () => clearTimeout(timer.current), []);

  const hasOptions = optionHeading !== null && variants.some((v) => v.label !== null);
  const selected = variants.find((v) => v.id === selectedId) ?? null;
  const canAdd = selected?.inStock === true;
  const showPrices = new Set(variants.map((v) => v.price)).size > 1;

  function handleAdd() {
    if (!selected || !selected.inStock) return;
    add({ ...product, variantId: selected.id, optionValues: selected.label, unitPrice: selected.price });
    const name = selected.label ? `${product.productName} (${selected.label})` : product.productName;
    setAdded((prev) => ({ name, key: (prev?.key ?? 0) + 1 }));
    hideLater();
  }

  return (
    <div className="space-y-4">
      {hasOptions && (
        <fieldset className="space-y-2">
          <legend className="font-heading text-lg font-bold text-brand-green">{optionHeading}</legend>
          <div className="flex flex-wrap gap-2">
            {variants.map((variant) => (
              <label key={variant.id} className={variant.inStock ? "cursor-pointer" : "cursor-not-allowed"}>
                <input
                  type="radio"
                  name={groupId}
                  value={variant.id}
                  checked={selectedId === variant.id}
                  disabled={!variant.inStock}
                  onChange={() => setSelectedId(variant.id)}
                  className="peer sr-only"
                />
                <span className="flex min-h-11 flex-col justify-center rounded-lg border-2 border-neutral-300 px-3 py-1 text-sm text-ink peer-checked:border-brand-green peer-checked:bg-brand-green/10 peer-focus-visible:outline-3 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-brand-gold peer-disabled:border-dashed peer-disabled:text-neutral-600">
                  <span className="font-semibold">{variant.inStock ? variant.label : <s>{variant.label}</s>}</span>
                  <span className="text-xs">
                    {showPrices && `${formatPesewas(variant.price)} · `}
                    {variant.inStock ? "In stock" : "Out of stock"}
                  </span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>
      )}

      <button
        type="button"
        onClick={handleAdd}
        disabled={!canAdd}
        className="inline-flex min-h-12 w-full items-center justify-center rounded-lg bg-brand-orange-dark px-6 text-lg font-bold text-white hover:bg-brand-orange-deep disabled:cursor-not-allowed disabled:bg-neutral-300 disabled:text-neutral-700 sm:w-auto"
      >
        {canAdd
          ? `Add to cart${showPrices && selected ? ` · ${formatPesewas(selected.price)}` : ""}`
          : "Out of stock"}
      </button>

      {/* Always in the page so screen readers announce what appears in it. */}
      <div
        role="status"
        // On phones it sits just above the bottom bar (64px plus the safe area).
        className="pointer-events-none fixed inset-x-0 bottom-[calc(4rem+env(safe-area-inset-bottom))] z-50 px-4 pb-3 md:bottom-0 md:pb-[max(1rem,env(safe-area-inset-bottom))]"
      >
        {added && (
          <div
            key={added.key}
            onPointerEnter={keepOpen}
            onPointerLeave={hideLater}
            onFocus={keepOpen}
            onBlur={hideLater}
            className="pointer-events-auto mx-auto max-w-md space-y-3 rounded-lg bg-brand-green p-3 text-white shadow-lg motion-safe:animate-[toast-in_200ms_ease-out]"
          >
            <div className="flex items-start gap-3">
              <svg aria-hidden="true" viewBox="0 0 24 24" className="mt-0.5 h-6 w-6 shrink-0 fill-none stroke-brand-gold stroke-[3]">
                <path d="M5 12.5l4.5 4.5L19 7.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <p className="min-w-0 flex-1">
                <span className="block font-bold">Added to your cart</span>
                <span className="block text-sm">{added.name}</span>
              </p>
              <button
                type="button"
                onClick={() => setAdded(null)}
                aria-label="Close"
                className="-m-1 inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-2xl leading-none text-white hover:bg-white/10"
              >
                ×
              </button>
            </div>
            <Link
              href="/cart"
              className="flex min-h-11 w-full items-center justify-center rounded-lg bg-white px-4 font-bold text-brand-green no-underline hover:bg-neutral-100"
            >
              View cart and order
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
