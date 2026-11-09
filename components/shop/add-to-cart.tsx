"use client";

import { useId, useState } from "react";
import type { NewCartLine } from "@/lib/cart";
import { useCart } from "@/lib/cart-store";
import { formatPesewas, lineTotal } from "@/lib/money";
import { useAddedToast } from "./added-toast";
import { QtyStepper } from "./qty-stepper";

export type PickerVariant = {
  id: string;
  price: number;
  inStock: boolean;
};

type Props = {
  product: Omit<NewCartLine, "variantId" | "optionValues" | "unitPrice">;
  /** "Colour" or "Design"; null when there is nothing to pick. */
  choiceHeading: string | null;
  /** What the customer picks from. Stock is shared: every choice is in or out of stock together. */
  choices: string[];
  variant: PickerVariant | null;
};

/** Colour (or design) picker, quantity and "Add to cart" button. */
export function AddToCart({ product, choiceHeading, choices, variant }: Props) {
  const add = useCart((s) => s.add);
  const groupId = useId();
  const [choice, setChoice] = useState<string | null>(null);
  const showAdded = useAddedToast((s) => s.show);
  const [qty, setQty] = useState(1);

  const hasChoices = choiceHeading !== null && choices.length > 0;
  const inStock = variant?.inStock === true;
  const needsChoice = hasChoices && choice === null;
  const canAdd = inStock && !needsChoice;

  function handleAdd() {
    if (!variant || !canAdd) return;
    add({ ...product, variantId: variant.id, optionValues: hasChoices ? choice : null, unitPrice: variant.price }, qty);
    const name = hasChoices && choice ? `${product.productName} (${choice})` : product.productName;
    showAdded(qty > 1 ? `${qty} × ${name}` : name);
    setQty(1);
  }

  return (
    <div className="space-y-4">
      {hasChoices && (
        <fieldset className="space-y-2" disabled={!inStock}>
          <legend className="font-heading text-lg font-bold text-brand-green">
            {choiceHeading}
            {choice && <span className="font-normal text-ink">: {choice}</span>}
          </legend>
          <div className="flex flex-wrap gap-2">
            {choices.map((c) => (
              <label key={c} className={inStock ? "cursor-pointer" : "cursor-not-allowed"}>
                <input
                  type="radio"
                  name={groupId}
                  value={c}
                  checked={choice === c}
                  onChange={() => setChoice(c)}
                  className="peer sr-only"
                />
                <span className="flex min-h-11 items-center rounded-lg border-2 border-neutral-300 px-3 py-1 text-sm font-semibold text-ink peer-checked:border-brand-green peer-checked:bg-brand-green/10 peer-focus-visible:outline-3 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-brand-gold peer-disabled:border-dashed peer-disabled:text-neutral-600">
                  {c}
                </span>
              </label>
            ))}
          </div>
        </fieldset>
      )}

      <QtyStepper value={qty} onChange={setQty} disabled={!canAdd} />

      <button
        type="button"
        onClick={handleAdd}
        disabled={!canAdd}
        className="inline-flex min-h-12 w-full items-center justify-center rounded-lg bg-brand-green px-6 text-lg font-bold text-white hover:bg-brand-green-dark disabled:cursor-not-allowed disabled:bg-neutral-300 disabled:text-neutral-700 sm:w-auto"
      >
        {!inStock || !variant
          ? "Out of stock"
          : needsChoice
            ? `Choose a ${choiceHeading!.toLowerCase()} first`
            : qty > 1
              ? `Add to cart · ${formatPesewas(lineTotal(variant.price, qty))}`
              : "Add to cart"}
      </button>
    </div>
  );
}
