import { create } from "zustand";
import type { WallStyle } from "@/lib/types";

/** What the Wall tool draws next: plaster, or one of the garden fences (not persisted: a new session starts with plaster). */
export const useWallUi = create<{ style: WallStyle; setStyle: (style: WallStyle) => void }>((set) => ({ style: "plaster", setStyle: (style) => set({ style }) }));
