"use client";

import { useSyncExternalStore } from "react";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { safeStorage } from "@/lib/safe-storage";
import { addToBasket, setBasketQty, type BasketLine, type CustomerChoice, type NewBasketLine, type PaymentChoice } from "./basket";

const STORAGE_KEY = "tlip-pos-basket";

/** "exact", the two round-up buttons, or an amount typed in. */
export type CashChoice = "exact" | "r50" | "r100" | "other";

type BasketState = {
  lines: BasketLine[];
  customer: CustomerChoice | null;
  method: PaymentChoice;
  cash: CashChoice;
  /** Cedis as typed, for "other". */
  cashOther: string;
  /** Pesewas. */
  discount: number;
  add: (item: NewBasketLine) => void;
  setQty: (variantId: string, qty: number) => void;
  setCustomer: (customer: CustomerChoice | null) => void;
  setMethod: (method: PaymentChoice) => void;
  setCash: (cash: CashChoice, other?: string) => void;
  setDiscount: (discount: number) => void;
  clear: () => void;
};

const EMPTY = { lines: [], customer: null, method: "cash", cash: "exact", cashOther: "", discount: 0 } as const;

/**
 * The till's current sale, kept on this device so a refresh or a dropped
 * connection doesn't lose a half-rung sale. Each device has its own basket.
 */
export const useBasket = create<BasketState>()(
  persist(
    (set) => ({
      ...EMPTY,
      lines: [],
      add: (item) => set((s) => ({ lines: addToBasket(s.lines, item) })),
      setQty: (variantId, qty) => set((s) => ({ lines: setBasketQty(s.lines, variantId, qty) })),
      setCustomer: (customer) => set({ customer }),
      setMethod: (method) => set({ method }),
      setCash: (cash, other) => set((s) => ({ cash, cashOther: other ?? s.cashOther })),
      setDiscount: (discount) => set({ discount }),
      clear: () => set({ ...EMPTY, lines: [] }),
    }),
    {
      name: STORAGE_KEY,
      version: 1,
      storage: createJSONStorage(() => safeStorage),
      partialize: (s) => ({
        lines: s.lines,
        customer: s.customer,
        method: s.method,
        cash: s.cash,
        cashOther: s.cashOther,
        discount: s.discount,
      }),
    },
  ),
);

const subscribeHydration = (onChange: () => void) => useBasket.persist.onFinishHydration(onChange);

/** False until the saved basket has loaded, so server and browser HTML match. */
export function useBasketHydrated(): boolean {
  return useSyncExternalStore(subscribeHydration, () => useBasket.persist.hasHydrated(), () => false);
}
