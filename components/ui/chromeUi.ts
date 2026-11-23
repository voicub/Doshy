import { create } from "zustand";

/** Compact layout: the menu sheet (top strip "menu" button and the dock's "More") and the "house now" card (the strip's numbers, opened). */
export const useChromeUi = create<{ menu: boolean; house: boolean; setMenu: (on: boolean) => void; setHouse: (on: boolean) => void }>((set) => ({
  menu: false,
  house: false,
  setMenu: (menu) => set({ menu }),
  setHouse: (house) => set({ house }),
}));
