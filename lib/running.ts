// Pure "is this appliance running?" logic for appliances on a smart plug (no React, no store; the node test runner loads this file directly).
// A basic washer / kettle / TV has no smart state of its own, but its plug reports watts: running = drawing real power for a while.

type RunState = "off" | "standby" | "running" | "finished";
export type Family = "washer" | "dryer" | "dishwasher" | "kettle" | "coffee" | "tv" | "printer" | "dehumidifier" | "generic";
export type Sample = { t: number; w: number }; // epoch ms, watts

type Thresholds = {
  runAbove: number; // W: running above this
  standbyAbove: number; // W: at least this is standby, below it the appliance is off
  startS: number; // power must stay high this long before it counts as running (skips spikes)
  gapS: number; // power may dip below the threshold this long without the run ending (soak / pause phases)
  minCycleS: number; // a run shorter than this is not a finished cycle (a TV that was on for a minute, a kettle top-up)
  holdS: number; // "finished" stays this long after the run ended, then clears
};

const MIN = 60;
const T = (runAbove: number, startS: number, gapS: number, minCycleS: number, holdS: number): Thresholds => ({ runAbove, standbyAbove: 1, startS, gapS, minCycleS, holdS });
/** Per appliance family: [running W, start s, gap s, min cycle s, hold s]. Hysteresis: a run only ends below 80% of runAbove. */
const FAMILY_DEFAULTS: Record<Family, Thresholds> = {
  washer: T(20, 20, 4 * MIN, 10 * MIN, 20 * MIN),
  dryer: T(20, 20, 4 * MIN, 10 * MIN, 20 * MIN),
  dishwasher: T(20, 20, 6 * MIN, 15 * MIN, 20 * MIN),
  kettle: T(800, 0, 10, 30, 2 * MIN),
  coffee: T(300, 0, 30, 20, 3 * MIN),
  tv: { ...T(30, 10, 20, Infinity, 0), standbyAbove: 0.5 },
  printer: T(15, 20, 3 * MIN, 5 * MIN, 10 * MIN),
  dehumidifier: T(40, 20, 3 * MIN, Infinity, 0),
  generic: T(20, 15, 2 * MIN, 5 * MIN, 5 * MIN),
};
const HYSTERESIS = 0.8;

const FAMILY_WORDS: [RegExp, Family][] = [
  [/dishwash/, "dishwasher"],
  [/dryer|tumble/, "dryer"],
  [/washer|washing|laundry/, "washer"],
  [/kettle/, "kettle"],
  [/coffee|espresso|nespresso/, "coffee"],
  [/(^|[^a-z])tv([^a-z]|$)|television/, "tv"],
  [/printer/, "printer"],
  [/dehumid/, "dehumidifier"],
];
/** The appliance family from a catalog kind / label ("of_dehumidifier", "Washing machine"). */
export function familyOf(text: string): Family {
  const s = text.toLowerCase();
  return FAMILY_WORDS.find(([r]) => r.test(s))?.[1] ?? "generic";
}

/** Defaults for the family, with the user's own "running above" (W) when set. */
export function thresholdsFor(family: Family, runAbove?: number): Thresholds {
  const d = FAMILY_DEFAULTS[family];
  return runAbove !== undefined && runAbove > 0 ? { ...d, runAbove, standbyAbove: Math.min(d.standbyAbove, runAbove) } : d;
}

/** HA power reading to watts: handles kW and mW; null for unavailable / non-numeric states. */
export function toWatts(state: string, unit?: string): number | null {
  if (state.trim() === "" || !Number.isFinite(Number(state))) return null;
  const v = Number(state);
  return unit === "kW" ? v * 1000 : unit === "mW" ? v / 1000 : v;
}

export type RunStatus = {
  state: RunState;
  /** Epoch ms the current run began (state running). */
  startedAt?: number;
  /** Epoch ms the last run ended (state finished). */
  endedAt?: number;
};

export type RunInput = {
  powerW?: number | null; // latest reading; absent when the sensor is unavailable
  switchOn?: boolean; // the plug's switch; absent when there is none
  thresholds: Thresholds;
  history?: Sample[]; // earlier readings, any order; the latest reading is appended automatically
  now?: number;
};

type Run = { start: number; last: number };

/**
 * Replays the readings through a small state machine: a run starts after `startS` of high power (immediately when the very first reading is high, since
 * what came before is unknown), survives dips shorter than `gapS`, and ends when power stays low. A run of at least `minCycleS` leaves "finished" for `holdS`.
 * The result depends only on the readings, so it is the same after a page reload once the history is back; with no history it still answers from the live watts.
 */
export function runStatus({ powerW, switchOn, thresholds: th, history = [], now = Date.now() }: RunInput): RunStatus {
  const samples = [...history, ...(powerW != null ? [{ t: now, w: powerW }] : [])].filter((s) => s.t <= now).sort((a, b) => a.t - b.t);
  const gap = th.gapS * 1000;
  let run: Run | null = null;
  let pending: number | null = null; // start of a streak of high readings not yet confirmed
  let finished: Run | null = null;
  const ended = (r: Run, prev: Run | null) => ((r.last - r.start) / 1000 >= th.minCycleS ? r : prev);
  for (let i = 0; i < samples.length; i++) {
    const s = samples[i];
    const high = s.w >= (run ? th.runAbove * HYSTERESIS : th.runAbove);
    if (run) {
      if (high) run.last = s.t;
      else if (s.t - run.last >= gap) {
        finished = ended(run, finished);
        run = null;
      }
    } else if (high) {
      pending ??= s.t;
      if (i === 0 || s.t - pending >= th.startS * 1000) {
        run = { start: pending, last: s.t };
        finished = null;
        pending = null;
      }
    } else pending = null;
  }
  if (run && (switchOn === false || now - run.last >= gap)) {
    finished = ended(run, finished);
    run = null;
  }
  if (run) return { state: "running", startedAt: run.start };
  if (finished && now - finished.last <= th.holdS * 1000) return { state: "finished", endedAt: finished.last };
  return { state: switchOn === false || (powerW ?? 0) < th.standbyAbove ? "off" : "standby" };
}

