"use client";

import Link from "next/link";
import { HeartIcon } from "@/components/ui/icons";
import { useWishlistIds } from "@/lib/saved-store";

/** Header link to the wishlist with the number saved (from 768px; phones use the bottom bar). */
export function WishlistLink() {
  const count = useWishlistIds().length;
  return (
    <Link
      href="/wishlist"
      aria-label={count > 0 ? `Wishlist, ${count} saved` : "Wishlist"}
      className="hidden min-h-11 items-center gap-2 rounded-lg px-3 text-sm font-semibold text-white no-underline hover:bg-white/10 hover:text-white md:inline-flex"
    >
      <HeartIcon className="h-[22px] w-[22px]" />
      <span className="hidden xl:inline">Wishlist</span>
      {count > 0 && (
        <span
          aria-hidden="true"
          className="flex h-5 min-w-5 items-center justify-center rounded-full bg-white px-1 text-xs font-bold tabular-nums text-brand-green"
        >
          {count > 99 ? "99+" : count}
        </span>
      )}
    </Link>
  );
}
