import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { useActivePlan } from "./activePlan";
import { dbStorage } from "./dbClient";
import { errorMessage } from "./guards";
import type { Suggestion } from "./routines";
import { routinePlan, type RoutinePlan } from "./routinesPlan";
import { EMPTY_PREFS, dismiss, parsePrefs, restore, restoreAll, snooze, withScan, type RoutinePrefs } from "./routinesPrefs";
import { scanRoutines } from "./routinesScan";
import { useStore } from "./store";

const storage = dbStorage("housey-routines", "settings", 0);

type Status = "idle" | "scanning" | "ready" | "error";

type RoutinesState = {
  prefs: RoutinePrefs;
  status: Status;
  suggestions: Suggestion[];
  /** when the ideas on show were found (this session); null before the first scan */
  scannedAt: number | null;
  notes: string[];
  error: string | null;
  /** the plan and devices the ideas were found for, so a plan switch scans again */
  scannedFor: string;
  scan: (fresh?: boolean) => Promise<void>;
  /** "Not now": leave this idea alone for 30 days. */
  later: (id: string) => void;
  /** "Never suggest this". */
  never: (id: string) => void;
  /** Undo of either. */
  bringBack: (id: string) => void;
  bringBackAll: () => void;
};

/** What a scan was for: the active plan and the devices read. */
export const scanKeyOf = (rp: RoutinePlan): string => `${useActivePlan.getState().id}|${rp.entities.join(",")}`;

let running: AbortController | null = null;

export const useRoutines = create<RoutinesState>()(
  persist(
    (set) => ({
      prefs: EMPTY_PREFS,
      status: "idle",
      suggestions: [],
      scannedAt: null,
      notes: [],
      error: null,
      scannedFor: "",
      scan: async (fresh = false) => {
        running?.abort();
        const ctl = new AbortController();
        running = ctl;
        const { plan, states } = useStore.getState();
        const rp = routinePlan(plan, states);
        set({ status: "scanning", error: null });
        try {
          const found = await scanRoutines(rp, states, { fresh, signal: ctl.signal });
          if (running !== ctl) return;
          set((s) => ({ status: "ready", suggestions: found.suggestions, scannedAt: found.scannedAt, notes: found.notes, scannedFor: scanKeyOf(rp), prefs: withScan(s.prefs, found.scannedAt, found.suggestions.map((x) => x.id)) }));
        } catch (e) {
          if (running !== ctl || ctl.signal.aborted) return;
          set({ status: "error", error: errorMessage(e) });
        }
      },
      later: (id) => set((s) => ({ prefs: snooze(s.prefs, id, Date.now()) })),
      never: (id) => set((s) => ({ prefs: dismiss(s.prefs, id) })),
      bringBack: (id) => set((s) => ({ prefs: restore(s.prefs, id) })),
      bringBackAll: () => set((s) => ({ prefs: restoreAll(s.prefs) })),
    }),
    {
      name: "housey-routines",
      version: 0,
      storage: createJSONStorage(() => storage),
      partialize: (s) => ({ prefs: s.prefs }),
      merge: (saved, current) => ({ ...current, prefs: parsePrefs(saved !== null && typeof saved === "object" && "prefs" in saved ? saved.prefs : undefined) }),
    },
  ),
);
storage.bind(() => void useRoutines.persist.rehydrate());
