import { create } from "zustand";

/** The pages of the Share dialog (`menu` is the list of them). Each page's component is registered in sharePages.tsx. */
export type SharePage = "menu" | "snapshot" | "video" | "pack" | "link";

type ShareUi = {
  /** null = the dialog is closed */
  page: SharePage | null;
  /** The plan the "link" page is about (a plan card's "Share a read-only link..."); null = the plan on screen. */
  planId: number | null;
  show: (page?: SharePage, planId?: number) => void;
  setPage: (page: SharePage) => void;
  close: () => void;
};

/** Whether the Share dialog is open and on which page (the Share dock button, the command palette, "My pieces" and a plan's menu open it). */
export const useShareUi = create<ShareUi>()((set) => ({
  page: null,
  planId: null,
  show: (page = "menu", planId) => set({ page, planId: planId ?? null }),
  setPage: (page) => set({ page }),
  close: () => set({ page: null, planId: null }),
}));
