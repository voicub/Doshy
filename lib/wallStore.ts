// Wall display store: the settings, kept on this device like the other display settings. Pure rules: lib/wall.ts, lib/rotation.ts.
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { cleanWall, WALL_DEFAULTS, type SlideKind, type WallSettings } from "./wall";

type WallState = WallSettings & {
  setOn: (on: boolean) => void;
  toggleKind: (kind: SlideKind) => void;
  setSecs: (secs: number) => void;
  setStartMin: (minutes: number) => void;
  setDim: (on: boolean) => void;
  setShift: (on: boolean) => void;
};

export const useWall = create<WallState>()(
  persist(
    (set) => ({
      ...WALL_DEFAULTS,
      setOn: (on) => set({ on }),
      // never down to nothing: the last slide stays (a wall display with no slides would be a blank screen)
      toggleKind: (kind) => set((s) => (s.kinds.includes(kind) ? (s.kinds.length > 1 ? { kinds: s.kinds.filter((k) => k !== kind) } : {}) : { kinds: cleanWall({ kinds: [...s.kinds, kind] }).kinds })),
      setSecs: (secs) => set({ secs: cleanWall({ secs }).secs }),
      setStartMin: (startMin) => set({ startMin: cleanWall({ startMin }).startMin }),
      setDim: (dim) => set({ dim }),
      setShift: (shift) => set({ shift }),
    }),
    {
      name: "housey-wall",
      version: 1,
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({ on: s.on, kinds: s.kinds, secs: s.secs, startMin: s.startMin, dim: s.dim, shift: s.shift }),
      merge: (stored, current) => ({ ...current, ...cleanWall(stored) }),
    },
  ),
);
