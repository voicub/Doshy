import { createJSONStorage, type PersistStorage, type StateStorage } from "zustand/middleware";
import { shallow } from "zustand/shallow";

/**
 * zustand's `persist` writes after EVERY `set`, whatever changed (a poll, a selection, a hover). `partialize` builds a fresh object each time, so
 * this compares its fields one level deep and serialises only when one of them is a new value: an untouched plan is never stringified again.
 */
export function createChangeOnlyStorage<S extends object>(getStorage: () => StateStorage): PersistStorage<S> | undefined {
  const base = createJSONStorage<S>(getStorage);
  if (!base) return undefined;
  let last: { state: S; version?: number } | undefined;
  return {
    ...base,
    setItem: (name, value) => {
      if (last && last.version === value.version && shallow(last.state, value.state)) return;
      last = value;
      return base.setItem(name, value);
    },
  };
}
