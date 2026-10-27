"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { ChatIcon, ChevronDownIcon, CloseIcon } from "@/components/ui/icons";
import type { CategoryNode } from "@/lib/categories";
import { CATEGORY_MENU_ID, useMenu } from "@/lib/menu-store";
import { useRecentIds, useWishlistIds } from "@/lib/saved-store";
import { CategoryIcon } from "./category-icon";

type Props = {
  categories: CategoryNode[];
  storeName: string;
  /** wa.me link to the shop's WhatsApp. */
  chatUrl: string;
};

const sectionHeading = "px-4 pb-1 text-xs font-bold uppercase tracking-[0.12em] text-ink-muted";

/**
 * The pop-up category menu: a panel sliding in from the left over a dimmed page.
 * A modal <dialog> gives Esc to close, keeps focus inside and makes the page
 * behind it inert; closing returns focus to the button that opened it.
 * The page can't scroll while it is open (see app/globals.css).
 */
export function CategoryMenu({ categories, storeName, chatUrl }: Props) {
  const open = useMenu((s) => s.open);
  const setOpen = useMenu((s) => s.setOpen);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const openerRef = useRef<HTMLElement | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const pathname = usePathname();
  const idPrefix = useId();
  const wishlistCount = useWishlistIds().length;
  const hasRecent = useRecentIds().length > 0;

  // Keep the <dialog> in step with the shared open state.
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      openerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      dialog.showModal();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  // Close after navigating (the layout, and so the menu, stays mounted).
  useEffect(() => {
    setOpen(false);
  }, [pathname, setOpen]);

  function handleClose() {
    setOpen(false);
    setExpandedId(null);
    // Browsers should do this themselves, but not all do yet.
    openerRef.current?.focus();
    openerRef.current = null;
  }

  return (
    <dialog
      ref={dialogRef}
      id={CATEGORY_MENU_ID}
      aria-label="Category menu"
      onClose={handleClose}
      onClick={(event) => {
        // A click on the dialog itself (not its panel) is a click on the dimmed backdrop.
        // Following a link closes the menu too, even when it leads to the page already open.
        const target = event.target as HTMLElement;
        if (target === event.currentTarget || target.closest("a")) setOpen(false);
      }}
      className="category-menu fixed inset-y-0 left-0 right-auto m-0 h-dvh max-h-none w-[min(380px,92vw)] max-w-none overflow-hidden border-0 bg-transparent p-0 text-ink backdrop:bg-ink/45 md:w-[380px]"
    >
      <div className="flex h-full flex-col overflow-y-auto overscroll-contain bg-white shadow-[0_24px_48px_rgba(17,17,17,0.18)]">
        <div className="flex items-center justify-between gap-3 bg-brand-green py-2.5 pl-4 pr-2 text-white md:py-3.5 md:pl-5 md:pr-3">
          <span className="flex items-center gap-2 md:gap-2.5">
            <Image
              src="/brand/logo.webp"
              alt=""
              width={36}
              height={36}
              unoptimized
              className="h-8 w-8 rounded-full bg-white md:h-9 md:w-9"
            />
            <span className="font-display text-[23px] leading-none md:text-[26px]">{storeName}</span>
          </span>
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Close menu"
            className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-white/12 text-white hover:bg-white/20"
          >
            <CloseIcon className="h-5 w-5" />
          </button>
        </div>

        <div className="grid grid-cols-2 gap-2 px-3 pb-1 pt-3.5 md:px-4 md:pt-4">
          <Link
            href="/deals"
            className="flex min-h-12 items-center gap-2 rounded-lg bg-tint-orange px-3 text-sm font-bold text-brand-orange-dark no-underline hover:text-brand-orange-deep md:px-3.5"
          >
            <CategoryIcon slug="deals" strokeWidth={1.75} className="h-[18px] w-[18px]" />
            Deals
          </Link>
          <Link
            href="/products"
            className="flex min-h-12 items-center gap-2 rounded-lg bg-tint-green px-3 text-sm font-bold text-brand-green no-underline hover:text-brand-green-dark md:px-3.5"
          >
            <CategoryIcon slug="new-arrivals" strokeWidth={1.75} className="h-[18px] w-[18px]" />
            New arrivals
          </Link>
        </div>

        <nav aria-labelledby={`${idPrefix}-shop`} className="pt-4">
          <h2 id={`${idPrefix}-shop`} className={sectionHeading}>
            Shop by category
          </h2>
          <ul className="px-1 md:px-2">
            {categories.map((category) => {
              const expanded = expandedId === category.id;
              const panelId = `${idPrefix}-${category.id}`;
              const icon = (
                <span className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-full bg-tint-green text-brand-green md:h-9 md:w-9">
                  <CategoryIcon slug={category.slug} className="h-[18px] w-[18px] md:h-5 md:w-5" />
                </span>
              );
              const rowClass =
                "flex min-h-[50px] w-full items-center gap-3 px-3 text-left text-[15px] font-semibold text-ink no-underline hover:bg-tint-green/60 md:min-h-[52px] md:gap-3.5";

              return (
                <li key={category.id} className="border-b border-line-soft">
                  {category.children.length === 0 ? (
                    // Nothing to expand: go straight to the category.
                    <Link href={`/categories/${category.slug}`} className={`${rowClass} hover:text-ink`}>
                      {icon}
                      <span className="flex-1">{category.name}</span>
                    </Link>
                  ) : (
                    <>
                      <button
                        type="button"
                        aria-expanded={expanded}
                        aria-controls={panelId}
                        onClick={() => setExpandedId(expanded ? null : category.id)}
                        className={`${rowClass} cursor-pointer`}
                      >
                        {icon}
                        <span className="flex-1">{category.name}</span>
                        <ChevronDownIcon
                          className={`h-[18px] w-[18px] shrink-0 motion-safe:transition-transform ${expanded ? "rotate-180" : ""}`}
                        />
                      </button>
                      <ul id={panelId} hidden={!expanded} className="pb-2.5 pl-[58px] pr-3 md:pb-3 md:pl-[62px]">
                        {category.children.map((child) => (
                          <li key={child.id}>
                            <Link
                              href={`/categories/${child.slug}`}
                              className="flex min-h-11 items-center text-sm text-[#3f3a34] no-underline hover:text-brand-green hover:underline"
                            >
                              {child.name}
                            </Link>
                          </li>
                        ))}
                        <li>
                          <Link
                            href={`/categories/${category.slug}`}
                            className="flex min-h-11 items-center text-sm font-bold no-underline hover:underline"
                          >
                            See all in {category.name}
                          </Link>
                        </li>
                      </ul>
                    </>
                  )}
                </li>
              );
            })}
          </ul>
        </nav>

        <nav aria-labelledby={`${idPrefix}-help`} className="pt-5">
          <h2 id={`${idPrefix}-help`} className={sectionHeading}>
            Help and your things
          </h2>
          <ul className="px-4 md:px-5">
            <li>
              <Link href="/how-to-order" className="flex min-h-11 items-center text-[15px] text-ink no-underline hover:underline">
                How ordering works
              </Link>
            </li>
            <li>
              <Link
                href="/wishlist"
                className="flex min-h-11 items-center justify-between gap-3 text-[15px] text-ink no-underline hover:underline"
              >
                Your wishlist
                {wishlistCount > 0 && <span className="text-[13px] text-ink-muted">{wishlistCount} saved</span>}
              </Link>
            </li>
            {hasRecent && (
              <li>
                <Link href="/#recently-viewed" className="flex min-h-11 items-center text-[15px] text-ink no-underline hover:underline">
                  Recently viewed
                </Link>
              </li>
            )}
            <li>
              <Link href="/about" className="flex min-h-11 items-center text-[15px] text-ink no-underline hover:underline">
                About and contact
              </Link>
            </li>
          </ul>
        </nav>

        <div className="mt-auto px-3 pb-5 pt-3.5 md:px-4 md:pb-6 md:pt-4">
          <a
            href={chatUrl}
            className="flex min-h-[52px] items-center justify-center gap-2.5 rounded-lg bg-brand-orange-dark px-4 text-[15px] font-bold text-white no-underline hover:bg-brand-orange-deep hover:text-white"
          >
            <ChatIcon className="h-[18px] w-[18px]" />
            Message us on WhatsApp
          </a>
        </div>
      </div>
    </dialog>
  );
}
