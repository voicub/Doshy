import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { dbStorage } from "./dbClient.ts";
import { isRecord } from "./guards.ts";
import { sanitizeHdri, type HdriSetting } from "./polyhavenEnv.ts";

/** What the 3D view is doing with the chosen picture (not saved): shown by the picker so a slow or failed load is explained. */
export type LightingStatus = { state: "idle" } | { state: "loading" } | { state: "ready" } | { state: "failed"; message: string };

type State = {
  /** The real sky chosen as the scene's light, or null for the built-in light. Saved on this device (`housey-lighting`). */
  hdri: HdriSetting | null;
  status: LightingStatus;
  setHdri: (h: HdriSetting | null) => void;
  /** Changes some fields; the result is scrubbed again (clamps), so a slider can never store a wrong number. */
  patchHdri: (p: Partial<HdriSetting>) => void;
  setStatus: (s: LightingStatus) => void;
};

const storage = dbStorage("housey-lighting", "settings", 0);

export const useLighting = create<State>()(
  persist(
    (set) => ({
      hdri: null,
      status: { state: "idle" },
      setHdri: (hdri) => set({ hdri: hdri && sanitizeHdri(hdri), status: { state: "idle" } }),
      patchHdri: (p) => set((s) => (s.hdri ? { hdri: sanitizeHdri({ ...s.hdri, ...p }) } : s)),
      setStatus: (status) => set({ status }),
    }),
    {
      name: "housey-lighting",
      storage: createJSONStorage(() => storage),
      partialize: (s) => ({ hdri: s.hdri }),
      // a stale or hand-edited value must not leave the scene with a broken sky
      merge: (persisted, current) => ({ ...current, hdri: isRecord(persisted) ? sanitizeHdri(persisted.hdri) : null }),
    },
  ),
);
storage.bind(() => void useLighting.persist.rehydrate());
