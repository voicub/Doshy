import { create } from "zustand";
import type { Tier } from "@/lib/quality";

/** Set by the automatic governor when it lowered the tier; the notice shows it once, until dismissed or opened. */
export const useGraphicsNotice = create<{ lowered: Tier | null; show: (tier: Tier) => void; clear: () => void }>()((set) => ({
  lowered: null,
  show: (lowered) => set({ lowered }),
  clear: () => set({ lowered: null }),
}));
