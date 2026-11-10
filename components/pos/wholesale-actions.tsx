"use client";

import { useRouter } from "next/navigation";
import { useActionState } from "react";
import { setWholesalePrice } from "@/app/pos/(app)/wholesale/actions";
import { pesewasToInput } from "@/lib/money";
import { useBasket } from "@/lib/pos/basket-store";
import { buttonClass } from "./ui";

/** Owner: the wholesale price box on a product's row. Empty and Save removes it. */
export function WholesalePriceForm({ productId, price, name }: { productId: string; price: number | null; name: string }) {
  const [state, action, pending] = useActionState(setWholesalePrice, null);
  return (
    <form action={action} className="flex flex-col items-end gap-1">
      <input type="hidden" name="productId" value={productId} />
      <span className="flex items-center gap-1.5">
        <label className="sr-only" htmlFor={`ws-${productId}`}>
          Wholesale price of {name} in cedis
        </label>
        <input
          id={`ws-${productId}`}
          name="price"
          defaultValue={price === null ? "" : pesewasToInput(price)}
          inputMode="decimal"
          placeholder="None"
          className="min-h-11 w-24 rounded-md border border-pos-line bg-white px-2 text-right text-sm font-bold tabular-nums text-pos-ink md:min-h-9"
        />
        <button type="submit" disabled={pending} className={buttonClass("green", "sm")}>
          {pending ? "…" : "Save"}
        </button>
      </span>
      {state && (
        <span role={state.ok ? "status" : "alert"} className={`text-xs font-semibold ${state.ok ? "text-pos-green-ink" : "text-pos-rust"}`}>
          {state.message}
        </span>
      )}
    </form>
  );
}

/** Opens the till already switched to Wholesale. */
export function SellWholesaleButton() {
  const router = useRouter();
  return (
    <button
      type="button"
      onClick={() => {
        useBasket.getState().setWholesale(true);
        router.push("/pos/sell");
      }}
      className={buttonClass("primary")}
    >
      Sell at wholesale
    </button>
  );
}
