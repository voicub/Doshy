import { create } from "zustand";
import type { Step } from "@/lib/qualityGovernor";

/** Set by the automatic governor when it lowered the tier (or turned the God rays off); the notice shows it once, until dismissed or opened. */
export const useGraphicsNotice = create<{ lowered: Step | null; show: (step: Step) => void; clear: () => void }>()((set) => ({
  lowered: null,
  show: (lowered) => set({ lowered }),
  clear: () => set({ lowered: null }),
}));
