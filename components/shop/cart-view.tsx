"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition, type FormEvent } from "react";
import { placeOrder, type PlaceOrderResult } from "@/app/(shop)/cart/actions";
import { cartTotal, type CartLine, type CurrentVariant } from "@/lib/cart";
import { useCart, useCartHydrated } from "@/lib/cart-store";
import { MAX_LINE_QTY } from "@/lib/checkout";
import { formatPesewas, lineTotal } from "@/lib/money";

type Errors = Extract<PlaceOrderResult, { ok: false }>;

export function CartView() {
  const hydrated = useCartHydrated();
  const lines = useCart((s) => s.lines);
  const refresh = useCart((s) => s.refresh);
  const [checked, setChecked] = useState(false);

  // Once per visit: replace the saved names, prices and stock with current ones.
  const ids = lines.map((l) => l.variantId).join(",");
  useEffect(() => {
    if (!hydrated || !ids || checked) return;
    let cancelled = false;
    fetch(`/api/cart?ids=${ids}`)
      .then((res) => (res.ok ? (res.json() as Promise<{ variants: CurrentVariant[] }>) : null))
      .then((body) => {
        if (!cancelled && body) refresh(body.variants);
      })
      // Offline or server trouble: keep the saved details; checkout checks again anyway.
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setChecked(true);
      });
    return () => {
      cancelled = true;
    };
  }, [hydrated, ids, checked, refresh]);

  if (!hydrated) {
    return <div className="h-40 animate-pulse rounded-lg bg-neutral-100" aria-hidden="true" />;
  }

  if (lines.length === 0) {
    return (
      <div className="space-y-4 rounded-lg bg-neutral-50 px-4 py-10 text-center">
        <p className="font-semibold">Your cart is empty.</p>
        <Link
          href="/products"
          className="inline-flex min-h-11 items-center rounded-lg bg-brand-orange-dark px-5 text-base font-bold text-white no-underline hover:bg-brand-orange-deep"
        >
          Browse products
        </Link>
      </div>
    );
  }

  const blocked = lines.some((l) => l.problem);
  const total = cartTotal(lines);

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_380px]">
      <section aria-labelledby="cart-items-heading" className="space-y-4">
        <h2 id="cart-items-heading" className="sr-only">
          Items
        </h2>
        <ul className="divide-y divide-neutral-200 border-y border-neutral-200">
          {lines.map((line) => (
            <CartLineRow key={line.variantId} line={line} />
          ))}
        </ul>
        <p className="flex items-baseline justify-between text-lg">
          <span className="font-semibold">Items total</span>
          <span className="font-bold">{formatPesewas(total)}</span>
        </p>
        <p className="rounded-lg bg-brand-gold/15 px-4 py-3 text-sm leading-relaxed">
          No payment is taken on this website. After you send your order on WhatsApp, we confirm availability,
          agree delivery and its fee with you, and share how to pay.
        </p>
      </section>

      <CheckoutForm blocked={blocked} />
    </div>
  );
}

function CartLineRow({ line }: { line: CartLine }) {
  const setQty = useCart((s) => s.setQty);
  const remove = useCart((s) => s.remove);
  const stepper =
    "inline-flex h-11 w-11 items-center justify-center rounded-lg border border-neutral-300 text-xl font-bold text-ink hover:border-brand-green disabled:opacity-40";

  return (
    <li className="flex gap-3 py-4">
      {/* Same link as the product name below, so keyboards and screen readers skip it. */}
      <Link href={`/products/${line.slug}`} className="shrink-0" tabIndex={-1} aria-hidden="true">
        <div className="relative h-20 w-20 overflow-hidden rounded-lg bg-neutral-100">
          {line.image && (
            <Image src={line.image.url} alt={line.image.alt} fill sizes="80px" className="object-contain" />
          )}
        </div>
      </Link>
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <div className="flex justify-between gap-3">
          <div className="min-w-0">
            <Link href={`/products/${line.slug}`} className="font-semibold text-ink">
              {line.productName}
            </Link>
            {line.optionValues && <p className="text-sm text-neutral-700">{line.optionValues}</p>}
            <p className="text-sm text-neutral-700">{formatPesewas(line.unitPrice)} each</p>
          </div>
          <p className="shrink-0 font-bold">{line.problem ? "—" : formatPesewas(lineTotal(line.unitPrice, line.qty))}</p>
        </div>

        {line.problem && (
          <p className="text-sm font-semibold text-red-700">
            {line.problem === "out_of_stock" ? "Out of stock." : "No longer available."} Remove it to order.
          </p>
        )}

        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2" role="group" aria-label={`Quantity of ${line.productName}`}>
            <button
              type="button"
              className={stepper}
              onClick={() => setQty(line.variantId, line.qty - 1)}
              disabled={line.qty <= 1}
              aria-label="One fewer"
            >
              −
            </button>
            <span className="w-8 text-center font-semibold" aria-live="polite">
              {line.qty}
            </span>
            <button
              type="button"
              className={stepper}
              onClick={() => setQty(line.variantId, line.qty + 1)}
              disabled={line.qty >= MAX_LINE_QTY || line.problem !== null}
              aria-label="One more"
            >
              +
            </button>
          </div>
          <button
            type="button"
            onClick={() => remove(line.variantId)}
            className="inline-flex min-h-11 items-center px-2 text-sm font-semibold text-brand-orange-dark underline underline-offset-2"
          >
            Remove<span className="sr-only"> {line.productName}</span>
          </button>
        </div>
      </div>
    </li>
  );
}

