"use client";

import { create } from "zustand";

type MenuState = {
  open: boolean;
  setOpen: (open: boolean) => void;
};

/**
 * Whether the pop-up category menu is open. Shared because two buttons open
 * it (Menu in the header, Categories in the phone bottom bar).
 */
export const useMenu = create<MenuState>()((set) => ({
  open: false,
  setOpen: (open) => set({ open }),
}));

/** The id of the menu's <dialog>, for aria-controls. */
export const CATEGORY_MENU_ID = "category-menu";
