"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import { create } from "zustand";

/** How long the popup stays, unless the customer is touching or tabbing through it. */
const TOAST_MS = 6000;

type AddedState = {
  /** What was just added. `key` restarts the popup when the same item is added again. */
  added: { name: string; key: number } | null;
  show: (name: string) => void;
  hide: () => void;
};

/** Shows the "Added to your cart" popup. Used by the product page and product cards. */
export const useAddedToast = create<AddedState>()((set) => ({
  added: null,
  show: (name) => set((s) => ({ added: { name, key: (s.added?.key ?? 0) + 1 } })),
  hide: () => set({ added: null }),
}));

/**
 * "Added to your cart" popup fixed to the bottom of the screen, so it is seen
 * without scrolling. Mounted once in the shop layout.
 */
export function AddedToast() {
  const added = useAddedToast((s) => s.added);
  const hide = useAddedToast((s) => s.hide);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const pathname = usePathname();

  function hideLater() {
    clearTimeout(timer.current);
    timer.current = setTimeout(hide, TOAST_MS);
  }
  function keepOpen() {
    clearTimeout(timer.current);
  }

  // Start the timer each time something is added.
  useEffect(() => {
    if (!added) return;
    clearTimeout(timer.current);
    timer.current = setTimeout(hide, TOAST_MS);
    return () => clearTimeout(timer.current);
  }, [added, hide]);

  // Not needed once the customer moves on (the layout, and so the popup, stays mounted).
  useEffect(() => {
    hide();
  }, [pathname, hide]);

  return (
    // Always in the page so screen readers announce what appears in it.
    // On phones it sits just above the bottom bar (64px plus the safe area).
    <div
      role="status"
      className="pointer-events-none fixed inset-x-0 bottom-[calc(4rem+env(safe-area-inset-bottom))] z-50 px-4 pb-3 md:bottom-0 md:pb-[max(1rem,env(safe-area-inset-bottom))]"
    >
      {added && (
        <div
          key={added.key}
          onPointerEnter={keepOpen}
          onPointerLeave={hideLater}
          onFocus={keepOpen}
          onBlur={hideLater}
          className="pointer-events-auto mx-auto max-w-md space-y-3 rounded-lg bg-brand-green p-3 text-white shadow-lg motion-safe:animate-[toast-in_200ms_ease-out]"
        >
          <div className="flex items-start gap-3">
            <svg aria-hidden="true" viewBox="0 0 24 24" className="mt-0.5 h-6 w-6 shrink-0 fill-none stroke-brand-gold stroke-[3]">
              <path d="M5 12.5l4.5 4.5L19 7.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <p className="min-w-0 flex-1">
              <span className="block font-bold">Added to your cart</span>
              <span className="block text-sm">{added.name}</span>
            </p>
            <button
              type="button"
              onClick={hide}
              aria-label="Close"
              className="-m-1 inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-2xl leading-none text-white hover:bg-white/10"
            >
              ×
            </button>
          </div>
          <Link
            href="/cart"
            className="flex min-h-11 w-full items-center justify-center rounded-lg bg-white px-4 font-bold text-brand-green no-underline hover:bg-neutral-100"
          >
            View cart and order
          </Link>
        </div>
      )}
    </div>
  );
}
