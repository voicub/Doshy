import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { dbStorage } from "./dbClient";
import { DEFAULT_BRUSH, parseHex, pushRecent, type Brush } from "./materials";

type PaintState = {
  /** What the paint bucket lays down. Not saved: a new session starts with the default sage. */
  brush: Brush;
  setBrush: (p: Partial<Brush>) => void;
  /** Colours picked or used lately, newest first. Saved. */
  recent: string[];
  remember: (hex: string | null) => void;
};

const storage = dbStorage("housey-paint", "settings", 0);

export const usePaint = create<PaintState>()(
  persist(
    (set) => ({
      brush: DEFAULT_BRUSH,
      setBrush: (p) => set((s) => ({ brush: { ...s.brush, ...p } })),
      recent: [],
      // a drag repeats the same colour: leave the list (and its storage write) alone when it is already first
      remember: (hex) => set((s) => (!hex || s.recent[0] === parseHex(hex) ? s : { recent: pushRecent(s.recent, hex) })),
    }),
    { name: "housey-paint", storage: createJSONStorage(() => storage), partialize: (s) => ({ recent: s.recent }) },
  ),
);
storage.bind(() => void usePaint.persist.rehydrate());
