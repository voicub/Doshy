import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { dbStorage } from "@/lib/dbClient";
import { DEFAULT_WALKWAY, WALKWAYS } from "@/lib/fit";
import { isRecord } from "@/lib/guards";
import type { Measure } from "@/lib/measure";
import type { Pt } from "@/lib/types";

type Settings = {
  /** Every wall's inner and outer face length on the plan. */
  wallLengths: boolean;
  /** Area and the way round in every room label. */
  roomAreas: boolean;
  /** The walkway the "Does it fit here?" check wants between a piece and its neighbours (m). */
  walkway: number;
};
type SettingsState = Settings & { patch: (p: Partial<Settings>) => void };

const storage = dbStorage("housey-measure", "settings", 0);

/** The owner's choices for the measuring tools: kept with the other settings, the same on every plan. */
export const useMeasureSettings = create<SettingsState>()(
  persist(
    (set) => ({ wallLengths: false, roomAreas: false, walkway: DEFAULT_WALKWAY, patch: (p) => set(p) }),
    {
      name: "housey-measure",
      storage: createJSONStorage(() => storage),
      partialize: (s): Settings => ({ wallLengths: s.wallLengths, roomAreas: s.roomAreas, walkway: s.walkway }),
      // whatever was stored is checked field by field: a hand-edited file must not turn on a walkway of 40 m
      merge: (saved, current) => {
        const s = isRecord(saved) ? saved : {};
        const walkway = WALKWAYS.find((w) => w === s.walkway) ?? DEFAULT_WALKWAY;
        return { ...current, wallLengths: s.wallLengths === true, roomAreas: s.roomAreas === true, walkway };
      },
    },
  ),
);
storage.bind(() => void useMeasureSettings.persist.rehydrate());

export type MeasureMode = "distance" | "room" | "area" | "fit";
/** A polygon the Area mode closed: session only, like the kept distances. */
export type Area = { id: string; level: string; pts: Pt[] };

type Session = {
  mode: MeasureMode;
  /** First point of the distance being measured. */
  first: Pt | null;
  /** Kept distances and areas, newest first. */
  measures: Measure[];
  areas: Area[];
  /** Points of the area being drawn. */
  draft: Pt[];
  /** The room whose numbers the bar shows (Room mode). */
  roomId: string | null;
  set: (p: Partial<Omit<Session, "set" | "clear">>) => void;
  /** Forget what is half done (not the kept measures). */
  clear: () => void;
};

/** What the Measure tool remembers while the page is open. Nothing here is saved in the plan. */
export const useMeasureUi = create<Session>((set) => ({
  mode: "distance",
  first: null,
  measures: [],
  areas: [],
  draft: [],
  roomId: null,
  set: (p) => set(p),
  clear: () => set({ first: null, draft: [], roomId: null }),
}));
