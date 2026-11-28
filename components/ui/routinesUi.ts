"use client";
import { create } from "zustand";

/** Asking for the Routines panel from anywhere (the palette, the dock, the Scenes panel, the Automations sheet): `show()` bumps `n`, the left panel hook opens it. `open` mirrors whether it is on screen. */
export const useRoutinesUi = create<{ n: number; open: boolean; show: () => void }>((set) => ({ n: 0, open: false, show: () => set((s) => ({ n: s.n + 1 })) }));