function CheckoutForm({ blocked }: { blocked: boolean }) {
  const router = useRouter();
  const lines = useCart((s) => s.lines);
  const markProblems = useCart((s) => s.markProblems);
  const orderPlaced = useCart((s) => s.orderPlaced);
  const [pending, startTransition] = useTransition();
  const [errors, setErrors] = useState<Errors | null>(null);
  const [form, setForm] = useState({ customerName: "", phone: "", location: "", notes: "", website: "" });

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (blocked || pending) return;
    setErrors(null);
    startTransition(async () => {
      try {
        const result = await placeOrder({
          ...form,
          items: lines.map((l) => ({ variantId: l.variantId, qty: l.qty })),
        });
        if (result.ok) {
          orderPlaced(result.order);
          router.push("/order-sent");
          return;
        }
        if (result.problems) markProblems(result.problems);
        setErrors(result);
      } catch {
        setErrors({ ok: false, message: "Could not reach the shop. Check your connection and try again." });
      }
    });
  }

  const field = errors?.fieldErrors ?? {};
  const input =
    "min-h-11 w-full rounded-lg border border-neutral-400 bg-white px-3 py-2 text-base text-ink aria-invalid:border-red-700";

  return (
    <section aria-labelledby="checkout-heading" className="h-fit space-y-4 rounded-lg border border-neutral-200 p-4">
      <h2 id="checkout-heading" className="text-xl font-bold text-brand-green">
        Your details
      </h2>
      <form onSubmit={handleSubmit} noValidate className="relative space-y-4">
        <div className="space-y-1">
          <label htmlFor="customerName" className="block font-semibold">
            Name
          </label>
          <input
            id="customerName"
            name="customerName"
            autoComplete="name"
            maxLength={100}
            required
            value={form.customerName}
            onChange={(e) => setForm({ ...form, customerName: e.target.value })}
            aria-invalid={field.customerName ? true : undefined}
            aria-describedby={field.customerName ? "customerName-error" : undefined}
            className={input}
          />
          {field.customerName && (
            <p id="customerName-error" className="text-sm font-semibold text-red-700">
              {field.customerName}
            </p>
          )}
        </div>

        <div className="space-y-1">
          <label htmlFor="phone" className="block font-semibold">
            Phone number
          </label>
          <input
            id="phone"
            name="phone"
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            required
            placeholder="024 123 4567"
            value={form.phone}
            onChange={(e) => setForm({ ...form, phone: e.target.value })}
            aria-invalid={field.phone ? true : undefined}
            aria-describedby={field.phone ? "phone-hint phone-error" : "phone-hint"}
            className={input}
          />
          <p id="phone-hint" className="text-sm text-neutral-700">
            Ghana number, e.g. 024 123 4567 or +233 24 123 4567.
          </p>
          {field.phone && (
            <p id="phone-error" className="text-sm font-semibold text-red-700">
              {field.phone}
            </p>
          )}
        </div>

        <div className="space-y-1">
          <label htmlFor="location" className="block font-semibold">
            Your location
          </label>
          <input
            id="location"
            name="location"
            autoComplete="street-address"
            maxLength={200}
            required
            placeholder="e.g. Dansoman, near Sharp Curve"
            value={form.location}
            onChange={(e) => setForm({ ...form, location: e.target.value })}
            aria-invalid={field.location ? true : undefined}
            aria-describedby={field.location ? "location-hint location-error" : "location-hint"}
            className={input}
          />
          <p id="location-hint" className="text-sm text-neutral-700">
            Your area and a nearby landmark, so we can arrange delivery. Collecting from our shop? Write “Pickup”.
          </p>
          {field.location && (
            <p id="location-error" className="text-sm font-semibold text-red-700">
              {field.location}
            </p>
          )}
        </div>

        <div className="space-y-1">
          <label htmlFor="notes" className="block font-semibold">
            Note <span className="font-normal text-neutral-700">(optional)</span>
          </label>
          <textarea
            id="notes"
            name="notes"
            rows={3}
            maxLength={500}
            value={form.notes}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
            aria-invalid={field.notes ? true : undefined}
            aria-describedby={field.notes ? "notes-error" : undefined}
            className={input}
          />
          {field.notes && (
            <p id="notes-error" className="text-sm font-semibold text-red-700">
              {field.notes}
            </p>
          )}
        </div>

        {/* Spam trap: off-screen and hidden from screen readers, so only bots fill it in. */}
        <div aria-hidden="true" className="absolute -left-[9999px] h-px w-px overflow-hidden">
          <label htmlFor="website">Leave this empty</label>
          <input
            id="website"
            name="website"
            tabIndex={-1}
            autoComplete="off"
            value={form.website}
            onChange={(e) => setForm({ ...form, website: e.target.value })}
          />
        </div>

        {(errors || blocked) && (
          <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm font-semibold text-red-800">
            {errors?.fieldErrors?.items ??
              errors?.message ??
              "Some items can no longer be ordered. Remove them to continue."}
          </p>
        )}

        <button
          type="submit"
          disabled={pending || blocked}
          className="inline-flex min-h-12 w-full items-center justify-center rounded-lg bg-brand-orange-dark px-6 text-lg font-bold text-white hover:bg-brand-orange-deep disabled:cursor-not-allowed disabled:bg-neutral-300 disabled:text-neutral-700"
        >
          {pending ? "Saving your order…" : "Order on WhatsApp"}
        </button>
        <p className="text-sm text-neutral-700">
          We save your order, then open WhatsApp with the order message ready to send. Your name, number and location are used
          only for this order (<Link href="/privacy">privacy</Link>).
        </p>
      </form>
    </section>
  );
}
