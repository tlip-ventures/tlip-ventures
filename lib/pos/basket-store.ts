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
  /** The invoice being sold, and what changed since it was written. */
  invoice: TillInvoice | null;
  add: (item: NewBasketLine) => void;
  /** By line key (item and colour, see basketLineKey). */
  setQty: (key: string, qty: number) => void;
  setCustomer: (customer: CustomerChoice | null) => void;
  setMethod: (method: PaymentChoice) => void;
  setCash: (cash: CashChoice, other?: string) => void;
  setDiscount: (discount: number) => void;
  setFulfilment: (fulfilment: Fulfilment) => void;
  setDelivery: (changes: Partial<DeliveryDraft>) => void;
  /** Replaces the basket with an invoice to sell. */
  loadInvoice: (data: LoadedInvoice) => void;
  /** Keeps the basket but stops linking it to the invoice. */
  dropInvoice: () => void;
  clear: () => void;
};

export type TillInvoice = { id: string; code: string; warnings: string[] };

export type LoadedInvoice = {
  invoice: TillInvoice;
  lines: BasketLine[];
  customer: CustomerChoice | null;
  discount: number;
  delivery: DeliveryDraft | null;
};

export type DeliveryDraft = { address: string; phone: string; fee: string; note: string };

const NO_DELIVERY: DeliveryDraft = { address: "", phone: "", fee: "", note: "" };

const EMPTY = { lines: [], customer: null, method: "cash", cash: "exact", cashOther: "", discount: 0, fulfilment: "collect", invoice: null } as const;

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
      setQty: (key, qty) => set((s) => ({ lines: setBasketQty(s.lines, key, qty) })),
      setCustomer: (customer) => set({ customer }),
      setMethod: (method) => set({ method }),
      setCash: (cash, other) => set((s) => ({ cash, cashOther: other ?? s.cashOther })),
      setDiscount: (discount) => set({ discount }),
      setFulfilment: (fulfilment) => set({ fulfilment }),
      setDelivery: (changes) => set((s) => ({ delivery: { ...s.delivery, ...changes } })),
      loadInvoice: (data) =>
        set({
          ...EMPTY,
          lines: data.lines,
          customer: data.customer,
          discount: data.discount,
          fulfilment: data.delivery ? "delivery" : "collect",
          delivery: data.delivery ?? NO_DELIVERY,
          invoice: data.invoice,
        }),
      dropInvoice: () => set({ invoice: null }),
      clear: () => set({ ...EMPTY, lines: [], delivery: NO_DELIVERY }),
    }),
    {
      name: STORAGE_KEY,
      // 2: one stock entry per product, colours picked per line. A basket saved
      // before then may name per-colour entries that can no longer be sold: start afresh.
      version: 2,
      migrate: () => ({ ...EMPTY, lines: [], delivery: NO_DELIVERY }),
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
        invoice: s.invoice,
      }),
    },
  ),
);

const subscribeHydration = (onChange: () => void) => useBasket.persist.onFinishHydration(onChange);

/** False until the saved basket has loaded, so server and browser HTML match. */
export function useBasketHydrated(): boolean {
  return useSyncExternalStore(subscribeHydration, () => useBasket.persist.hasHydrated(), () => false);
}
