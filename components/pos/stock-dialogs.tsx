"use client";

import { adjustVariant, moveStock, recountVariant } from "@/app/pos/(app)/products/actions";
import { ActionDialog, dialogInputClass as inputClass, dialogLabelClass as labelClass } from "./action-dialog";
import type { ButtonKind } from "./ui";

/** A place other than the shop's shelf (left out: the shop). */
export type DialogPlace = { id: number; name: string };

function PlaceFields({ place }: { place?: DialogPlace }) {
  if (!place) return null;
  return (
    <>
      <input type="hidden" name="placeId" value={place.id} />
      <input type="hidden" name="placeName" value={place.name} />
    </>
  );
}

/** "Recount": type what is there; the app records the difference. */
export function RecountButton({
  variantId,
  name,
  onHand,
  place,
  kind = "green",
  size = "sm",
}: {
  variantId: string;
  name: string;
  onHand: number;
  /** Count in this place; left out: the shop's shelf. */
  place?: DialogPlace;
  kind?: ButtonKind;
  size?: "md" | "sm";
}) {
  const there = place ? `in the ${place.name.toLowerCase()}` : "on the shelf";
  return (
    <ActionDialog
      label="Recount"
      title={place ? `Recount ${name} (${place.name})` : `Recount ${name}`}
      kind={kind}
      size={size}
      action={recountVariant}
      submitLabel="Save count"
    >
      <input type="hidden" name="variantId" value={variantId} />
      <PlaceFields place={place} />
      <p className="m-0 text-sm leading-[22px] text-pos-soft">
        The app says <strong className="text-pos-ink">{onHand}</strong>. Count what is {there} now and type it in.
      </p>
      <label className={labelClass}>
        <span>{place ? `In the ${place.name.toLowerCase()} now` : "On the shelf now"}</span>
        <input name="counted" type="number" inputMode="numeric" min={0} step={1} required autoFocus className={inputClass} />
      </label>
    </ActionDialog>
  );
}

/** "Adjust": add or take away a number, with a reason (damaged, found, gift…). */
export function AdjustButton({
  variantId,
  name,
  place,
  size = "sm",
}: {
  variantId: string;
  name: string;
  /** Adjust in this place; left out: the shop's shelf. */
  place?: DialogPlace;
  size?: "md" | "sm";
}) {
  return (
    <ActionDialog
      label="Adjust"
      title={place ? `Adjust ${name} (${place.name})` : `Adjust ${name}`}
      kind="outline"
      size={size}
      action={adjustVariant}
      submitLabel="Save"
    >
      <input type="hidden" name="variantId" value={variantId} />
      <PlaceFields place={place} />
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

/**
 * "Move stock": from one place to another, usually the warehouse to the shop
 * so it can be sold. Each place's count is shown in the lists.
 */
export function MoveStockButton({
  variantId,
  name,
  places,
  from,
  to,
  label = "Move stock",
  kind = "outline",
  size = "sm",
}: {
  variantId: string;
  name: string;
  places: readonly (DialogPlace & { onHand: number })[];
  from: number;
  to: number;
  label?: string;
  kind?: ButtonKind;
  size?: "md" | "sm";
}) {
  const option = (p: DialogPlace) => (
    <option key={p.id} value={p.id}>
      {p.name}
    </option>
  );
  return (
    <ActionDialog label={label} title={`Move ${name}`} kind={kind} size={size} action={moveStock} submitLabel="Move">
      <input type="hidden" name="variantId" value={variantId} />
      <p className="m-0 text-sm leading-[22px] text-pos-soft">
        {places.map((p, i) => (
          <span key={p.id}>
            {i > 0 && " · "}
            {p.name}: <strong className="text-pos-ink tabular-nums">{p.onHand}</strong>
          </span>
        ))}
      </p>
      <div className="grid grid-cols-2 gap-3">
        <label className={labelClass}>
          <span>From</span>
          <select name="from" defaultValue={from} required className={inputClass}>
            {places.map(option)}
          </select>
        </label>
        <label className={labelClass}>
          <span>To</span>
          <select name="to" defaultValue={to} required className={inputClass}>
            {places.map(option)}
          </select>
        </label>
      </div>
      <label className={labelClass}>
        <span>How many</span>
        <input name="qty" type="number" inputMode="numeric" min={1} step={1} required autoFocus className={inputClass} />
      </label>
      <label className={labelClass}>
        <span>Note (optional)</span>
        <input name="note" type="text" maxLength={200} placeholder="For the shelf, back to store…" className={inputClass} />
      </label>
    </ActionDialog>
  );
}
