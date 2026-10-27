"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BagIcon, ChatIcon, HeartIcon } from "@/components/ui/icons";
import { useCartBadgeCount } from "@/lib/cart-store";
import { useMenu } from "@/lib/menu-store";
import { CategoriesIcon } from "./category-icon";
import { MenuTrigger } from "./menu-trigger";

const itemClass =
  "relative flex flex-col items-center justify-center gap-[3px] text-[11px] font-semibold no-underline";

/**
 * App-style bar fixed to the bottom of the screen on phones (hidden from 768px).
 * The footer leaves room for it, so it never covers content.
 */
export function BottomBar({ chatUrl }: { chatUrl: string }) {
  const pathname = usePathname();
  const menuOpen = useMenu((s) => s.open);
  const count = useCartBadgeCount();

  const tone = (active: boolean) => (active ? "font-bold text-brand-green hover:text-brand-green" : "text-ink-soft hover:text-ink");

  return (
    <nav
      aria-label="Shortcuts"
      className="fixed inset-x-0 bottom-0 z-40 grid h-[calc(4rem+env(safe-area-inset-bottom))] grid-cols-5 border-t border-line bg-white pb-[env(safe-area-inset-bottom)] md:hidden"
    >
      <Link href="/" aria-current={pathname === "/" ? "page" : undefined} className={`${itemClass} ${tone(pathname === "/")}`}>
        <svg viewBox="0 0 24 24" className="h-[22px] w-[22px]" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M4 11 12 4l8 7v9H4z" />
          <path d="M10 20v-5h4v5" />
        </svg>
        Home
      </Link>

      <MenuTrigger className={`${itemClass} ${tone(menuOpen)}`}>
        <CategoriesIcon className="h-[22px] w-[22px]" />
        Categories
      </MenuTrigger>

      <Link
        href="/wishlist"
        aria-current={pathname === "/wishlist" ? "page" : undefined}
        className={`${itemClass} ${tone(pathname === "/wishlist")}`}
      >
        <HeartIcon className="h-[22px] w-[22px]" />
        Wishlist
      </Link>

      <Link
        href="/cart"
        aria-current={pathname === "/cart" ? "page" : undefined}
        aria-label={count > 0 ? `Cart, ${count} ${count === 1 ? "item" : "items"}` : "Cart"}
        className={`${itemClass} ${tone(pathname === "/cart")}`}
      >
        <BagIcon className="h-[22px] w-[22px]" />
        Cart
        {count > 0 && (
          <span
            aria-hidden="true"
            className="absolute left-[calc(50%+6px)] top-[7px] flex h-[17px] min-w-[17px] items-center justify-center rounded-full bg-brand-orange px-1 text-[10px] font-bold tabular-nums text-ink"
          >
            {count > 99 ? "99+" : count}
          </span>
        )}
      </Link>

      <a href={chatUrl} className={`${itemClass} font-bold text-brand-orange-dark hover:text-brand-orange-deep`}>
        <ChatIcon className="h-[22px] w-[22px]" />
        WhatsApp
      </a>
    </nav>
  );
}
