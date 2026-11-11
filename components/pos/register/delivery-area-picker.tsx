"use client";

import { useId, useState, useTransition } from "react";
import { addDeliveryArea, searchDeliveryPlace, type FoundPlace } from "@/app/pos/(app)/sell/delivery-actions";
import { areaFee, deliveryQuote, describeDiscount, formatKm, matchAreas, type DeliveryArea, type DeliveryPricing } from "@/lib/delivery";
import { formatPesewas, type Pesewas } from "@/lib/money";
import { useBasket } from "@/lib/pos/basket-store";

const inputClass = "min-h-11 w-full rounded-md border border-pos-line bg-white px-3 text-sm text-pos-ink placeholder:text-pos-muted";
const rowClass =
  "flex min-h-11 w-full items-center justify-between gap-3 border-b border-pos-paper-deep px-3 py-2 text-left text-sm last:border-b-0 hover:bg-pos-tint-green focus-visible:bg-pos-tint-green";

const listFee = (area: { km: number; fixedFee?: number | null }, pricing: DeliveryPricing) => {
  const fee = areaFee(area, pricing);
  return fee === null ? "Agree on WhatsApp" : formatPesewas(fee);
};

/**
 * The till's delivery area: pick it from the price list, or search the map
 * for a place (or paste a Google Maps link the customer sent) and measure it
 * from the shop. The fee then follows the price list (the area's set price,
 * or the formula for its distance, less the order's delivery discount) until
 * it is typed over.
 */
