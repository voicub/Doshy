import { create } from "zustand";

/** Compact layout: the menu sheet (top strip "menu" button and the dock's "More"), the "house now" card (the strip's numbers, opened) and the plan switcher sheet (the strip's plan chip). */
export const useChromeUi = create<{ menu: boolean; house: boolean; plans: boolean; setMenu: (on: boolean) => void; setHouse: (on: boolean) => void; setPlans: (on: boolean) => void }>((set) => ({
  menu: false,
  house: false,
  plans: false,
  setMenu: (menu) => set({ menu }),
  setHouse: (house) => set({ house }),
  setPlans: (plans) => set({ plans }),
}));
