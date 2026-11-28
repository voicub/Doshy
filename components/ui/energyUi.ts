import { create } from "zustand";

type EnergyUi = {
  open: boolean;
  /** Set by `openSetup`, cleared by the panel once it has unfolded "Set up energy sources". */
  setup: boolean;
  set: (open: boolean) => void;
  toggle: () => void;
  /** Opens the panel with the energy sources section unfolded (palette: "Energy sources..."). */
  openSetup: () => void;
  clearSetup: () => void;
};

/** Whether the live Energy panel is open (the Dock button and the N key toggle it; the dashboard closes it on a mode change). */
export const useEnergyUi = create<EnergyUi>()((set) => ({
  open: false,
  setup: false,
  set: (open) => set({ open }),
  toggle: () => set((s) => ({ open: !s.open })),
  openSetup: () => set({ open: true, setup: true }),
  clearSetup: () => set({ setup: false }),
}));
