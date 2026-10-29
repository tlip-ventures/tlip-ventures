"use client";

import Link from "next/link";
import { useEffect, useRef, type ReactNode } from "react";
import { useCart, useCartHydrated } from "@/lib/cart-store";
import { formatGhanaPhone } from "@/lib/phone";
import { CopyButton } from "./copy-button";

/**
 * After checkout: the order is already saved. Opens WhatsApp once on phones,
 * and always shows the number and a "Copy order" fallback (domain rule 6).
 */
export function OrderSentView({ reply }: { reply?: ReactNode }) {
  const hydrated = useCartHydrated();
  const order = useCart((s) => s.lastOrder);
  const markAutoOpened = useCart((s) => s.markAutoOpened);

  // Guards against the effect running twice before the store update lands (React Strict Mode).
  const opened = useRef(false);

  useEffect(() => {
    if (!order || order.autoOpened || opened.current) return;
    opened.current = true;
    markAutoOpened();
    // Phones have the WhatsApp app; on a computer wa.me only opens a web page, so let people choose.
    if (window.matchMedia("(pointer: coarse)").matches) {
      window.location.href = order.whatsappUrl;
    }
  }, [order, markAutoOpened]);

  if (!hydrated) {
    return <div className="h-64 animate-pulse rounded-lg bg-neutral-100" aria-hidden="true" />;
  }

  if (!order) {
    return (
      <div className="space-y-4 text-center">
        <h1 className="text-3xl font-bold text-brand-green">No recent order</h1>
        <p>There is no order waiting to be sent from this device.</p>
        <Link href="/products" className="inline-flex min-h-11 items-center font-semibold">
          Browse products
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <p className="text-sm font-semibold uppercase tracking-wide text-brand-green">Order {order.orderCode} saved</p>
        <h1 className="text-3xl font-bold text-brand-green">Now send it on WhatsApp</h1>
        <p className="leading-relaxed">
          Your order is not complete until you send the message. We will reply to confirm availability, agree
          delivery and its fee, and share how to pay.
        </p>
      </div>

      <a
        href={order.whatsappUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-lg bg-brand-orange-dark px-6 text-lg font-bold text-white no-underline hover:bg-brand-orange-deep sm:w-auto"
      >
        <svg viewBox="0 0 24 24" className="h-6 w-6" fill="currentColor" aria-hidden="true">
          <path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2Zm0 18.2a8.2 8.2 0 0 1-4.2-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2Zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8-.2-.1-.4-.1-.6.1l-.8 1c-.1.2-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.2-.4.3-.4.8-1.3.1-.2 0-.3 0-.4l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3 3 3 0 0 0-.9 2.2 5.2 5.2 0 0 0 1.1 2.7 11.8 11.8 0 0 0 4.5 4c1.7.7 2.3.8 3.2.6.5-.1 1.5-.6 1.7-1.2.2-.6.2-1.1.2-1.2-.1-.1-.3-.2-.6-.3Z" />
        </svg>
        Order on WhatsApp
      </a>

      {reply}

      <section aria-labelledby="fallback-heading" className="space-y-3 rounded-lg border border-neutral-200 p-4">
        <h2 id="fallback-heading" className="text-lg font-bold text-brand-green">
          WhatsApp not opening?
        </h2>
        <p>
          Copy the order and send it to us on WhatsApp at{" "}
          <strong className="whitespace-nowrap">{formatGhanaPhone(order.whatsappNumber)}</strong>.
        </p>
        <CopyButton text={order.message} label="Copy order" />
        <label htmlFor="order-message" className="sr-only">
          Order message
        </label>
        <textarea
          id="order-message"
          readOnly
          value={order.message}
          // Lines wrap on phones, so allow extra rows; field-sizing fits the text where supported.
          rows={Math.min(20, order.message.split("\n").length * 2)}
          className="field-sizing-content w-full rounded-lg border border-neutral-300 bg-neutral-50 p-3 font-mono text-sm text-ink"
          onFocus={(e) => e.currentTarget.select()}
        />
      </section>

      <p className="flex flex-wrap gap-x-6">
        <a href={order.orderUrl} className="inline-flex min-h-11 items-center font-semibold">
          View your order page
        </a>
        <Link href="/products" className="inline-flex min-h-11 items-center font-semibold">
          Continue shopping
        </Link>
      </p>
    </div>
  );
}
