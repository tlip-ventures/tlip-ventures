"use client";

import { useState } from "react";
import { parseQty } from "@/lib/pos/basket";

/**
 * A basket line's quantity: − and + for one at a time, and the number itself
 * can be typed (200 instead of 200 taps). Never above what is on the shelf
 * for this line (max); typing more sets max and says so. 0 removes the line.
 */
export function QtyInput({ qty, max, name, onChange }: { qty: number; max: number; name: string; onChange: (qty: number) => void }) {
  // What is being typed, or null when not editing (the box then shows qty).
  const [text, setText] = useState<string | null>(null);
  const [tooMany, setTooMany] = useState(false);

  const type = (value: string) => {
    const digits = value.replace(/\D/g, "").slice(0, 4);
    setText(digits);
    const n = parseQty(digits);
    setTooMany(n !== null && n > max);
    // Follow the typing straight away so the total is right; 0 waits for the end (it removes the line).
    if (n !== null && n > 0) onChange(Math.min(n, max));
  };

  const finish = () => {
    if (text !== null && parseQty(text) === 0) onChange(0);
    setText(null);
  };

  return (
    <span className="flex flex-col items-center gap-0.5">
      <span className="flex items-center rounded-md border border-pos-line">
        <button
          type="button"
          onClick={() => {
            setTooMany(false);
            onChange(qty - 1);
          }}
          aria-label={`Remove one ${name}`}
          className="h-11 w-10 text-lg text-pos-ink md:h-9 md:w-9"
        >
          −
        </button>
        <input
          value={text ?? String(qty)}
          onFocus={(e) => {
            setText(String(qty));
            e.currentTarget.select();
          }}
          onChange={(e) => type(e.target.value)}
          onBlur={finish}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === "Escape") {
              e.preventDefault();
              e.currentTarget.blur();
            }
          }}
          inputMode="numeric"
          pattern="[0-9]*"
          aria-label={`How many ${name}`}
          className="h-11 w-12 border-x border-pos-line bg-white text-center text-sm font-bold tabular-nums text-pos-ink focus:bg-pos-tint-green md:h-9"
        />
        <button
          type="button"
          onClick={() => onChange(qty + 1)}
          disabled={qty >= max}
          aria-label={`Add one ${name}`}
          title={qty >= max ? `Only ${max} on the shelf` : undefined}
          className="h-11 w-10 text-lg text-pos-ink disabled:cursor-not-allowed disabled:text-pos-faint md:h-9 md:w-9"
        >
          +
        </button>
      </span>
      {tooMany && (
        <span role="status" className="text-[11px] font-semibold leading-4 text-pos-rust">
          Only {max} on the shelf
        </span>
      )}
    </span>
  );
}
