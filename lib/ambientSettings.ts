import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { DEFAULT_AMBIENT, restoreAmbient, type AmbientSettings } from "./ambient.ts";
import { dbStorage } from "./dbClient";

type State = AmbientSettings & { setSmoke: (on: boolean) => void };

const storage = dbStorage("housey-ambient", "settings", 0);

/** The owner's choices for the ambient life of the live view (smoke and flames from stoves and chimneys). */
export const useAmbient = create<State>()(
  persist(
    (set) => ({
      ...DEFAULT_AMBIENT,
      setSmoke: (smoke) => set({ smoke }),
    }),
    {
      name: "housey-ambient",
      storage: createJSONStorage(() => storage),
      partialize: (s): AmbientSettings => ({ smoke: s.smoke }),
      // a stale or hand-edited value falls back to the default instead of breaking the scene
      merge: (persisted, current) => ({ ...current, ...restoreAmbient(persisted) }),
    },
  ),
);
storage.bind(() => void useAmbient.persist.rehydrate());
