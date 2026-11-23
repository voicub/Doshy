import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { cleanMap, nudge, type CarModelEntry } from "./carModels";
import { dbStorage } from "./dbClient";
import { deleteModel } from "./modelStore";

/**
 * Which catalogue car uses which imported real model, and how it is fitted. The plan only stores the catalogue car id, so a plan opened on
 * a device without this mapping (or without the model file) simply draws the built-in car. The model files themselves are kept through
 * lib/modelStore (public functions only); this store keeps the small descriptions, re-checked on every load like any stored data.
 */
type State = {
  models: Record<string, CarModelEntry>;
  /** Use `entry` for every car of this catalogue id; the previous model file is deleted when nothing else uses it. */
  assign: (carId: string, entry: CarModelEntry) => void;
  /** Change fitting or paint choices of a car's model. */
  patch: (carId: string, change: Partial<Pick<CarModelEntry, "paintKey" | "keepOriginal">> & { calib?: Partial<CarModelEntry["calib"]> }) => void;
  /** Back to the built-in model. */
  clear: (carId: string) => void;
  /** "Fetch a real model automatically when I place a car" (off until the owner turns it on). */
  autoFetch: boolean;
  setAutoFetch: (on: boolean) => void;
};

const storage = dbStorage("housey-car-models", "settings", 1);

export const useCarModels = create<State>()(
  persist(
    (set, get) => {
      const drop = (resource: string | undefined) => {
        if (resource && !Object.values(get().models).some((e) => e.resource === resource)) void deleteModel(resource).catch(() => undefined);
      };
      return {
        models: {},
        autoFetch: false,
        setAutoFetch: (autoFetch) => set({ autoFetch }),
        assign: (carId, entry) => {
          const old = get().models[carId]?.resource;
          set((s) => ({ models: { ...s.models, [carId]: entry } }));
          if (old !== entry.resource) drop(old);
        },
        patch: (carId, { calib, ...rest }) =>
          set((s) => {
            const e = s.models[carId];
            return e ? { models: { ...s.models, [carId]: { ...e, ...rest, calib: calib ? nudge(e.calib, calib) : e.calib } } } : s;
          }),
        clear: (carId) => {
          const old = get().models[carId]?.resource;
          set((s) => ({ models: Object.fromEntries(Object.entries(s.models).filter(([id]) => id !== carId)) }));
          drop(old);
        },
      };
    },
    {
      name: "housey-car-models",
      version: 1,
      storage: createJSONStorage(() => storage),
      partialize: (s) => ({ models: s.models, autoFetch: s.autoFetch }),
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<State>;
        return { ...current, models: cleanMap(p.models), autoFetch: p.autoFetch === true };
      },
    },
  ),
);
storage.bind(() => void useCarModels.persist.rehydrate());
