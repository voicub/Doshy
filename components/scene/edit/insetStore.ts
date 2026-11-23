import { create } from "zustand";
import { mergeInsets, NO_INSETS, type Box, type Insets } from "@/lib/viewInset";

/** The parts of the canvas that panels (sheets) cover on compact screens: each open panel reports its own, `ViewInset` keeps the scene in what is left. Not part of the plan, never saved. */
type InsetStore = {
  reports: Record<string, Insets>;
  /** The visible part of the canvas (px) while `ViewInset` is steering the picture; null otherwise. */
  free: Box | null;
  report: (id: string, i: Insets) => void;
  clear: (id: string) => void;
  setFree: (f: Box | null) => void;
};

export const useInsets = create<InsetStore>((set) => ({
  reports: {},
  free: null,
  report: (id, i) => set((s) => ({ reports: { ...s.reports, [id]: i } })),
  clear: (id) =>
    set((s) => {
      if (!(id in s.reports)) return s;
      const { [id]: _gone, ...rest } = s.reports;
      return { reports: rest };
    }),
  setFree: (free) => set({ free }),
}));

/** What the open panels cover together. */
export const panelInsets = (reports: Record<string, Insets>): Insets => mergeInsets(Object.values(reports).concat(NO_INSETS));
