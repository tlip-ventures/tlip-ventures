"use client";

import { useId, useState } from "react";
import { MAX_LINE_QTY } from "@/lib/checkout";

type Props = {
  value: number;
  onChange: (qty: number) => void;
  disabled?: boolean;
};

const clamp = (n: number) => Math.min(MAX_LINE_QTY, Math.max(1, Math.trunc(n)));

const buttonClass =
  "flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center text-xl leading-none text-ink hover:bg-well disabled:cursor-not-allowed disabled:text-neutral-400 disabled:hover:bg-transparent";

/**
 * "Qty  − 1 +" before Add to cart on the product page. The number can be typed
 * too; it is kept between 1 and MAX_LINE_QTY, the most one order line can hold.
 */
export function QtyStepper({ value, onChange, disabled = false }: Props) {
  const id = useId();
  // What is in the box while typing, so it can be empty for a moment.
  const [draft, setDraft] = useState<string | null>(null);

  function commit(text: string) {
    const n = Number.parseInt(text, 10);
    onChange(Number.isNaN(n) ? value : clamp(n));
    setDraft(null);
  }

  return (
    <div className="flex items-center gap-3">
      <label htmlFor={id} className="font-heading text-lg font-bold text-brand-green">
        Qty
      </label>
      <div className="flex items-stretch overflow-hidden rounded-lg border border-chip bg-white">
        <button
          type="button"
          onClick={() => onChange(clamp(value - 1))}
          disabled={disabled || value <= 1}
          aria-label="One fewer"
          aria-controls={id}
          className={buttonClass}
        >
          −
        </button>
        <input
          id={id}
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          autoComplete="off"
          value={draft ?? String(value)}
          disabled={disabled}
          onChange={(e) => {
            const digits = e.target.value.replace(/\D/g, "").slice(0, 2);
            setDraft(digits);
            if (digits) onChange(clamp(Number(digits)));
          }}
          onBlur={(e) => commit(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") commit(e.currentTarget.value);
          }}
          className="w-12 border-x border-chip text-center text-base font-semibold tabular-nums text-ink disabled:text-neutral-400"
        />
        <button
          type="button"
          onClick={() => onChange(clamp(value + 1))}
          disabled={disabled || value >= MAX_LINE_QTY}
          aria-label="One more"
          aria-controls={id}
          className={buttonClass}
        >
          +
        </button>
      </div>
    </div>
  );
}
