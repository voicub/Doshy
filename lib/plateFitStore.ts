import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { dbStorage } from "./dbClient";
import { isRecord } from "./guards";
import { cleanFitMap, type PlateFits } from "./plateFit";

/**
 * Where the number plate goes on every car of a model ("Remember for this model"): model key -> fits (lib/plateFit.ts). A car's own placement wins over it.
 * Tiny by construction (cleanFitMap keeps at most 64 models of at most two short fits), well under the 256 KB a setting may take, and re-checked on every load.
 */
type State = {
  fits: Record<string, PlateFits>;
  /** Keep `fits` for a model; an empty one forgets it. */
  remember: (key: string, fits: PlateFits) => void;
  forget: (key: string) => void;
};

const storage = dbStorage("housey-plate-fits", "settings", 0);

export const usePlateFits = create<State>()(
  persist(
    (set) => ({
      fits: {},
      remember: (key, fits) => set((s) => ({ fits: cleanFitMap({ ...s.fits, [key]: fits }) })),
      forget: (key) => set((s) => ({ fits: Object.fromEntries(Object.entries(s.fits).filter(([k]) => k !== key)) })),
    }),
    {
      name: "housey-plate-fits",
      storage: createJSONStorage(() => storage),
      partialize: (s) => ({ fits: s.fits }),
      merge: (persisted, current) => ({ ...current, fits: cleanFitMap(isRecord(persisted) ? persisted.fits : undefined) }),
    },
  ),
);
storage.bind(() => void usePlateFits.persist.rehydrate());
