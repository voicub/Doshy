// What the owner chose about the night sky, kept on this device only (a phone and a wall display may want different things, so it is not synced with the plan).
// Every field is optional in storage and validated on load: a missing or damaged value falls back to its default.
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { isRecord } from "./guards.ts";

export type NightSkySettings = {
  /** Draw the constellation lines (the scene shows them from the Detailed tier up; the chart always can). */
  lines: boolean;
  /** Ask for the space station's position (the Doshy server asks a public service, see docs/night-sky.md). Off = nothing is ever requested. */
  iss: boolean;
  set: (patch: Partial<Pick<NightSkySettings, "lines" | "iss">>) => void;
};

export const useNightSkySettings = create<NightSkySettings>()(
  persist(
    (set) => ({ lines: true, iss: true, set: (patch) => set(patch) }),
    {
      name: "housey-nightsky",
      version: 1,
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({ lines: s.lines, iss: s.iss }),
      merge: (saved, current) => (isRecord(saved) ? { ...current, lines: typeof saved.lines === "boolean" ? saved.lines : current.lines, iss: typeof saved.iss === "boolean" ? saved.iss : current.iss } : current),
    },
  ),
);
