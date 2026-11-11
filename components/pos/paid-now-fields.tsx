"use client";

import { formatPesewas, pesewasToInput, type Pesewas } from "@/lib/money";
import type { PaidNow } from "@/lib/pos/basket";

const WAYS = [
  ["momo", "MoMo"],
  ["cash", "Cash"],
  ["bank", "Bank"],
] as const;

const boxClass =
  "min-h-11 w-full rounded-md border border-pos-line bg-white px-3 text-right text-sm font-bold tabular-nums text-pos-ink placeholder:font-normal placeholder:text-pos-faint";

/**
 * What the customer pays now, per way: MoMo, Cash and Bank boxes (any mix),
 * with "All by …" to fill the whole amount one way. Named inputs (momo, cash,
 * bank) so it works inside a form as well as controlled.
 */
export function PaidNowFields({
  value,
  onChange,
  due,
  legend = "Paid by",
}: {
  value: PaidNow;
  onChange: (value: PaidNow) => void;
  due: Pesewas;
  legend?: string;
}) {
  return (
    <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
      <legend className="mb-1.5 text-[13px] font-semibold text-pos-soft">{legend}</legend>
      <div className="grid grid-cols-3 gap-2">
        {WAYS.map(([key, label]) => (
          <label key={key} className="flex flex-col gap-1 text-[13px] font-semibold text-pos-soft">
            <span>{label} (GH₵)</span>
            <input
              name={key}
              value={value[key]}
              onChange={(e) => onChange({ ...value, [key]: e.target.value })}
              inputMode="decimal"
              placeholder="0"
              className={boxClass}
            />
          </label>
        ))}
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-1">
        {WAYS.map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => onChange({ momo: "", cash: "", bank: "", [key]: pesewasToInput(due) })}
            className="min-h-11 px-1 text-[13px] font-bold text-pos-green hover:text-pos-forest md:min-h-8"
          >
            All {formatPesewas(due)} by {label}
          </button>
        ))}
      </div>
    </fieldset>
  );
}
