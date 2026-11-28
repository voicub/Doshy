import { create } from "zustand";

/**
 * "Show me this one": lists (room device sheet, item list in the inspector) point at an item and the 3D scene answers.
 * `hover` = a row is under the pointer / focused (a steady marker), `pulse` = a one-off ping, `frame` = ease the camera to it.
 * `n` re-triggers the same id. The 3D side lives in ItemPulse.tsx (marker) and Rig.tsx (camera); nothing here touches the plan.
 */
type ItemFocus = {
  hover: string | null;
  pulse: { id: string; n: number; type?: "item" | "opening" | "room" } | null;
  frame: { id: string; n: number } | null;
  setHover: (id: string | null) => void;
  pulseItem: (id: string) => void;
  frameItem: (id: string) => void;
  pulseTarget: (id: string, type: "opening" | "room") => void;
};

export const useItemFocus = create<ItemFocus>((set) => ({
  hover: null,
  pulse: null,
  frame: null,
  setHover: (hover) => set({ hover }),
  pulseItem: (id) => set((s) => ({ pulse: { id, n: (s.pulse?.n ?? 0) + 1 } })),
  frameItem: (id) => set((s) => ({ frame: { id, n: (s.frame?.n ?? 0) + 1 }, pulse: { id, n: (s.pulse?.n ?? 0) + 1 } })),
  pulseTarget: (id, type) => set((s) => ({ pulse: { id, type, n: (s.pulse?.n ?? 0) + 1 } })),
}));
