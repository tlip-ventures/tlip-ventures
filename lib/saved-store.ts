"use client";

import { useSyncExternalStore } from "react";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { safeStorage } from "@/lib/safe-storage";
import { cleanIds, MAX_RECENT, MAX_WISHLIST, recordId, toggleId } from "@/lib/saved-ids";

// The wishlist and recently viewed products, saved in localStorage on this
// device only (there are no customer accounts). Product ids only: names and
// prices are always read fresh from the shop (/api/products).

type WishlistState = { ids: string[]; toggle: (id: string) => void };
type RecentState = { ids: string[]; record: (id: string) => void; clear: () => void };

const WISHLIST_KEY = "tlip-wishlist";
const RECENT_KEY = "tlip-recent";

export const useWishlist = create<WishlistState>()(
  persist((set) => ({ ids: [], toggle: (id) => set((s) => ({ ids: toggleId(s.ids, id) })) }), {
    name: WISHLIST_KEY,
    version: 1,
    storage: createJSONStorage(() => safeStorage),
    partialize: (s) => ({ ids: s.ids }),
    // Whatever is in storage (maybe edited by hand) is checked before use.
    merge: (persisted, current) => ({ ...current, ids: cleanIds((persisted as { ids?: unknown } | null)?.ids, MAX_WISHLIST) }),
  }),
);

export const useRecentlyViewed = create<RecentState>()(
  persist(
    (set) => ({
      ids: [],
      record: (id) => set((s) => ({ ids: recordId(s.ids, id) })),
      clear: () => set({ ids: [] }),
    }),
    {
      name: RECENT_KEY,
      version: 1,
      storage: createJSONStorage(() => safeStorage),
      partialize: (s) => ({ ids: s.ids }),
      merge: (persisted, current) => ({ ...current, ids: cleanIds((persisted as { ids?: unknown } | null)?.ids, MAX_RECENT) }),
    },
  ),
);

// Keep tabs in step, like the cart.
if (typeof window !== "undefined") {
  window.addEventListener("storage", (event) => {
    if (event.key === WISHLIST_KEY) void useWishlist.persist.rehydrate();
    if (event.key === RECENT_KEY) void useRecentlyViewed.persist.rehydrate();
  });
}

const EMPTY: string[] = [];
const subscribeWishlist = (onChange: () => void) => useWishlist.persist.onFinishHydration(onChange);
const subscribeRecent = (onChange: () => void) => useRecentlyViewed.persist.onFinishHydration(onChange);

/** False during server rendering and hydration, true once the saved list is loaded. */
export function useWishlistHydrated(): boolean {
  return useSyncExternalStore(subscribeWishlist, () => useWishlist.persist.hasHydrated(), () => false);
}

export function useRecentHydrated(): boolean {
  return useSyncExternalStore(subscribeRecent, () => useRecentlyViewed.persist.hasHydrated(), () => false);
}

/**
 * The saved ids once loaded from storage; an empty list during server
 * rendering and hydration, so the HTML matches.
 */
export function useWishlistIds(): string[] {
  const hydrated = useWishlistHydrated();
  const ids = useWishlist((s) => s.ids);
  return hydrated ? ids : EMPTY;
}

export function useRecentIds(): string[] {
  const hydrated = useRecentHydrated();
  const ids = useRecentlyViewed((s) => s.ids);
  return hydrated ? ids : EMPTY;
}
