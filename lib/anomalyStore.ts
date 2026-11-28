import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { dbStorage } from "./dbClient";
import { useStore } from "./store";
import { useActivePlan } from "./activePlan";
import { currentHome } from "./haHome";
import { errorMessage, isRecord } from "./guards";
import { analyse, finish, LEARNED } from "./anomaly";
import { subjectsOf } from "./anomalyPlan";
import { EMPTY_PREFS, parsePrefs, markNormal, snooze, restoreAll, visible, withScan, type AnomalyPrefs, type AnomalyAlertMode } from "./anomalyPrefs";
import { ANOMALY_CACHE_MS, scanAnomalies } from "./anomalyScan";
import type { Anomaly } from "./anomalyTypes";
import type { AnomalyWire } from "./anomalyWire";

const storage = dbStorage("housey-anomaly", "settings", 0);
let running: AbortController | null = null;
// A failed scan is not retried by the background watch for as long as a good one would be kept (it would ask the recorder for weeks of history again on every poll); Check now always retries.
let failed: { key: string; at: number } | null = null;
export const anomalyKey = (): string => {
  const { plan, states } = useStore.getState();
  return `${currentHome()}|${useActivePlan.getState().id}|${subjectsOf(plan, states).map((s) => `${s.entity}:${s.roomId ?? ""}:${s.kind}`).join(",")}`;
};
type State = {
  prefs: AnomalyPrefs;
  raw: Anomaly[];
  status: "idle" | "scanning" | "ready" | "error";
  scannedAt: number | null;
  scannedFor: string;
  wire: AnomalyWire | null;
  error: string | null;
  scan: (fresh?: boolean) => Promise<void>;
  syncLive: () => void;
  later: (id: string) => void;
  normal: (a: Anomaly) => void;
  restore: () => void;
  setMode: (alerts: AnomalyAlertMode) => void;
  stamp: (raised: Record<string, number>) => void;
};
export const useAnomaly = create<State>()(persist((set, get) => ({
  prefs: EMPTY_PREFS, raw: [], status: "idle", scannedAt: null, scannedFor: "", wire: null, error: null,
  scan: async (fresh = false) => {
    const key = anomalyKey();
    const old = get();
    if (!fresh && old.scannedFor === key && old.scannedAt !== null && Date.now() - old.scannedAt < ANOMALY_CACHE_MS) { old.syncLive(); return; }
    if (!fresh && failed?.key === key && Date.now() - failed.at < ANOMALY_CACHE_MS) { old.syncLive(); return; }
    if (!fresh && old.status === "scanning" && old.scannedFor === key) return;
    running?.abort();
    const controller = new AbortController();
    running = controller;
    const { plan, states } = useStore.getState();
    const same = old.scannedFor === key;
    set({ status: "scanning", error: null, scannedFor: key, ...(!same ? { raw: [], wire: null, scannedAt: null } : {}) });
    try {
      const now = Date.now();
      const found = await scanAnomalies({ now, zone: null, states, subjects: subjectsOf(plan, states), wire: null, tolerance: get().prefs.tolerance }, controller.signal, fresh);
      if (running !== controller || anomalyKey() !== key) return;
      set((s) => ({ ...found, status: "ready", scannedAt: now, prefs: withScan(s.prefs, now, visible(s.prefs, found.raw, now).length) }));
      failed = null;
    } catch (e) {
      if (controller.signal.aborted || running !== controller || anomalyKey() !== key) return;
      set({ status: "error", error: errorMessage(e) });
      failed = { key, at: Date.now() };
      get().syncLive();
    }
  },
  syncLive: () => {
    const { plan, states } = useStore.getState();
    const s = get();
    const same = s.scannedFor === anomalyKey();
    const live = analyse({ now: Date.now(), zone: same ? s.wire?.zone ?? null : null, states, subjects: subjectsOf(plan, states), wire: null, tolerance: s.prefs.tolerance });
    set({ raw: finish([...(same ? s.raw.filter((a) => LEARNED.includes(a.rule)) : []), ...live]), ...(!same ? { scannedAt: null, wire: null } : {}) });
  },
  later: (id) => set((s) => ({ prefs: snooze(s.prefs, id, Date.now()) })),
  normal: (a) => {
    set((s) => {
      const prefs = markNormal(s.prefs, a);
      return { prefs, raw: s.raw.filter((x) => x.id !== a.id) };
    });
  },
  restore: () => { set((s) => ({ prefs: restoreAll(s.prefs), scannedAt: null })); },
  setMode: (alerts) => set((s) => ({ prefs: { ...s.prefs, alerts } })),
  stamp: (raised) => set((s) => ({ prefs: { ...s.prefs, raised } })),
}), {
  name: "housey-anomaly", storage: createJSONStorage(() => storage),
  partialize: (s) => ({ prefs: s.prefs }),
  merge: (saved, current) => ({ ...current, prefs: parsePrefs(isRecord(saved) ? saved.prefs : null) }),
}));
storage.bind(() => void useAnomaly.persist.rehydrate());

/** Eco never subscribes to the sensors or starts background history work. Manual Check now still works. */
export function startAnomalyWatch(): () => void {
  let timer: number | undefined;
  const run = () => {
    timer = undefined;
    const s = useAnomaly.getState();
    if (s.prefs.alerts === "off") return;
    s.syncLive();
    void s.scan();
  };
  const schedule = () => { timer ??= window.setTimeout(run, 1000); };
  const stop = useStore.subscribe((s, old) => { if (s.plan !== old.plan || s.states !== old.states) schedule(); });
  const stopPlan = useActivePlan.subscribe(schedule);
  const tick = window.setInterval(schedule, 60_000);
  schedule();
  return () => { stop(); stopPlan(); window.clearTimeout(timer); window.clearInterval(tick); };
}
