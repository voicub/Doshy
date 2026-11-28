import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { dbStorage } from "./dbClient";
import { defaultSettings, parseSettings, prefsOf, type PersonPrefs, type PresenceSettings } from "./presence.ts";

type Actions = {
  setShow: (show: boolean) => void;
  /** Change some fields of one person; a field set to undefined goes back to its default. */
  patch: (entity: string, change: Partial<PersonPrefs>) => void;
  addTracker: (entity: string) => void;
  /** Forget a tracker the owner added (and its choices). */
  removeTracker: (entity: string) => void;
  /** Put every setting back (the sheet's Reset and its Undo). */
  replace: (s: PresenceSettings) => void;
};

const VERSION = 1;
const storage = dbStorage("housey-presence", "settings", VERSION);

const dataOf = (s: PresenceSettings): PresenceSettings => ({ show: s.show, people: s.people, trackers: s.trackers });

/** Who shows up in the home and how (colour, letter, room source). Saved with the other settings; anything unreadable falls back to the defaults (everybody on, automatic). */
export const usePresence = create<PresenceSettings & Actions>()(
  persist(
    (set, get) => ({
      ...defaultSettings(),
      setShow: (show) => set({ show }),
      patch: (entity, change) => set({ people: { ...get().people, [entity]: { ...prefsOf(get(), entity), ...change } } }),
      addTracker: (entity) => {
        if (entity.startsWith("device_tracker.") && !get().trackers.includes(entity)) set({ trackers: [...get().trackers, entity] });
      },
      removeTracker: (entity) => {
        const { [entity]: _gone, ...people } = get().people;
        set({ trackers: get().trackers.filter((t) => t !== entity), people });
      },
      replace: (s) => set(parseSettings(s)),
    }),
    {
      name: "housey-presence",
      version: VERSION,
      storage: createJSONStorage(() => storage),
      partialize: (s): PresenceSettings => dataOf(s),
      migrate: parseSettings,
      merge: (persisted, current) => ({ ...current, ...parseSettings(persisted) }),
    },
  ),
);
storage.bind(() => void usePresence.persist.rehydrate());
