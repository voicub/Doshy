import { create } from "zustand";

/** Plan-mode map underlay controls that are about this session only: dragging the map to line it up, and how strongly the photo shows. */
const PHOTO_OPACITY_DEFAULT = 0.45;

type SiteAlign = {
  align: boolean;
  opacity: number;
  /** Compact screens: while the panel steps aside for "Line it up on the plan", this closes it for good (the on-canvas bar's Done). */
  leave: (() => void) | null;
  setAlign: (on: boolean) => void;
  setOpacity: (v: number) => void;
};

export const useSiteAlign = create<SiteAlign>()((set) => ({
  align: false,
  opacity: PHOTO_OPACITY_DEFAULT,
  leave: null,
  setAlign: (align) => set({ align }),
  setOpacity: (opacity) => set({ opacity: Math.min(0.9, Math.max(0.1, opacity)) }),
}));