/** Appends a reading (replacing one at the same instant) and drops those older than `keepMs`. Returns a new array. */
export function pushWatts(buf: Sample[], t: number, w: number, keepMs: number): Sample[] {
  const last = buf[buf.length - 1];
  const next = last && last.t === t ? buf.slice(0, -1) : buf;
  return [...next, { t, w }].filter((s) => t - s.t <= keepMs);
}

/** "0:42", "12:05", "1:02:09". */
export function clock(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const pad = (n: number) => String(n).padStart(2, "0");
  return h ? `${h}:${pad(m)}:${pad(s % 60)}` : `${m}:${pad(s % 60)}`;
}

/** "just now", "3 min ago", "1 h 5 min ago". */
export function ago(ms: number): string {
  const m = Math.floor(Math.max(0, ms) / 60_000);
  return m < 1 ? "just now" : m < 60 ? `${m} min ago` : `${Math.floor(m / 60)} h ${m % 60} min ago`;
}

const VERB: Record<Family, string> = { washer: "Washing", dryer: "Drying", dishwasher: "Washing up", kettle: "Boiling", coffee: "Brewing", tv: "On", printer: "Printing", dehumidifier: "Drying the air", generic: "Running" };
const fmtW = (w: number) => `${w >= 100 ? Math.round(w) : Math.round(w * 10) / 10} W`;

/** The words for a badge: `title` ("Washing, 412 W") and `sub` ("Running 0:42" / "Finished 3 min ago"). */
export function runLabel(family: Family, s: RunStatus, powerW: number | null | undefined, now = Date.now()): { title: string; sub?: string } {
  const w = powerW == null ? "" : fmtW(powerW);
  if (s.state === "running") return { title: w ? `${VERB[family]}, ${w}` : VERB[family], sub: `Running ${clock(now - (s.startedAt ?? now))}` };
  if (s.state === "finished") return { title: "Finished", sub: ago(now - (s.endedAt ?? now)) };
  return { title: s.state === "standby" ? (w ? `Standby, ${w}` : "Standby") : "Off" };
}

/**
 * A good "running above" for this plug. Keeps the family default, unless the readings never reach it (a small appliance):
 * then about half of the peak, so its real draw still counts as running.
 */
export function suggestRunAbove(family: Family, watts: number[]): number {
  const def = FAMILY_DEFAULTS[family].runAbove;
  const peak = Math.max(0, ...watts);
  return peak > 3 && peak < def ? Math.max(2, Math.round(peak / 2)) : def;
}

type Ent = { entity_id: string; state: string; attributes: { friendly_name?: string; unit_of_measurement?: string; device_class?: string } };
const isPowerSensor = (e: Ent) => e.entity_id.startsWith("sensor.") && (e.attributes.device_class === "power" || ["W", "kW", "mW"].includes(e.attributes.unit_of_measurement ?? ""));

/** The power sensor that belongs to a plug by entity-id stem: switch.washing_machine -> sensor.washing_machine_power (also ..._plug -> ...). */
export function powerSensorFor(plug: string, states: Record<string, Ent>): string | undefined {
  const stem = plug.split(".")[1].replace(/_(switch|plug|socket|outlet|relay)$/, "");
  const mine = Object.values(states).filter((e) => isPowerSensor(e) && e.entity_id.startsWith(`sensor.${stem}`));
  return (mine.find((e) => e.entity_id === `sensor.${stem}_power`) ?? mine.find((e) => e.entity_id.includes("power")) ?? mine[0])?.entity_id;
}

export const FAMILY_HINTS: Record<Family, string[]> = {
  washer: ["washer", "washing", "laundry"],
  dryer: ["dryer", "tumble"],
  dishwasher: ["dishwasher", "dish"],
  kettle: ["kettle"],
  coffee: ["coffee", "espresso"],
  tv: ["tv", "television"],
  printer: ["printer"],
  dehumidifier: ["dehumid"],
  generic: [],
};

type PlugCandidate = { plug: string; power?: string; score: number };

/**
 * Switches that look like the plug of an appliance, best first. `hints` are lower-case words (the appliance's name, its room): a switch whose id or
 * friendly name contains one scores, and one with a sibling power sensor scores a little extra. Switches with no hint match are left out.
 */
export function suggestPlugs(states: Record<string, Ent>, hints: { word: string; weight: number }[], max = 6): PlugCandidate[] {
  return Object.values(states)
    .filter((e) => e.entity_id.startsWith("switch.") && e.state !== "unavailable")
    .map((e) => {
      const hay = `${e.entity_id} ${e.attributes.friendly_name ?? ""}`.toLowerCase();
      const power = powerSensorFor(e.entity_id, states);
      const hit = hints.reduce((n, h) => n + (hay.includes(h.word) ? h.weight : 0), 0);
      return { plug: e.entity_id, power, score: hit ? hit + (power ? 3 : 0) : 0 };
    })
    .filter((c) => c.score > 0)
    .sort((a, b) => b.score - a.score || a.plug.localeCompare(b.plug))
    .slice(0, max);
}
