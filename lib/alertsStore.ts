// Browser side of the alerts: the owner's settings (kept with the other settings via dbStorage), what is active and what is still waiting for an answer on this screen,
// and the engine that keeps both up to date. The rules are lib/alerts.ts (what is wrong) and lib/alertsQueue.ts (what was answered); both are tested.
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { ALERT_DEFAULTS, cleanAlertSettings, deriveAlerts, SNOOZE_MS, type Alert, type AlertMode, type AlertSettings } from "./alerts";
import { acknowledge, EMPTY_LIFE, queueOf, sameAlerts, snooze, step, type Life } from "./alertsQueue";
import { dbStorage } from "./dbClient";
import type { HAState } from "./ha";
import { useStore } from "./store";
import type { Plan } from "./types";
import { useAnomaly, anomalyKey } from "./anomalyStore";
import { bannerWorthy } from "./anomalyPrefs";
import { pressureAlert } from "./alerts";
import { usePressure } from "./usePressure";
import { usePressurePrefs } from "./pressureStore";

type State = AlertSettings & {
  /** Everything wrong right now (not persisted). */
  active: Alert[];
  /** What still needs an answer: active, not acknowledged, not snoozed. Empty when alerts are off. */
  queue: Alert[];
  life: Life;
  setMode: (mode: AlertMode) => void;
  setSound: (on: boolean) => void;
  setOpenMinutes: (minutes: number) => void;
  /** Answer these alerts (default: everything in the queue). */
  acknowledge: (ids?: string[]) => void;
  /** Hide these alerts for 10 minutes; they come back if still active (default: everything in the queue). */
  snooze: (ids?: string[]) => void;
  /** Work out the alerts again. Returns the ones that just started and the ids that just cleared. */
  sync: (plan: Plan, states: Record<string, HAState>, now: number) => { started: Alert[]; gone: string[] };
};

const storage = dbStorage("housey-alerts", "settings", 0);

export const useAlerts = create<State>()(
  persist(
    (set, get) => {
      const answer = (fn: (life: Life, ids: string[], now: number) => Life) => (ids?: string[]) => {
        const s = get();
        const now = Date.now();
        const life = fn(s.life, ids ?? s.queue.map((a) => a.id), now);
        set({ life, queue: queueOf(life, s.active, now) });
      };
      return {
        ...ALERT_DEFAULTS,
        active: [],
        queue: [],
        life: EMPTY_LIFE,
        setMode: (mode) => set({ mode }),
        setSound: (sound) => set({ sound }),
        setOpenMinutes: (minutes) => set({ openMinutes: cleanAlertSettings({ openMinutes: minutes }).openMinutes }),
        acknowledge: answer((life, ids) => acknowledge(life, ids)),
        snooze: answer((life, ids, now) => snooze(life, ids, now + SNOOZE_MS)),
        sync(plan, states, now) {
          const s = get();
          if (s.mode === "off") {
            // nothing is shown, so nothing is remembered: switching back on starts from a clean slate
            if (s.active.length || s.life.known.size) set({ active: [], queue: [], life: EMPTY_LIFE });
            return { started: [], gone: [] };
          }
          const health = useAnomaly.getState();
          const eligible = useStore.getState().view === "live" && health.prefs.alerts === "banner" && health.scannedFor === anomalyKey();
          const found = bannerWorthy(health.prefs, eligible ? health.raw : [], new Set(s.active.filter((a) => a.kind === "anomaly").map((a) => a.id)), now);
          if (found.alerts.some((a) => health.prefs.raised[a.id] !== found.raised[a.id])) health.stamp(found.raised);
          const anomalyAlerts: Alert[] = found.alerts.map((a) => ({ ...a, kind: "anomaly", severity: "warning" }));
          const pressure = usePressure.getState();
          const weather = pressureAlert(pressure.reading, pressure.tendency, usePressurePrefs.getState().alerts, useStore.getState().view !== "live", now).map((a) => ({ ...a, since: s.active.find((old) => old.id === a.id)?.since ?? now }));
          const derived = [...deriveAlerts(plan, states, now, { openMinutes: s.openMinutes }), ...anomalyAlerts, ...weather];
          const active = sameAlerts(s.active, derived) ? s.active : derived;
          const next = step(s.life, active, now);
          const queue = queueOf(next.life, active, now);
          set({ active, life: next.life, queue: sameAlerts(queue, s.queue) ? s.queue : queue });
          return { started: next.started, gone: next.gone };
        },
      };
    },
    {
      name: "housey-alerts",
      storage: createJSONStorage(() => storage),
      partialize: (s) => ({ mode: s.mode, sound: s.sound, openMinutes: s.openMinutes }),
      // a stale or hand-edited value must not leave alerts on an unknown mode or a nonsense limit
      merge: (persisted, current) => ({ ...current, ...cleanAlertSettings(persisted) }),
    },
  ),
);
storage.bind(() => void useAlerts.persist.rehydrate());

const THROTTLE_MS = 1000; // a poll or a drag can set the plan and the states many times a second; one pass a second is plenty for something a person reads
const TICK_MS = 15_000; // a door crosses "open for N minutes" and a snooze runs out with no state change: look again now and then

type Handlers = { onStarted: (alerts: Alert[]) => void; onGone: (ids: string[]) => void };

/**
 * Keeps `useAlerts` in step with the plan, the Home Assistant states and the settings. Runs at most once a second, and only when one of them really changed (the states map
 * keeps its identity while Home Assistant reports nothing new), plus a slow tick for the clock-driven cases. Returns the function that stops it.
 */
export function startAlertEngine({ onStarted, onGone }: Handlers): () => void {
  let timer: number | undefined;
  let last = 0;
  const run = () => {
    timer = undefined;
    last = Date.now();
    const { plan, states } = useStore.getState();
    const { started, gone } = useAlerts.getState().sync(plan, states, last);
    if (started.length) onStarted(started);
    if (gone.length) onGone(gone);
  };
  const schedule = () => {
    if (timer === undefined) timer = window.setTimeout(run, Math.max(0, last + THROTTLE_MS - Date.now()));
  };
  const stopStore = useStore.subscribe((s, prev) => { if (s.states !== prev.states || s.plan !== prev.plan || s.view !== prev.view) schedule(); });
  const stopAnomaly = useAnomaly.subscribe((s, prev) => { if (s.raw !== prev.raw || s.prefs !== prev.prefs) schedule(); });
  const stopPressure = usePressure.subscribe(schedule);
  const stopPressureSettings = usePressurePrefs.subscribe(schedule);
  const stopSettings = useAlerts.subscribe((s, prev) => { if (s.mode !== prev.mode || s.openMinutes !== prev.openMinutes) schedule(); });
  const tick = window.setInterval(schedule, TICK_MS);
  schedule();
  return () => {
    stopStore();
    stopSettings();
    stopAnomaly();
    stopPressure();
    stopPressureSettings();
    window.clearInterval(tick);
    window.clearTimeout(timer);
  };
}
