"use client";

import { useSyncExternalStore } from "react";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { safeStorage } from "@/lib/safe-storage";
import { addToBasket, setBasketQty, type BasketLine, type CustomerChoice, type Fulfilment, type NewBasketLine, type PaymentChoice } from "./basket";

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
  fulfilment: Fulfilment;
  /** Delivery: where to, a phone for the rider and the fee in cedis as typed. */
  delivery: DeliveryDraft;
  add: (item: NewBasketLine) => void;
  setQty: (variantId: string, qty: number) => void;
  setCustomer: (customer: CustomerChoice | null) => void;
  setMethod: (method: PaymentChoice) => void;
  setCash: (cash: CashChoice, other?: string) => void;
  setDiscount: (discount: number) => void;
  setFulfilment: (fulfilment: Fulfilment) => void;
  setDelivery: (changes: Partial<DeliveryDraft>) => void;
  clear: () => void;
};

export type DeliveryDraft = { address: string; phone: string; fee: string; note: string };

const NO_DELIVERY: DeliveryDraft = { address: "", phone: "", fee: "", note: "" };

const EMPTY = { lines: [], customer: null, method: "cash", cash: "exact", cashOther: "", discount: 0, fulfilment: "collect" } as const;

/**
 * The till's current sale, kept on this device so a refresh or a dropped
 * connection doesn't lose a half-rung sale. Each device has its own basket.
 */
export const useBasket = create<BasketState>()(
  persist(
    (set) => ({
      ...EMPTY,
      lines: [],
      delivery: NO_DELIVERY,
      add: (item) => set((s) => ({ lines: addToBasket(s.lines, item) })),
      setQty: (variantId, qty) => set((s) => ({ lines: setBasketQty(s.lines, variantId, qty) })),
      setCustomer: (customer) => set({ customer }),
      setMethod: (method) => set({ method }),
      setCash: (cash, other) => set((s) => ({ cash, cashOther: other ?? s.cashOther })),
      setDiscount: (discount) => set({ discount }),
      setFulfilment: (fulfilment) => set({ fulfilment }),
      setDelivery: (changes) => set((s) => ({ delivery: { ...s.delivery, ...changes } })),
      clear: () => set({ ...EMPTY, lines: [], delivery: NO_DELIVERY }),
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
        fulfilment: s.fulfilment,
        delivery: s.delivery,
      }),
    },
  ),
);

const subscribeHydration = (onChange: () => void) => useBasket.persist.onFinishHydration(onChange);

/** False until the saved basket has loaded, so server and browser HTML match. */
export function useBasketHydrated(): boolean {
  return useSyncExternalStore(subscribeHydration, () => useBasket.persist.hasHydrated(), () => false);
}
