"use client";

import Link from "next/link";
import { BagIcon } from "@/components/ui/icons";
import { cartCount } from "@/lib/cart";
import { useCart, useCartHydrated } from "@/lib/cart-store";

/**
 * Header cart button with the number of items: an icon with a badge on phones,
 * a labelled button from 768px. The count appears once the saved cart has loaded.
 */
export function CartLink() {
  const hydrated = useCartHydrated();
  const count = useCart((s) => cartCount(s.lines));
  const shown = hydrated ? count : 0;
  const badge = shown > 99 ? "99+" : String(shown);

  return (
    <Link
      href="/cart"
      aria-label={shown > 0 ? `Cart, ${shown} ${shown === 1 ? "item" : "items"}` : "Cart"}
      className="relative inline-flex min-h-11 min-w-11 items-center justify-center gap-2 rounded-lg font-semibold text-white no-underline hover:bg-white/10 hover:text-white md:bg-brand-green-dark md:px-4 md:text-sm md:hover:bg-ink"
    >
      <BagIcon className="h-[22px] w-[22px]" />
      <span className="hidden md:inline">Cart</span>
      {shown > 0 && (
        <span
          aria-hidden="true"
          className="absolute right-0.5 top-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-brand-orange px-1 text-[11px] font-bold tabular-nums text-ink md:static md:h-5 md:min-w-5 md:text-xs"
        >
          {badge}
        </span>
      )}
    </Link>
  );
}
