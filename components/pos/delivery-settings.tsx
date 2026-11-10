"use client";

import { useActionState, useState, useTransition } from "react";
import type { ActionResult } from "@/app/pos/(app)/products/actions";
import { addDeliveryAreaByHand, measurePlace, saveDeliveryPricing, updateDeliveryArea } from "@/app/pos/(app)/settings/delivery/actions";
import { deliveryFeeForKm, formatKm, type DeliveryArea, type DeliveryPricing } from "@/lib/delivery";
import { formatPesewas, pesewasToInput } from "@/lib/money";
import { dialogInputClass, dialogLabelClass } from "./action-dialog";
import { buttonClass, Notice } from "./ui";

const fee = (km: number, pricing: DeliveryPricing) => {
  const f = deliveryFeeForKm(km, pricing);
  return f === null ? "WhatsApp" : formatPesewas(f);
};

function Field({
  name,
  label,
  value,
  unit,
  help,
}: {
  name: string;
  label: string;
  value: string;
  unit: "GH₵" | "km";
  help?: string;
}) {
  return (
    <label className={dialogLabelClass}>
      <span>
        {label} ({unit})
      </span>
      <input name={name} defaultValue={value} inputMode="decimal" className={`${dialogInputClass} max-w-40 text-right tabular-nums`} />
      {help && <span className="text-xs font-normal text-pos-muted">{help}</span>}
    </label>
  );
}

/** Owner: the formula, free delivery and the shop's position. */
export function DeliveryPricingForm({ pricing, shop }: { pricing: DeliveryPricing; shop: { lat: number; lng: number } | null }) {
  const [state, action, pending] = useActionState<ActionResult | null, FormData>(saveDeliveryPricing, null);
  const cedi = (p: number) => pesewasToInput(p);
  return (
    <form action={action} className="flex flex-col gap-5">
      <fieldset className="m-0 grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-4 border-0 p-0">
        <legend className="mb-3 text-sm font-bold text-pos-ink">Motorbike fee (all of it goes to the rider)</legend>
        <Field name="baseFee" label="Base fee" unit="GH₵" value={cedi(pricing.baseFee)} />
        <Field name="baseKm" label="Base fee covers the first" unit="km" value={String(pricing.baseKm)} />
        <Field name="midRate" label="Then per km" unit="GH₵" value={cedi(pricing.midRate)} />
        <Field name="midEndKm" label="Up to" unit="km" value={String(pricing.midEndKm)} />
        <Field name="farRate" label="After that, per km" unit="GH₵" value={cedi(pricing.farRate)} />
        <Field name="roundTo" label="Round up to the next" unit="GH₵" value={cedi(pricing.roundTo)} />
        <Field name="closeKm" label="Very close: up to" unit="km" value={String(pricing.closeKm)} />
        <Field name="closeFee" label="Very close fee" unit="GH₵" value={cedi(pricing.closeFee)} />
        <Field name="maxKm" label="Furthest by motorbike" unit="km" value={String(pricing.maxKm)} help="Further: agree the fee on WhatsApp." />
      </fieldset>
      <fieldset className="m-0 grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-4 border-0 p-0">
        <legend className="mb-3 text-sm font-bold text-pos-ink">Free delivery</legend>
        <Field
          name="freeFrom"
          label="Orders of at least"
          unit="GH₵"
          value={pricing.freeFrom === null ? "" : cedi(pricing.freeFrom)}
          help="Items after any discount. Empty: no free delivery."
        />
        <Field name="freeOff" label="Take this off the fee" unit="GH₵" value={cedi(pricing.freeOff)} help="You pay this part to the rider." />
      </fieldset>
      <label className={`${dialogLabelClass} max-w-[640px]`}>
        <span>Where the shop is</span>
        <input
          name="shopLocation"
          placeholder={shop ? `${shop.lat.toFixed(6)}, ${shop.lng.toFixed(6)}` : "Paste the shop's Google Maps link"}
          className={dialogInputClass}
        />
        <span className="text-xs font-normal text-pos-muted">
          {shop ? (
            <>
              Now at{" "}
              <a href={`https://www.google.com/maps?q=${shop.lat},${shop.lng}`} target="_blank" rel="noreferrer" className="font-semibold">
                {shop.lat.toFixed(5)}, {shop.lng.toFixed(5)}
              </a>
              . Leave empty to keep it. Every map search measures from here; the areas below keep their km.
            </>
          ) : (
            "Not set yet: the till can't search the map until it is."
          )}
        </span>
      </label>
      {state && <Notice tone={state.ok ? "good" : "bad"}>{state.message}</Notice>}
      <div>
        <button type="submit" disabled={pending} className={buttonClass("primary")}>
          {pending ? "Saving…" : "Save prices"}
        </button>
      </div>
    </form>
  );
}

