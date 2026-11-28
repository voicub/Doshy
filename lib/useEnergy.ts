"use client";
// The energy sources the user picked (global setting `housey-energy`) and the live figures computed from them.
import { useMemo, useRef } from "react";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { dbStorage } from "./dbClient";
import { energyNow, parseSources, type EnergyNow, type EnergySources } from "./energy";
import { isRecord } from "./guards";
import { stabilize } from "./live";
import { useStore } from "./store";

type State = {
  sources: EnergySources;
  /** Changes some fields (an undefined value clears one); the result is validated like a stored value. */
  patch: (p: Partial<EnergySources>) => void;
  /** Replaces everything (used by "Find them for me" and "Clear all"). */
  replace: (s: EnergySources) => void;
};

const storage = dbStorage("housey-energy", "settings", 0);

export const useEnergy = create<State>()(
  persist(
    (set) => ({
      sources: parseSources(undefined),
      patch: (p) => set((s) => ({ sources: parseSources({ ...s.sources, ...p }) })),
      replace: (sources) => set({ sources: parseSources(sources) }),
    }),
    {
      name: "housey-energy",
      storage: createJSONStorage(() => storage),
      partialize: (s) => ({ sources: s.sources }),
      // a stale or hand-edited value must not leave a malformed sensor id behind
      merge: (persisted, current) => ({ ...current, sources: parseSources(isRecord(persisted) ? persisted.sources : undefined) }),
    },
  ),
);
storage.bind(() => void useEnergy.persist.rehydrate());

export const useEnergySources = () => useEnergy((s) => s.sources);

/** The live energy figures. The object keeps its identity while no value changes, so scenes and cards re-render only on a real change. */
export function useEnergyNow(): EnergyNow {
  const sources = useEnergySources();
  const states = useStore((s) => s.states);
  const last = useRef<EnergyNow>(undefined);
  return useMemo(() => {
    last.current = stabilize(last.current, energyNow(sources, states));
    return last.current;
  }, [sources, states]);
}
