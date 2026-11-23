import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { dbStorage } from "./dbClient";
import { isRecord } from "./guards.ts";

export const LIVE_LAYERS = ["off", "heat", "humidity", "presence", "power"] as const;
type LiveLayer = (typeof LIVE_LAYERS)[number];

type State = { layer: LiveLayer; setLayer: (l: LiveLayer) => void; cycleLayer: () => void };

const storage = dbStorage("housey-live-layer", "settings", 0);

/** Which live statistic Scene3D paints over the rooms (off = none). */
export const useLiveLayer = create<State>()(
  persist(
    (set, get) => ({
      layer: "off",
      setLayer: (layer) => set({ layer }),
      cycleLayer: () => set({ layer: LIVE_LAYERS[(LIVE_LAYERS.indexOf(get().layer) + 1) % LIVE_LAYERS.length] }),
    }),
    {
      name: "housey-live-layer",
      storage: createJSONStorage(() => storage),
      partialize: (s) => ({ layer: s.layer }),
      // a stale or hand-edited value must not leave the scene on an unknown layer
      merge: (persisted, current) => {
        const l = isRecord(persisted) ? persisted.layer : undefined;
        return { ...current, layer: LIVE_LAYERS.find((x) => x === l) ?? "off" };
      },
    },
  ),
);
storage.bind(() => void useLiveLayer.persist.rehydrate());
