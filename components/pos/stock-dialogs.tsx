"use client";

import { adjustVariant, recountVariant } from "@/app/pos/(app)/products/actions";
import { ActionDialog, dialogInputClass as inputClass, dialogLabelClass as labelClass } from "./action-dialog";
import type { ButtonKind } from "./ui";

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
    <ActionDialog label="Recount" title={`Recount ${name}`} kind={kind} size={size} action={recountVariant} submitLabel="Save count">
      <input type="hidden" name="variantId" value={variantId} />
      <p className="m-0 text-sm leading-[22px] text-pos-soft">
        The app says <strong className="text-pos-ink">{onHand}</strong>. Count what is on the shelf now and type it in.
      </p>
      <label className={labelClass}>
        <span>On the shelf now</span>
        <input name="counted" type="number" inputMode="numeric" min={0} step={1} required autoFocus className={inputClass} />
      </label>
    </ActionDialog>
  );
}

/** "Adjust": add or take away a number, with a reason (damaged, found, gift…). */
export function AdjustButton({ variantId, name, size = "sm" }: { variantId: string; name: string; size?: "md" | "sm" }) {
  return (
    <ActionDialog label="Adjust" title={`Adjust ${name}`} kind="outline" size={size} action={adjustVariant} submitLabel="Save">
      <input type="hidden" name="variantId" value={variantId} />
      <label className={labelClass}>
        <span>Add or take away</span>
        <input name="change" type="text" inputMode="numeric" placeholder="3 to add, -2 to take away" required autoFocus className={inputClass} />
      </label>
      <label className={labelClass}>
        <span>Why</span>
        <input name="reason" type="text" maxLength={300} placeholder="Damaged, found in the store room…" required className={inputClass} />
      </label>
    </ActionDialog>
  );
}