export function DeliveryAreaPicker({ areas, pricing, itemsTotal }: { areas: DeliveryArea[]; pricing: DeliveryPricing; itemsTotal: Pesewas }) {
  const id = useId();
  const delivery = useBasket((s) => s.delivery);
  const setDelivery = useBasket((s) => s.setDelivery);
  const [text, setText] = useState("");
  const [found, setFound] = useState<FoundPlace[] | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [keep, setKeep] = useState(true);
  const [searching, startSearch] = useTransition();

  const area = delivery.area ?? null;
  const matches = matchAreas(areas, text);

  const pick = (name: string, km: number, fixedFee: number | null = null) => {
    // The address starts as the area's name; a landmark typed after it stays.
    const prev = delivery.area?.name ?? "";
    const address = !delivery.address.trim() || delivery.address.trim() === prev ? name : delivery.address;
    setDelivery({ area: { name, km, fixedFee }, auto: areaFee({ km, fixedFee }, pricing) !== null, address });
    setText("");
    setFound(null);
    setMessage(null);
  };

  const search = () => {
    const q = text.trim();
    if (q.length < 2) {
      setMessage("Type at least 2 letters of the area or landmark.");
      return;
    }
    setMessage(null);
    startSearch(async () => {
      const result = await searchDeliveryPlace(q);
      if (!result.ok) {
        setFound(null);
        setMessage(result.message);
        return;
      }
      setFound(result.places);
      if (result.places.length === 0) setMessage(`Nothing found for “${q}”. Try the area’s name, or paste the customer’s map link.`);
    });
  };

  const pickFound = (p: FoundPlace) => {
    pick(p.name, p.km);
    if (keep && p.name !== "Pinned location") {
      // Best effort: the sale goes on whether or not the list is updated.
      void addDeliveryArea({ name: p.name, km: p.km, lat: p.lat, lng: p.lng });
    }
  };

  if (area) {
    const quote = deliveryQuote(area, itemsTotal, pricing);
    return (
      <div className="flex flex-col gap-1.5 rounded-md border border-pos-green bg-pos-tint-green px-3 py-2.5 text-[13px] leading-[19px] text-pos-green-ink">
        <span className="flex items-start justify-between gap-2">
          <span>
            <strong className="text-sm text-pos-ink">{area.name}</strong> · {formatKm(area.km)} from the shop
          </span>
          <button
            type="button"
            onClick={() => setDelivery({ area: null, auto: false })}
            className="-my-2 min-h-11 shrink-0 px-1 font-bold text-pos-green hover:text-pos-forest md:min-h-8"
          >
            Change
          </button>
        </span>
        {quote.kind === "too_far" ? (
          <span className="font-semibold text-pos-rust">Further than the price list goes: agree the fee with the customer and type it below.</span>
        ) : delivery.auto ? (
          <span>
            {quote.fixed ? "Set price" : "Price list"}: <strong className="tabular-nums">{formatPesewas(quote.listFee)}</strong>
            {quote.discount > 0 && (
              <>
                {" "}
                less {formatPesewas(quote.discount)} ={" "}
                <strong className="tabular-nums">{formatPesewas(quote.fee)}</strong>
                {quote.level && <span className="block text-xs">{describeDiscount(quote.level)}.</span>}
              </>
            )}
          </span>
        ) : (
          <span className="flex flex-wrap items-center gap-x-2">
            <span>Fee typed by hand.</span>
            <button
              type="button"
              onClick={() => setDelivery({ auto: true })}
              className="-my-2 min-h-11 px-1 font-bold text-pos-green hover:text-pos-forest md:min-h-8"
            >
              Use the price list ({formatPesewas(quote.fee)})
            </button>
          </span>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={`${id}-area`} className="text-[13px] font-semibold text-pos-soft">
        Area (sets the fee)
      </label>
      <div className="flex gap-2">
        <input
          id={`${id}-area`}
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setFound(null);
            setMessage(null);
          }}
          onKeyDown={(e) => {
            if (e.key !== "Enter") return;
            e.preventDefault();
            if (matches.length === 1) pick(matches[0].name, matches[0].km, matches[0].fixedFee);
            else if (matches.length === 0) search();
          }}
          maxLength={500}
          autoComplete="off"
          placeholder="East Legon, a landmark, or a map link"
          aria-describedby={`${id}-help`}
          className={inputClass}
        />
      </div>
      <span id={`${id}-help`} className="text-xs leading-[18px] text-pos-muted">
        Pick from the price list, or search the map. A Google Maps link the customer sent gives the exact distance.
      </span>

      {text.trim() !== "" && (
        <ul aria-label="Areas" className="m-0 flex list-none flex-col overflow-hidden rounded-md border border-pos-line bg-white p-0">
          {matches.map((a) => (
            <li key={a.id}>
              <button type="button" onClick={() => pick(a.name, a.km, a.fixedFee)} className={rowClass}>
                <span className="min-w-0">
                  <span className="font-semibold text-pos-ink">{a.name}</span>{" "}
                  <span className="text-xs text-pos-muted">{formatKm(a.km)}</span>
                </span>
                <span className="shrink-0 font-bold tabular-nums">{listFee(a, pricing)}</span>
              </button>
            </li>
          ))}
          {found === null && (
            <li>
              <button type="button" onClick={search} disabled={searching} className={`${rowClass} font-semibold text-pos-green disabled:opacity-60`}>
                {searching ? "Searching the map…" : `Search the map for “${text.trim().slice(0, 40)}”`}
              </button>
            </li>
          )}
          {found?.map((p) => (
            <li key={`${p.lat},${p.lng}`}>
              <button type="button" onClick={() => pickFound(p)} className={rowClass}>
                <span className="flex min-w-0 flex-col">
                  <span className="font-semibold text-pos-ink">{p.name}</span>
                  <span className="truncate text-xs text-pos-muted">
                    {p.detail ? `${p.detail} · ` : ""}
                    {formatKm(p.km)}
                    {p.approximate ? " (straight-line guess)" : " by road"}
                  </span>
                </span>
                <span className="shrink-0 font-bold tabular-nums">{listFee(p, pricing)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {found && found.length > 0 && (
        <label className="flex min-h-11 items-center gap-2 text-[13px] text-pos-soft md:min-h-8">
          <input type="checkbox" checked={keep} onChange={(e) => setKeep(e.target.checked)} className="size-4 accent-pos-green" />
          Add the place picked to the price list
        </label>
      )}
      {message && (
        <p role="status" className="m-0 text-[13px] font-semibold leading-[19px] text-pos-rust">
          {message}
        </p>
      )}
    </div>
  );
}
