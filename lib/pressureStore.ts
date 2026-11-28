// The owner's pressure choices (rules and validation: lib/pressurePrefs.ts), kept with the other settings via dbStorage so every screen agrees. Each Home Assistant has its own set:
// `homes` holds them all, the flat fields are the ones for the home on screen.
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { dbStorage } from "./dbClient";
import { currentHome, onHomeChange } from "./haHome";
import { cleanPressureHomes, cleanPressurePrefs, MAIN_HOME, PRESSURE_PREFS_DEFAULTS, type PressureHomes, type PressurePrefs } from "./pressurePrefs";

type State = PressurePrefs & {
  homes: PressureHomes;
  set: (patch: Partial<PressurePrefs>) => void;
};

const storage = dbStorage("housey-pressure", "settings", 0);
const keyOf = (id: string | null): string => id ?? MAIN_HOME;
const prefsOf = (s: PressurePrefs): PressurePrefs => ({ entity: s.entity, correct: s.correct, altitudeM: s.altitudeM, alerts: s.alerts });
let shown = keyOf(currentHome());

export const usePressurePrefs = create<State>()(
  persist(
    (set) => ({
      ...PRESSURE_PREFS_DEFAULTS,
      homes: {},
      set: (patch) => set((s) => cleanPressurePrefs({ ...s, ...patch })),
    }),
    {
      name: "housey-pressure",
      storage: createJSONStorage(() => storage),
      partialize: (s) => ({ homes: { ...s.homes, [shown]: prefsOf(s) } }),
      // a stale or hand-edited value must not leave the barometer on an invalid entity or a nonsense altitude
      merge: (persisted, current) => {
        const homes = cleanPressureHomes(persisted);
        return { ...current, homes, ...(homes[shown] ?? PRESSURE_PREFS_DEFAULTS) };
      },
    },
  ),
);
storage.bind(() => void usePressurePrefs.persist.rehydrate());
// Another home on screen: keep the old home's choices, show the new home's (the defaults when it has none yet).
onHomeChange((id) => {
  const next = keyOf(id);
  usePressurePrefs.setState((s) => ({ homes: { ...s.homes, [shown]: prefsOf(s) }, ...(s.homes[next] ?? PRESSURE_PREFS_DEFAULTS) }));
  shown = next;
});
