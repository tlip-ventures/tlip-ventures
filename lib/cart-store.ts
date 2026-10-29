"use client";

import { useSyncExternalStore } from "react";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import type { PlacedOrder } from "@/app/(shop)/cart/actions";
import {
  addLine,
  cartCount,
  markProblems,
  refreshLines,
  removeLine,
  setLineQty,
  type CartLine,
  type CurrentVariant,
  type LineProblem,
  type NewCartLine,
} from "@/lib/cart";
import { safeStorage } from "@/lib/safe-storage";

const STORAGE_KEY = "tlip-cart";

type CartState = {
  lines: CartLine[];
  /** The order just placed, for the "send on WhatsApp" page. Stays on this device only. */
  lastOrder: (PlacedOrder & { autoOpened: boolean }) | null;
  add: (line: NewCartLine, qty?: number) => void;
  setQty: (variantId: string, qty: number) => void;
  remove: (variantId: string) => void;
  refresh: (current: CurrentVariant[]) => void;
  markProblems: (problems: Record<string, LineProblem>) => void;
  orderPlaced: (order: PlacedOrder) => void;
  markAutoOpened: () => void;
};

/** The cart, saved in localStorage so it survives reloads and closing the tab. */
export const useCart = create<CartState>()(
  persist(
    (set) => ({
      lines: [],
      lastOrder: null,
      add: (line, qty) => set((s) => ({ lines: addLine(s.lines, line, qty) })),
      setQty: (variantId, qty) => set((s) => ({ lines: setLineQty(s.lines, variantId, qty) })),
      remove: (variantId) => set((s) => ({ lines: removeLine(s.lines, variantId) })),
      refresh: (current) => set((s) => ({ lines: refreshLines(s.lines, current) })),
      markProblems: (problems) => set((s) => ({ lines: markProblems(s.lines, problems) })),
      orderPlaced: (order) => set({ lines: [], lastOrder: { ...order, autoOpened: false } }),
      markAutoOpened: () => set((s) => (s.lastOrder ? { lastOrder: { ...s.lastOrder, autoOpened: true } } : s)),
    }),
    {
      name: STORAGE_KEY,
      version: 1,
      storage: createJSONStorage(() => safeStorage),
      partialize: (s) => ({ lines: s.lines, lastOrder: s.lastOrder }),
    },
  ),
);

// Keep tabs in step: adding in one tab updates the badge in another.
if (typeof window !== "undefined") {
  window.addEventListener("storage", (event) => {
    if (event.key === STORAGE_KEY) void useCart.persist.rehydrate();
  });
}

const subscribeHydration = (onChange: () => void) => useCart.persist.onFinishHydration(onChange);

/**
 * False during server rendering and hydration, true once the saved cart is
 * loaded. Render cart contents only when true, so the HTML matches.
 */
export function useCartHydrated(): boolean {
  return useSyncExternalStore(subscribeHydration, () => useCart.persist.hasHydrated(), () => false);
}

/** Number of items for cart badges: 0 until the saved cart has loaded, so the HTML matches. */
export function useCartBadgeCount(): number {
  const hydrated = useCartHydrated();
  const count = useCart((s) => cartCount(s.lines));
  return hydrated ? count : 0;
}
