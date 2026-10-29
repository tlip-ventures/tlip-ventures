"use client";

import { useActionState, useEffect, useRef } from "react";
import type { ActionResult } from "@/app/pos/(app)/products/actions";
import { addStaff, updatePerson } from "@/app/pos/(app)/settings/actions";
import { buttonClass, Notice } from "./ui";

const inputClass =
  "min-h-11 w-full rounded-md border border-pos-line bg-white px-3 text-[15px] text-pos-ink placeholder:text-pos-muted";
const labelClass = "flex flex-col gap-1.5 text-[13px] font-semibold text-pos-soft";

function Check({ name, label, hint, defaultChecked, disabled }: { name: string; label: string; hint?: string; defaultChecked: boolean; disabled?: boolean }) {
  return (
    <label className={`flex min-h-11 items-start gap-3 py-1 text-sm ${disabled ? "text-pos-muted" : "text-pos-ink"}`}>
      <input type="checkbox" name={name} defaultChecked={defaultChecked} disabled={disabled} className="mt-0.5 h-5 w-5 flex-none accent-pos-green" />
      <span className="flex flex-col">
        <span className="font-semibold">{label}</span>
        {hint && <span className="text-xs text-pos-muted">{hint}</span>}
      </span>
    </label>
  );
}

export type Person = {
  userId: string;
  email: string;
  displayName: string | null;
  role: string;
  isActive: boolean;
  canGiveDiscounts: boolean;
  canAdjustStock: boolean;
  lastSignIn: string | null;
};

/** One person's name and switches. The owner's own permissions are fixed. */
export function PersonForm({ person, isSelf }: { person: Person; isSelf: boolean }) {
  const [state, action, pending] = useActionState<ActionResult | null, FormData>(updatePerson, null);
  const owner = person.role === "owner";
  return (
    <form action={action} className="grid gap-x-6 gap-y-2 md:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)_auto] md:items-start">
      <input type="hidden" name="userId" value={person.userId} />
      <div className="flex flex-col gap-2">
        <label className={labelClass}>
          <span>Name</span>
          <input name="displayName" defaultValue={person.displayName ?? ""} maxLength={60} placeholder={owner ? "Owner" : "Staff"} className={inputClass} />
        </label>
        <span className="text-xs text-pos-muted">
          {person.email}
          {person.lastSignIn ? ` · last signed in ${person.lastSignIn}` : " · not signed in yet"}
        </span>
      </div>
      <div className="flex flex-col">
        {owner ? (
          <p className="m-0 py-2 text-sm leading-[22px] text-pos-soft">Owner: can do everything, and is the only one who sees profit, costs, supplier bills and settings.</p>
        ) : (
          <>
            <Check name="canGiveDiscounts" label="Can give discounts" defaultChecked={person.canGiveDiscounts} />
            <Check name="canAdjustStock" label="Can count and adjust stock" hint="Recounts, stock counts and adjustments" defaultChecked={person.canAdjustStock} />
          </>
        )}
        {/* The owner can't switch themself off; the box still sends "on". */}
        {isSelf || owner ? (
          <input type="hidden" name="isActive" value="on" />
        ) : (
          <Check name="isActive" label="Can sign in" hint="Untick when someone leaves" defaultChecked={person.isActive} />
        )}
        {owner && <input type="hidden" name="canGiveDiscounts" value="on" />}
        {owner && <input type="hidden" name="canAdjustStock" value="on" />}
      </div>
      <div className="flex flex-col gap-2 md:pt-6">
        <button type="submit" disabled={pending} className={buttonClass("outline")}>
          {pending ? "Saving…" : "Save"}
        </button>
        {state && <Notice tone={state.ok ? "good" : "bad"}>{state.message}</Notice>}
      </div>
    </form>
  );
}

export function AddStaffForm() {
  const [state, action, pending] = useActionState<ActionResult | null, FormData>(addStaff, null);
  const form = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state?.ok) form.current?.reset();
  }, [state]);

  return (
    <form ref={form} action={action} className="flex flex-col gap-4">
      <div className="grid gap-4 md:grid-cols-3">
        <label className={labelClass}>
          <span>Name</span>
          <input name="displayName" required maxLength={60} className={inputClass} />
        </label>
        <label className={labelClass}>
          <span>Email (they sign in with it)</span>
          <input name="email" type="email" required autoComplete="off" className={inputClass} />
        </label>
        <label className={labelClass}>
          <span>Password (at least 8 characters)</span>
          <input name="password" type="password" required minLength={8} autoComplete="new-password" className={inputClass} />
        </label>
      </div>
      <div className="flex flex-col">
        <Check name="canGiveDiscounts" label="Can give discounts" defaultChecked />
        <Check name="canAdjustStock" label="Can count and adjust stock" hint="Recounts, stock counts and adjustments" defaultChecked={false} />
      </div>
      {state && <Notice tone={state.ok ? "good" : "bad"}>{state.message}</Notice>}
      <div>
        <button type="submit" disabled={pending} className={buttonClass("primary")}>
          {pending ? "Adding…" : "Add staff member"}
        </button>
      </div>
    </form>
  );
}
