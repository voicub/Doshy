"use client";
import { create } from "zustand";

type Tab = "new" | "list";

/** The automation sheet: open or not, which device it was opened from (the one the person pressed "Make it do something..." on), and the tab on show. */
export const useAutomationUi = create<{ open: boolean; entity: string | null; tab: Tab; show: (entity?: string) => void; setTab: (tab: Tab) => void; close: () => void }>((set) => ({
  open: false,
  entity: null,
  tab: "list",
  show: (entity) => set({ open: true, entity: entity ?? null, tab: entity ? "new" : "list" }),
  setTab: (tab) => set({ tab }),
  close: () => set({ open: false, entity: null }),
}));