/** Owner: one area on the list. */
function AreaRow({ area, pricing }: { area: DeliveryArea; pricing: DeliveryPricing }) {
  const [state, action, pending] = useActionState<ActionResult | null, FormData>(updateDeliveryArea, null);
  const [km, setKm] = useState(String(area.km));
  const kmValue = /^\d{1,3}(\.\d)?$/.test(km.trim()) ? Number(km) : null;
  return (
    <li className={`border-b border-pos-paper-deep px-5 py-3 last:border-b-0 ${area.isActive ? "" : "bg-pos-row-hover"}`}>
      <form action={action} className="flex flex-wrap items-end gap-3">
        <input type="hidden" name="id" value={area.id} />
        <label className={`${dialogLabelClass} min-w-48 flex-[2_1_200px]`}>
          <span className="sr-only">Area name</span>
          <input name="name" defaultValue={area.name} maxLength={80} className={dialogInputClass} />
        </label>
        <label className={`${dialogLabelClass} w-24`}>
          <span className="sr-only">Road km from the shop</span>
          <span className="flex items-center gap-1.5">
            <input
              name="km"
              value={km}
              onChange={(e) => setKm(e.target.value)}
              inputMode="decimal"
              className={`${dialogInputClass} text-right tabular-nums`}
            />
            <span aria-hidden="true">km</span>
          </span>
        </label>
        <span className="flex min-h-11 w-24 items-center justify-end text-sm font-bold tabular-nums text-pos-ink">
          {kmValue === null ? "—" : fee(kmValue, pricing)}
        </span>
        <label className="flex min-h-11 items-center gap-2 text-[13px] text-pos-soft">
          <input type="checkbox" name="isActive" defaultChecked={area.isActive} className="size-4 accent-pos-green" />
          On the list
        </label>
        <button type="submit" disabled={pending} className={buttonClass("outline", "sm")}>
          {pending ? "Saving…" : "Save"}
        </button>
        {state && !state.ok && <Notice tone="bad">{state.message}</Notice>}
        {state?.ok && <span className="text-[13px] font-semibold text-pos-green-ink">Saved.</span>}
      </form>
    </li>
  );
}

export function DeliveryAreaList({ areas, pricing }: { areas: DeliveryArea[]; pricing: DeliveryPricing }) {
  return (
    <ul className="m-0 list-none p-0">
      {areas.map((a) => (
        <AreaRow key={`${a.id}:${a.name}:${a.km}:${a.isActive}`} area={a} pricing={pricing} />
      ))}
    </ul>
  );
}

/** Owner: add an area, with its km typed or measured on the map. */
export function AddDeliveryAreaForm({ pricing }: { pricing: DeliveryPricing }) {
  const [state, action, pending] = useActionState<ActionResult | null, FormData>(addDeliveryAreaByHand, null);
  const [name, setName] = useState("");
  const [km, setKm] = useState("");
  const [pos, setPos] = useState<{ lat: number; lng: number } | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [measuring, startMeasure] = useTransition();
  const kmValue = /^\d{1,3}(\.\d)?$/.test(km.trim()) ? Number(km) : null;

  const measure = () =>
    startMeasure(async () => {
      setNote(null);
      const result = await measurePlace(name);
      if (!result.ok) return setNote(result.message);
      const best = result.places[0];
      if (!best) return setNote(`Nothing found for “${name}” on the map. Type the km from Google Maps directions.`);
      setKm(String(best.km));
      setPos({ lat: best.lat, lng: best.lng });
      setNote(
        `Found ${best.name}${best.detail ? ` (${best.detail})` : ""}: ${formatKm(best.km)}${best.approximate ? ", a straight-line guess" : " by road"}. Check it, then Add.`,
      );
    });

  return (
    <form action={action} className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end gap-3">
        <label className={`${dialogLabelClass} min-w-48 flex-[2_1_200px]`}>
          <span>Area</span>
          <input
            name="name"
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              setPos(null);
            }}
            maxLength={80}
            placeholder="Mallam Junction"
            className={dialogInputClass}
          />
        </label>
        <button type="button" onClick={measure} disabled={measuring || name.trim().length < 2} className={buttonClass("outline")}>
          {measuring ? "Measuring…" : "Find on the map"}
        </button>
        <label className={`${dialogLabelClass} w-28`}>
          <span>Road km</span>
          <input name="km" value={km} onChange={(e) => setKm(e.target.value)} inputMode="decimal" className={`${dialogInputClass} text-right tabular-nums`} />
        </label>
        <span className="flex min-h-11 items-center text-sm font-bold tabular-nums">{kmValue === null ? "" : fee(kmValue, pricing)}</span>
        <input type="hidden" name="lat" value={pos?.lat ?? ""} />
        <input type="hidden" name="lng" value={pos?.lng ?? ""} />
        <button type="submit" disabled={pending} className={buttonClass("primary")}>
          {pending ? "Adding…" : "Add"}
        </button>
      </div>
      {note && <span className="text-[13px] leading-[19px] text-pos-soft">{note}</span>}
      {state && <Notice tone={state.ok ? "good" : "bad"}>{state.message}</Notice>}
    </form>
  );
}
