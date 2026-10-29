"use client";

import { useActionState, useRef, useState, useTransition } from "react";
import { cancelCount, finishCount, saveCountLine, startCount } from "@/app/pos/(app)/count/actions";
import type { ActionResult } from "@/app/pos/(app)/products/actions";
import { buttonClass, Notice } from "./ui";

/** The "Counted" box on one row. Saves when you leave it or press Enter. */
export function CountInput({
  countId,
  variantId,
  name,
  initial,
}: {
  countId: string;
  variantId: string;
  name: string;
  initial: number | null;
}) {
  const start = initial === null ? "" : String(initial);
  const saved = useRef(start);
  const [value, setValue] = useState(start);
  const [state, setState] = useState<{ ok: boolean; message: string } | null>(null);
  const [pending, startTransition] = useTransition();

  const save = () => {
    const next = value.trim();
    if (next === saved.current) return;
    startTransition(async () => {
      const result = await saveCountLine(countId, variantId, next);
      setState(result);
      if (result.ok) saved.current = next;
    });
  };

  return (
    <span className="flex items-center gap-2">
      <input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={save}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            save();
          }
        }}
        inputMode="numeric"
        aria-label={`Counted, ${name}`}
        aria-invalid={state && !state.ok ? true : undefined}
        placeholder="—"
        className="min-h-11 w-20 rounded-md border border-pos-line bg-white px-2 text-center text-[15px] font-bold tabular-nums aria-[invalid=true]:border-pos-rust"
      />
      <span role="status" className={`w-14 text-xs font-semibold ${state && !state.ok ? "text-pos-rust" : "text-pos-green-ink"}`}>
        {pending ? "Saving…" : state ? (state.ok ? state.message : "Not saved") : ""}
      </span>
      {state && !state.ok && <span className="sr-only">{state.message}</span>}
    </span>
  );
}

export function StartCountForm() {
  const [state, action, pending] = useActionState<ActionResult | null, FormData>(startCount, null);
  return (
    <form action={action} className="flex flex-col gap-3">
      <label className="flex flex-col gap-1.5 text-[13px] font-semibold text-pos-soft">
        <span>Note (optional)</span>
        <input
          name="note"
          maxLength={300}
          placeholder="Baking shelf, or Month-end count"
          className="min-h-11 w-full max-w-md rounded-md border border-pos-line bg-white px-3 text-[15px] text-pos-ink placeholder:text-pos-muted"
        />
      </label>
      {state && !state.ok && <Notice tone="bad">{state.message}</Notice>}
      <div>
        <button type="submit" disabled={pending} className={buttonClass("primary")}>
          {pending ? "Starting…" : "Start a stock count"}
        </button>
      </div>
    </form>
  );
}

/** Finish (records the differences) and Cancel (changes nothing). */
export function FinishCountForms({ countId, differences }: { countId: string; differences: number }) {
  const [finished, finishAction, finishing] = useActionState<ActionResult | null, FormData>(finishCount, null);
  const [cancelled, cancelAction, cancelling] = useActionState<ActionResult | null, FormData>(cancelCount, null);
  const result = finished ?? cancelled;

  return (
    <div className="flex flex-col gap-3">
      {result && <Notice tone={result.ok ? "good" : "bad"}>{result.message}</Notice>}
      <div className="flex flex-wrap items-center gap-2">
        <form
          action={finishAction}
          onSubmit={(e) => {
            const text =
              differences === 0
                ? "Finish this count? Nothing needs correcting."
                : `Finish this count? The shelf count changes for ${differences} ${differences === 1 ? "item" : "items"}.`;
            if (!window.confirm(text)) e.preventDefault();
          }}
        >
          <input type="hidden" name="countId" value={countId} />
          <button type="submit" disabled={finishing || cancelling} className={`${buttonClass("primary")} min-h-12 px-6 text-base`}>
            {finishing ? "Finishing…" : "Finish count"}
          </button>
        </form>
        <form
          action={cancelAction}
          onSubmit={(e) => {
            if (!window.confirm("Cancel this count? What you typed is thrown away and the shelf count stays as it is.")) e.preventDefault();
          }}
        >
          <input type="hidden" name="countId" value={countId} />
          <button type="submit" disabled={finishing || cancelling} className={buttonClass("quiet")}>
            {cancelling ? "Cancelling…" : "Cancel count"}
          </button>
        </form>
      </div>
    </div>
  );
}
