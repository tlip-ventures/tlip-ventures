"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { CATEGORY_MENU_ID, useMenu } from "@/lib/menu-store";

type Props = {
  className: string;
  children: ReactNode;
  /** Accessible name when the visible text is hidden on some screens. */
  "aria-label"?: string;
};

/**
 * Opens the pop-up category menu. It is a link to /categories, so it still
 * works before JavaScript loads (or without it); once loaded it opens the menu instead.
 */
export function MenuTrigger({ className, children, "aria-label": ariaLabel }: Props) {
  const open = useMenu((s) => s.open);
  const setOpen = useMenu((s) => s.setOpen);

  return (
    <Link
      href="/categories"
      aria-label={ariaLabel}
      aria-haspopup="dialog"
      aria-expanded={open}
      aria-controls={CATEGORY_MENU_ID}
      // It opens the menu rather than loading a page, so no loading bar (components/ui/navigation-progress.tsx).
      data-no-progress=""
      onClick={(event) => {
        // Let Ctrl/Cmd-click and middle-click open /categories in a new tab.
        if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
        event.preventDefault();
        setOpen(true);
      }}
      className={className}
    >
      {children}
    </Link>
  );
}
