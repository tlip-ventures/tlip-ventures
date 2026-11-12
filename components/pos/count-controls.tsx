"use client";

import { useActionState, useRef, useState, useTransition, type KeyboardEvent } from "react";
import { cancelCount, finishCount, saveCountLine, setCartonSize, startCount } from "@/app/pos/(app)/count/actions";
import type { ActionResult } from "@/app/pos/(app)/products/actions";
import { countTotal } from "@/lib/pos/stock";
import { ActionDialog, dialogInputClass, dialogLabelClass } from "./action-dialog";
import { buttonClass, Notice } from "./ui";

const boxClass =
  "min-h-11 w-16 rounded-md border border-pos-line bg-white px-2 text-center text-[15px] font-bold tabular-nums aria-[invalid=true]:border-pos-rust";

/**
 * The "Counted" boxes on one row: Cartons (when the product has a carton
 * size) and Singles. Saves when you leave a box or press Enter; the total in
 * single items shows beside them.
 */
export function CountInput({
  countId,
  variantId,
  name,
  unitsPerCarton,
  initialCartons,
  initialSingles,
}: {
  countId: string;
  variantId: string;
  name: string;
  unitsPerCarton: number | null;
  initialCartons: number | null;
  initialSingles: number | null;
}) {
  const start = { cartons: initialCartons === null ? "" : String(initialCartons), singles: initialSingles === null ? "" : String(initialSingles) };
  const saved = useRef(start);
  const [cartons, setCartons] = useState(start.cartons);
  const [singles, setSingles] = useState(start.singles);
  const [state, setState] = useState<{ ok: boolean; message: string } | null>(null);
  const [pending, startTransition] = useTransition();

  const save = () => {
    const next = { cartons: unitsPerCarton ? cartons.trim() : "", singles: singles.trim() };
    if (next.cartons === saved.current.cartons && next.singles === saved.current.singles) return;
    startTransition(async () => {
      const result = await saveCountLine(countId, variantId, next.cartons, next.singles);
      setState(result);
      if (result.ok) saved.current = next;
    });
  };
  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      save();
    }
  };
  const whole = (text: string) => (/^\d{1,6}$/.test(text.trim()) ? Number(text.trim()) : text.trim() === "" ? null : NaN);
  const total = countTotal(unitsPerCarton ? whole(cartons) : null, whole(singles), unitsPerCarton);

  return (
    <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
      {unitsPerCarton && (
        <>
          <input
            value={cartons}
            onChange={(e) => setCartons(e.target.value)}
            onBlur={save}
            onKeyDown={onKeyDown}
            inputMode="numeric"
            aria-label={`Cartons of ${unitsPerCarton}, ${name}`}
            aria-invalid={state && !state.ok ? true : undefined}
            placeholder="0"
            className={boxClass}
          />
          <span aria-hidden="true" className="text-xs text-pos-muted">
            × {unitsPerCarton} +
          </span>
        </>
      )}
      <input
        value={singles}
        onChange={(e) => setSingles(e.target.value)}
        onBlur={save}
        onKeyDown={onKeyDown}
        inputMode="numeric"
        aria-label={unitsPerCarton ? `Single items, ${name}` : `Counted, ${name}`}
        aria-invalid={state && !state.ok ? true : undefined}
        placeholder={unitsPerCarton ? "0" : "—"}
        className={boxClass}
      />
      {unitsPerCarton && total !== null && !Number.isNaN(total) && (
        <span className="text-xs font-semibold tabular-nums text-pos-soft">= {total.toLocaleString("en-US")}</span>
      )}
      <span role="status" className={`min-w-14 text-xs font-semibold ${state && !state.ok ? "text-pos-rust" : "text-pos-green-ink"}`}>
        {pending ? "Saving…" : state ? (state.ok ? state.message : "Not saved") : ""}
      </span>
      {state && !state.ok && <span className="w-full text-xs font-semibold text-pos-rust">{state.message}</span>}
    </span>
  );
}

/** Set or change how many single items are in a carton of a product. */
export function CartonSizeButton({ variantId, name, units }: { variantId: string; name: string; units: number | null }) {
  return (
    <ActionDialog
      label={units ? `Carton: ${units}` : "Carton size"}
      title={`Carton of ${name}`}
      kind="quiet"
      size="sm"
      action={setCartonSize}
      submitLabel="Save"
      className="!px-0 underline"
    >
      <input type="hidden" name="variantId" value={variantId} />
      <label className={dialogLabelClass}>
        <span>Single items in one carton (leave empty if it doesn&apos;t come in cartons)</span>
        <input name="units" type="number" inputMode="numeric" min={2} max={10000} step={1} defaultValue={units ?? ""} autoFocus className={dialogInputClass} />
      </label>
    </ActionDialog>
  );
}

export function StartCountForm({ placeId, placeName }: { placeId: number; placeName: string }) {
  const [state, action, pending] = useActionState<ActionResult | null, FormData>(startCount, null);
  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="placeId" value={placeId} />
      <label className="flex flex-col gap-1.5 text-[13px] font-semibold text-pos-soft">
        <span>Note (optional)</span>
        <input
          name="note"
          maxLength={300}
          placeholder={placeName === "Shop" ? "Baking shelf, or Month-end count" : "Back row, or First warehouse count"}
          className="min-h-11 w-full max-w-md rounded-md border border-pos-line bg-white px-3 text-[15px] text-pos-ink placeholder:text-pos-muted"
        />
      </label>
      {state && !state.ok && <Notice tone="bad">{state.message}</Notice>}
      <div>
        <button type="submit" disabled={pending} className={buttonClass("primary")}>
          {pending ? "Starting…" : `Start counting the ${placeName.toLowerCase()}`}
        </button>
      </div>
    </form>
  );
}

/** Finish (records the differences) and Cancel (changes nothing). */
export function FinishCountForms({
  countId,
  placeId,
  placeName,
  differences,
}: {
  countId: string;
  placeId: number;
  placeName: string;
  differences: number;
}) {
  const where = placeName === "Shop" ? "shelf" : placeName.toLowerCase();
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
                : `Finish this count? The ${where} count changes for ${differences} ${differences === 1 ? "item" : "items"}.`;
            if (!window.confirm(text)) e.preventDefault();
          }}
        >
          <input type="hidden" name="countId" value={countId} />
          <input type="hidden" name="placeId" value={placeId} />
          <button type="submit" disabled={finishing || cancelling} className={`${buttonClass("primary")} min-h-12 px-6 text-base`}>
            {finishing ? "Finishing…" : "Finish count"}
          </button>
        </form>
        <form
          action={cancelAction}
          onSubmit={(e) => {
            if (!window.confirm(`Cancel this count? What you typed is thrown away and the ${where} count stays as it is.`)) e.preventDefault();
          }}
        >
          <input type="hidden" name="countId" value={countId} />
          <input type="hidden" name="placeId" value={placeId} />
          <button type="submit" disabled={finishing || cancelling} className={buttonClass("quiet")}>
            {cancelling ? "Cancelling…" : "Cancel count"}
          </button>
        </form>
      </div>
    </div>
  );
}
