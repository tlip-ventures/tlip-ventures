"use client";

import { useId, useState } from "react";
import type { NewCartLine } from "@/lib/cart";
import { useCart } from "@/lib/cart-store";
import { formatPesewas } from "@/lib/money";
import { useAddedToast } from "./added-toast";

export type PickerVariant = {
  id: string;
  /** "Black", "Black / Large", or null for a product without options. */
  label: string | null;
  price: number;
  inStock: boolean;
};

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
  const showAdded = useAddedToast((s) => s.show);

  const hasOptions = optionHeading !== null && variants.some((v) => v.label !== null);
  const selected = variants.find((v) => v.id === selectedId) ?? null;
  const canAdd = selected?.inStock === true;
  const showPrices = new Set(variants.map((v) => v.price)).size > 1;

  function handleAdd() {
    if (!selected || !selected.inStock) return;
    add({ ...product, variantId: selected.id, optionValues: selected.label, unitPrice: selected.price });
    const name = selected.label ? `${product.productName} (${selected.label})` : product.productName;
    showAdded(name);
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
        className="inline-flex min-h-12 w-full items-center justify-center rounded-lg bg-brand-green px-6 text-lg font-bold text-white hover:bg-brand-green-dark disabled:cursor-not-allowed disabled:bg-neutral-300 disabled:text-neutral-700 sm:w-auto"
      >
        {canAdd
          ? `Add to cart${showPrices && selected ? ` · ${formatPesewas(selected.price)}` : ""}`
          : "Out of stock"}
      </button>
    </div>
  );
}
