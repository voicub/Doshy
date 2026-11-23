import { create } from "zustand";

/** Whether the live Energy panel is open (the Dock button and the N key toggle it; the dashboard closes it on a mode change). */
export const useEnergyUi = create<{ open: boolean; set: (open: boolean) => void; toggle: () => void }>()((set) => ({
  open: false,
  set: (open) => set({ open }),
  toggle: () => set((s) => ({ open: !s.open })),
}));
