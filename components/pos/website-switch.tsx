"use client";

import { useOptimistic, useState, useTransition } from "react";
import { setOnWebsite } from "@/app/pos/(app)/products/actions";

/**
 * The "On the website" switch from the design. Flips at once, then saves;
 * goes back and says why if saving fails. Staff see it, but can't change it.
 */
export function WebsiteSwitch({
  productId,
  productName,
  on,
  canEdit,
}: {
  productId: string;
  productName: string;
  on: boolean;
  canEdit: boolean;
}) {
  const [optimisticOn, setOptimisticOn] = useOptimistic(on);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const toggle = () => {
    if (!canEdit) return;
    const next = !optimisticOn;
    setError(null);
    startTransition(async () => {
      setOptimisticOn(next);
      const result = await setOnWebsite(productId, next);
      if (!result.ok) setError(result.message);
    });
  };

  return (
    <span className="flex flex-col gap-1">
      <button
        type="button"
        role="switch"
        aria-checked={optimisticOn}
        aria-label={`Show ${productName} on the website`}
        aria-disabled={!canEdit || undefined}
        onClick={toggle}
        title={canEdit ? undefined : "Only the owner can change this"}
        className={`flex min-h-11 items-center gap-2.5 border-0 bg-transparent p-0 text-[13px] text-pos-soft ${
          canEdit ? "cursor-pointer" : "cursor-default"
        } ${pending ? "opacity-70" : ""}`}
      >
        <span
          className={`relative h-6 w-10 flex-none rounded-full transition-colors ${optimisticOn ? "bg-pos-green" : "bg-pos-switch-off"}`}
        >
          <span
            className={`absolute top-[3px] h-[18px] w-[18px] rounded-full bg-white shadow-[0_1px_2px_rgba(17,17,17,0.2)] transition-[left] ${
              optimisticOn ? "left-[19px]" : "left-[3px]"
            }`}
          />
        </span>
        <span>{optimisticOn ? "Showing" : "Hidden"}</span>
      </button>
      {error && (
        <span role="alert" className="max-w-[200px] text-xs font-semibold leading-4 text-pos-rust">
          {error}
        </span>
      )}
    </span>
  );
}
