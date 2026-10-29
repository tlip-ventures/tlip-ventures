"use client";

import { useActionState, useEffect, useRef, type ReactNode } from "react";
import { adjustVariant, recountVariant, type ActionResult } from "@/app/pos/(app)/products/actions";
import { buttonClass, Notice, type ButtonKind } from "./ui";

const inputClass =
  "min-h-11 w-full rounded-md border border-pos-line bg-white px-3 text-[15px] text-pos-ink tabular-nums placeholder:text-pos-muted";
const labelClass = "flex flex-col gap-1.5 text-[13px] font-semibold text-pos-soft";

/** A button that opens a small modal form; closes itself when the action succeeds. */
function DialogButton({
  label,
  title,
  kind,
  size,
  action,
  children,
  submitLabel,
}: {
  label: string;
  title: string;
  kind: ButtonKind;
  size: "md" | "sm";
  action: (prev: ActionResult | null, formData: FormData) => Promise<ActionResult>;
  children: ReactNode;
  submitLabel: string;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [state, formAction, pending] = useActionState(action, null);

  useEffect(() => {
    if (state?.ok) dialog.current?.close();
  }, [state]);

  return (
    <>
      <button type="button" className={buttonClass(kind, size)} onClick={() => dialog.current?.showModal()}>
        {label}
      </button>
      {state?.ok && (
        <span role="status" className="sr-only">
          {state.message}
        </span>
      )}
      <dialog
        ref={dialog}
        className="m-auto w-[min(400px,calc(100vw-32px))] rounded-[10px] border border-pos-card-line bg-white p-0 text-left text-pos-ink shadow-[0_24px_48px_rgba(17,17,17,0.12)] backdrop:bg-pos-ink/40"
      >
        <form action={formAction} className="flex flex-col gap-4 p-5">
          <h2 className="m-0 text-lg font-bold leading-6">{title}</h2>
          {children}
          {state && !state.ok && <Notice tone="bad">{state.message}</Notice>}
          <div className="flex justify-end gap-2">
            <button type="button" className={buttonClass("quiet")} onClick={() => dialog.current?.close()}>
              Cancel
            </button>
            <button type="submit" disabled={pending} className={buttonClass("primary")}>
              {pending ? "Saving…" : submitLabel}
            </button>
          </div>
        </form>
      </dialog>
    </>
  );
}

/** "Recount": type what is on the shelf; the app records the difference. */
export function RecountButton({
  variantId,
  name,
  onHand,
  kind = "green",
  size = "sm",
}: {
  variantId: string;
  name: string;
  onHand: number;
  kind?: ButtonKind;
  size?: "md" | "sm";
}) {
  return (
    <DialogButton label="Recount" title={`Recount ${name}`} kind={kind} size={size} action={recountVariant} submitLabel="Save count">
      <input type="hidden" name="variantId" value={variantId} />
      <p className="m-0 text-sm leading-[22px] text-pos-soft">
        The app says <strong className="text-pos-ink">{onHand}</strong>. Count what is on the shelf now and type it in.
      </p>
      <label className={labelClass}>
        <span>On the shelf now</span>
        <input name="counted" type="number" inputMode="numeric" min={0} step={1} required autoFocus className={inputClass} />
      </label>
    </DialogButton>
  );
}

/** "Adjust": add or take away a number, with a reason (damaged, found, gift…). */
export function AdjustButton({ variantId, name, size = "sm" }: { variantId: string; name: string; size?: "md" | "sm" }) {
  return (
    <DialogButton label="Adjust" title={`Adjust ${name}`} kind="outline" size={size} action={adjustVariant} submitLabel="Save">
      <input type="hidden" name="variantId" value={variantId} />
      <label className={labelClass}>
        <span>Add or take away</span>
        <input name="change" type="text" inputMode="numeric" placeholder="3 to add, -2 to take away" required autoFocus className={inputClass} />
      </label>
      <label className={labelClass}>
        <span>Why</span>
        <input name="reason" type="text" maxLength={300} placeholder="Damaged, found in the store room…" required className={inputClass} />
      </label>
    </DialogButton>
  );
}
