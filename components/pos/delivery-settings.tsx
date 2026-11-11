"use client";

import { useActionState, useState, useTransition } from "react";
import type { ActionResult } from "@/app/pos/(app)/products/actions";
import { addDeliveryAreaByHand, measurePlace, saveDeliveryDiscounts, saveDeliveryPricing, updateDeliveryArea } from "@/app/pos/(app)/settings/delivery/actions";
import { deliveryFeeForKm, formatKm, MAX_DELIVERY_DISCOUNTS, type DeliveryArea, type DeliveryDiscount, type DeliveryPricing } from "@/lib/delivery";
import { formatPesewas, parseCedis, pesewasToInput } from "@/lib/money";
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

/** Owner: the formula and the shop's position. */
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
  const [setPrice, setSetPrice] = useState(area.fixedFee === null ? "" : pesewasToInput(area.fixedFee));
  const kmValue = /^\d{1,3}(\.\d)?$/.test(km.trim()) ? Number(km) : null;
  const formula = kmValue === null ? "—" : fee(kmValue, pricing);
  const typedPrice = setPrice.trim() === "" ? null : parseCedis(setPrice);
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
        <label className={`${dialogLabelClass} w-28`}>
          <span className="sr-only">Set price for {area.name} in cedis (empty: the formula)</span>
          <input
            name="fixedFee"
            value={setPrice}
            onChange={(e) => setSetPrice(e.target.value)}
            inputMode="decimal"
            placeholder={formula}
            title="Empty: the formula's price. Type a price to use it instead."
            className={`${dialogInputClass} text-right font-bold tabular-nums ${typedPrice !== null ? "border-pos-green bg-pos-tint-green" : ""}`}
          />
        </label>
        <span className="flex min-h-11 w-28 items-center text-xs leading-4 text-pos-muted">
          {typedPrice !== null ? `Set price (formula ${formula})` : "Formula price"}
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
      <li aria-hidden="true" className="hidden flex-wrap gap-3 border-b border-pos-paper-deep px-5 py-2 text-xs font-semibold text-pos-muted md:flex">
        <span className="min-w-48 flex-[2_1_200px]">Area</span>
        <span className="w-24">Road km</span>
        <span className="w-28">Price (GH₵)</span>
      </li>
      {areas.map((a) => (
        <AreaRow key={`${a.id}:${a.name}:${a.km}:${a.isActive}:${a.fixedFee}`} area={a} pricing={pricing} />
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

type DiscountRow = { from: string; off: string; free: boolean };

const toRow = (d: DeliveryDiscount): DiscountRow => ({
  from: pesewasToInput(d.from),
  off: d.off === null ? "" : pesewasToInput(d.off),
  free: d.off === null,
});

/** Owner: delivery discounts by order size, up to MAX_DELIVERY_DISCOUNTS levels. */
export function DeliveryDiscountsForm({ discounts }: { discounts: DeliveryDiscount[] }) {
  const [state, action, pending] = useActionState<ActionResult | null, FormData>(saveDeliveryDiscounts, null);
  const [rows, setRows] = useState<DiscountRow[]>(() => (discounts.length ? discounts.map(toRow) : [{ from: "", off: "", free: false }]));
  const change = (i: number, changes: Partial<DiscountRow>) => setRows((r) => r.map((row, j) => (j === i ? { ...row, ...changes } : row)));

  return (
    <form action={action} className="flex flex-col gap-3">
      <ul className="m-0 flex list-none flex-col gap-3 p-0">
        {rows.map((row, i) => (
          <li key={i} className="flex flex-wrap items-end gap-3">
            <label className={`${dialogLabelClass} w-40`}>
              <span>Orders from (GH₵)</span>
              <input
                name="from"
                value={row.from}
                onChange={(e) => change(i, { from: e.target.value })}
                inputMode="decimal"
                placeholder="1000"
                className={`${dialogInputClass} text-right tabular-nums`}
              />
            </label>
            <label className={`${dialogLabelClass} w-40`}>
              <span>Take off delivery (GH₵)</span>
              <input
                name="off"
                value={row.free ? "" : row.off}
                onChange={(e) => change(i, { off: e.target.value })}
                disabled={row.free}
                inputMode="decimal"
                placeholder={row.free ? "All of it" : "40"}
                className={`${dialogInputClass} text-right tabular-nums disabled:bg-pos-row-hover`}
              />
              {/* A disabled input isn't sent: keep the rows lined up. */}
              {row.free && <input type="hidden" name="off" value="" />}
            </label>
            <label className="flex min-h-11 items-center gap-2 text-[13px] text-pos-soft">
              <input
                type="checkbox"
                name="free"
                value={String(i)}
                checked={row.free}
                onChange={(e) => change(i, { free: e.target.checked })}
                className="size-4 accent-pos-green"
              />
              Free delivery
            </label>
            <button
              type="button"
              onClick={() => setRows((r) => (r.length > 1 ? r.filter((_, j) => j !== i) : [{ from: "", off: "", free: false }]))}
              className={buttonClass("quiet", "sm")}
            >
              Remove
            </button>
          </li>
        ))}
      </ul>
      {rows.length < MAX_DELIVERY_DISCOUNTS && (
        <div>
          <button type="button" onClick={() => setRows((r) => [...r, { from: "", off: "", free: false }])} className={buttonClass("outline", "sm")}>
            Add a level
          </button>
        </div>
      )}
      <span className="text-xs text-pos-muted">
        Items after any discount. The highest level an order reaches counts. You pay the part taken off to the rider. Remove every level for no
        delivery discount.
      </span>
      {state && <Notice tone={state.ok ? "good" : "bad"}>{state.message}</Notice>}
      <div>
        <button type="submit" disabled={pending} className={buttonClass("primary")}>
          {pending ? "Saving…" : "Save discounts"}
        </button>
      </div>
    </form>
  );
}
