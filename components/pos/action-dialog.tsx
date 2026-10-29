"use client";

import { useActionState, useEffect, useRef, type ReactNode } from "react";
import type { ActionResult } from "@/app/pos/(app)/products/actions";
import { buttonClass, Notice, type ButtonKind } from "./ui";

export const dialogInputClass =
  "min-h-11 w-full rounded-md border border-pos-line bg-white px-3 text-[15px] text-pos-ink tabular-nums placeholder:text-pos-muted";
export const dialogLabelClass = "flex flex-col gap-1.5 text-[13px] font-semibold text-pos-soft";

/** A button that opens a small modal form; closes itself when the action succeeds. */
export function ActionDialog({
  label,
  title,
  kind,
  size,
  action,
  children,
  submitLabel,
  tone = "primary",
  className = "",
}: {
  label: string;
  title: string;
  kind: ButtonKind;
  size: "md" | "sm";
  action: (prev: ActionResult | null, formData: FormData) => Promise<ActionResult>;
  children: ReactNode;
  submitLabel: string;
  /** "danger" for Cancel sale and similar. */
  tone?: "primary" | "danger";
  /** Extra classes for the opening button, e.g. flex-1 in a row of buttons. */
  className?: string;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [state, formAction, pending] = useActionState(action, null);

  useEffect(() => {
    if (state?.ok) dialog.current?.close();
  }, [state]);

  return (
    <>
      <button type="button" className={`${buttonClass(kind, size)} ${className}`} onClick={() => dialog.current?.showModal()}>
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
            <button
              type="submit"
              disabled={pending}
              className={buttonClass(tone)}
            >
              {pending ? "Saving…" : submitLabel}
            </button>
          </div>
        </form>
      </dialog>
    </>
  );
}

