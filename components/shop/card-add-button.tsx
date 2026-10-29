"use client";

import Link from "next/link";
import type { NewCartLine } from "@/lib/cart";
import { useCart, useCartHydrated } from "@/lib/cart-store";
import type { CardAddAction } from "@/lib/product";
import { useAddedToast } from "./added-toast";

type Props = {
  action: CardAddAction;
  product: Omit<NewCartLine, "variantId" | "optionValues" | "unitPrice">;
  /** "round": the green "+" beside the price on phones; "full": the button under the card from 768px. */
  look: "round" | "full";
};

const PlusIcon = () => (
  <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
    <path d="M12 5v14M5 12h14" />
  </svg>
);

// A 36px green circle inside a 44px tap target.
const roundClass =
  "group/add -m-1 inline-flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-full text-white no-underline hover:text-white md:hidden";
const roundCircle =
  "flex h-9 w-9 items-center justify-center rounded-full bg-brand-green group-hover/add:bg-brand-green-dark";
// Hidden until hover or keyboard focus on screens that can hover; always shown on touch screens.
const fullClass =
  "mt-2.5 hidden min-h-10 cursor-pointer items-center justify-center rounded-lg bg-brand-green px-3 text-[13px] font-bold text-white no-underline hover:bg-brand-green-dark hover:text-white md:flex md:[@media(hover:hover)]:opacity-0 md:group-hover/card:opacity-100 md:group-focus-within/card:opacity-100 motion-safe:transition-opacity";

/**
 * Add to cart from a product card. A product with one variant is added straight
 * away; one with options sends the customer to its page to choose.
 * Out-of-stock products get no button (the card says "Out of stock").
 */
export function CardAddButton({ action, product, look }: Props) {
  const add = useCart((s) => s.add);
  const showAdded = useAddedToast((s) => s.show);
  const hydrated = useCartHydrated();
  const variantId = action.kind === "add" ? action.variantId : null;
  const inCart = useCart((s) => (variantId ? (s.lines.find((l) => l.variantId === variantId)?.qty ?? 0) : 0));
  const qty = hydrated ? inCart : 0;

  if (action.kind === "out_of_stock") return null;

  if (action.kind === "choose") {
    return (
      <Link
        href={`/products/${product.slug}`}
        aria-label={look === "round" ? `Choose options for ${product.productName}` : undefined}
        className={look === "round" ? roundClass : fullClass}
      >
        {look === "round" ? (
          <span className={roundCircle}>
            <PlusIcon />
          </span>
        ) : (
          <>
            Choose options<span className="sr-only">: {product.productName}</span>
          </>
        )}
      </Link>
    );
  }

  function handleAdd() {
    if (action.kind !== "add") return;
    add({ ...product, variantId: action.variantId, optionValues: action.optionValues, unitPrice: action.unitPrice });
    showAdded(action.optionValues ? `${product.productName} (${action.optionValues})` : product.productName);
  }

  if (look === "round") {
    return (
      <button
        type="button"
        onClick={handleAdd}
        aria-label={qty > 0 ? `Add another ${product.productName} to cart, ${qty} in cart` : `Add ${product.productName} to cart`}
        className={roundClass}
      >
        <span className={roundCircle}>
          <PlusIcon />
        </span>
      </button>
    );
  }

  // The visible words start the accessible name, so voice control can use them.
  return (
    <button type="button" onClick={handleAdd} className={fullClass}>
      {qty > 0 ? `In cart (${qty})` : "Add to cart"}
      <span className="sr-only">
        : {product.productName}
        {qty > 0 && ", add another"}
      </span>
    </button>
  );
}
