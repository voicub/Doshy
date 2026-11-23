// Pure WashData support (no React, no store; the node test runner loads this file directly).
// WashData (the Home Assistant integration `ha_washdata`) watches a washing machine, dryer or dishwasher through its smart plug, detects cycles,
// recognises the program and estimates the time left. One appliance = one HA device whose entities are `<domain>.<name>_<suffix>`.
// Everything here only READS states; the only things the dashboard ever sends are explicit button presses and a program choice (components/ui/WashCard.tsx).
import { toWatts } from "./running.ts";
import type { HAState } from "./ha.ts";

type States = Record<string, HAState | undefined>;

export type WashKind = "washer" | "dryer" | "dishwasher" | "pump" | "other";
export type WashState =
  | "off" | "idle" | "starting" | "running" | "paused" | "user_paused" | "ending" | "finished" | "anti_wrinkle" | "interrupted" | "force_stopped" | "clean" | "delay_wait"
  | "unknown" | "unavailable";
/** What the appliance is doing, in the few classes the UI colours: running (incl. starting and the end wait), paused, done, waiting for its start time, problem, idle, off / no reading. */
type WashPhase = "idle" | "running" | "paused" | "done" | "waiting" | "problem" | "off";
type WashTone = "run" | "paused" | "done" | "problem" | "muted";

/** The entities WashData creates for one appliance, by domain: `<domain>.<name>_<suffix>`. */
const SUFFIXES: Record<string, readonly string[]> = {
  sensor: [
    "state", "program", "current_phase", "time_remaining", "elapsed_time", "total_duration", "progress", "current_power", "cycle_count", "energy_total",
    "last_cycle_duration", "last_cycle_energy", "last_cycle_cost", "last_cycle_start", "suggested_settings_available", "pump_runs_last_24_h",
  ],
  binary_sensor: ["running", "maintenance_due"],
  select: ["cycle_program"],
  button: ["pause_cycle", "resume_cycle", "force_end_cycle", "mark_unloaded", "record_cycle_start", "record_cycle_stop"],
};
const LONGEST_FIRST: [string, string][] = Object.entries(SUFFIXES).flatMap(([d, list]) => list.map((s): [string, string] => [d, s])).sort((a, b) => b[1].length - a[1].length);
/** What makes a device a WashData one: at least three of these must exist under one name (so an unrelated `sensor.x_progress` is not mistaken for it). */
const CORE = ["sensor.state", "sensor.time_remaining", "sensor.progress", "binary_sensor.running", "sensor.program", "sensor.cycle_count", "sensor.current_phase"];
const MIN_CORE = 3;

const STATES: readonly WashState[] = ["off", "idle", "starting", "running", "paused", "user_paused", "ending", "finished", "anti_wrinkle", "interrupted", "force_stopped", "clean", "delay_wait", "unknown", "unavailable"];
const ACTIVE: readonly WashState[] = ["starting", "running", "paused", "user_paused", "ending"];
const ENDED: readonly WashState[] = ["finished", "clean", "anti_wrinkle"];

type WashDevice = {
  /** The shared name: `bathroom_washing_machine` for `sensor.bathroom_washing_machine_state`. */
  base: string;
  /** "Washing Machine": the state sensor's name without " State". */
  name: string;
  kind: WashKind;
  /** The entity an item links to (`sensor.<base>_state`; another member of the family when that one is missing). Any entity of the family links the whole device. */
  anchor: string;
  /** Entity ids of the family that exist. */
  entities: string[];
};

/** `["sensor", "bathroom_washing_machine_state"]` -> the base name, when the entity id ends in one of the WashData suffixes. */
export function baseOf(entityId: string): string | undefined {
  const dot = entityId.indexOf(".");
  if (dot < 1) return undefined;
  const domain = entityId.slice(0, dot);
  const object = entityId.slice(dot + 1);
  for (const [d, s] of LONGEST_FIRST) {
    if (d === domain && object.length > s.length + 1 && object.endsWith(`_${s}`)) return object.slice(0, -(s.length + 1));
  }
  return undefined;
}

/** Is this entity id shaped like a WashData one? Cheap, for deciding whether an item needs the full look-up. */
export const isWashLike = (entityId: string | undefined): boolean => !!entityId && baseOf(entityId) !== undefined;

const id = (domain: string, base: string, suffix: string) => `${domain}.${base}_${suffix}`;
const present = (s: States, domain: string, base: string, suffix: string): HAState | undefined => s[id(domain, base, suffix)];

const titleCase = (t: string) => t.replace(/[_\s]+/g, " ").trim().replace(/\b\w/g, (c) => c.toUpperCase());

/** "Washing Machine State" -> "Washing Machine" (also for the other members: "... Progress", "... Time Remaining"). */
function nameOf(s: States, base: string): string {
  for (const [domain, suffix] of LONGEST_FIRST) {
    const st = present(s, domain, base, suffix);
    const f = st?.attributes.friendly_name;
    if (!f) continue;
    const tail = suffix.replace(/_/g, " ");
    if (f.length > tail.length + 1 && f.toLowerCase().endsWith(` ${tail}`)) return f.slice(0, -(tail.length + 1)).trim();
  }
  return titleCase(base);
}

/** What the appliance is: its name first ("Dishwasher"; a washer-dryer is a washer), then what it reports (a pump counts its runs, only a dryer tumbles anti-wrinkle, program and phase words). */
function kindOf(s: States, base: string, name: string): WashKind {
  const text = `${base} ${name}`.toLowerCase();
  if (/dish/.test(text)) return "dishwasher";
  if (/pump/.test(text)) return "pump";
  if (/wash|laundry/.test(text)) return "washer";
  if (/dry|tumble/.test(text)) return "dryer";
  if (present(s, "sensor", base, "pump_runs_last_24_h")) return "pump";
  const state = present(s, "sensor", base, "state")?.state;
  if (state === "anti_wrinkle") return "dryer";
  const hint = `${present(s, "sensor", base, "program")?.state ?? ""} ${present(s, "sensor", base, "current_phase")?.state ?? ""}`.toLowerCase();
  if (/dish|glass|intensive|pots/.test(hint)) return "dishwasher";
  if (/dry|anti.?wrinkle|cool.?down|iron/.test(hint)) return "dryer";
  if (/rinse|spin|cotton|wool|synthetic|delicate|towel|shirt|duvet|jeans|wash/.test(hint)) return "washer";
  return "other";
}

/** The device named `base`, when enough of its entities exist. */
function washdataAt(states: States, base: string): WashDevice | undefined {
  let core = 0;
  for (const c of CORE) {
    const [d, s] = c.split(".");
    if (present(states, d, base, s)) core++;
  }
  if (core < MIN_CORE) return undefined;
  const entities = LONGEST_FIRST.map(([d, s]) => id(d, base, s)).filter((e) => states[e]);
  const name = nameOf(states, base);
  const stateId = id("sensor", base, "state");
  return { base, name, kind: kindOf(states, base, name), anchor: states[stateId] ? stateId : entities[0], entities };
}

/** Every WashData device in the states, by name. Needs at least three of its core entities to count; an appliance with some entities missing or unavailable is still listed. */
export function washdataFamilies(states: States): WashDevice[] {
  const bases = new Set<string>();
  for (const key in states) {
    const b = baseOf(key);
    if (b) bases.add(b);
  }
  return [...bases].flatMap((b) => washdataAt(states, b) ?? []).sort((a, b) => a.name.localeCompare(b.name));
}

/** The device an entity belongs to: any of the family's entities (not its smart plug's) resolves to it. Undefined for everything else. */
export function washdataOf(states: States, entityId: string | undefined): WashDevice | undefined {
  const base = entityId ? baseOf(entityId) : undefined;
  return base ? washdataAt(states, base) : undefined;
}

// ---- numbers ----------------------------------------------------------------------------------------------------------------------------------

const MISSING = /^(unknown|unavailable|none)?$/i;
/** A reading as a number; `unknown`, `unavailable`, empty and anything that is not a finite number are undefined. */
export function numberOf(st: HAState | undefined): number | undefined {
  if (!st || MISSING.test(st.state.trim())) return undefined;
  const n = Number(st.state);
  return Number.isFinite(n) ? n : undefined;
}
/** A text reading; the "no value" words are undefined. */
function textOf(st: HAState | undefined): string | undefined {
  const t = st?.state.trim();
  return t && !MISSING.test(t) ? t : undefined;
}
/** "cotton_40" -> "Cotton 40", "auto_detect" -> "Auto detect"; a name the owner typed ("Eco 50") stays as it is. */
export const programLabel = (p: string): string => (/^[a-z0-9_]+$/.test(p) ? p.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase()) : p);

// ---- words ------------------------------------------------------------------------------------------------------------------------------------

const VERB: Record<WashKind, string> = { washer: "Washing", dryer: "Drying", dishwasher: "Washing up", pump: "Pumping", other: "Running" };
const LOAD: Record<WashKind, string> = { washer: "laundry", dryer: "laundry", dishwasher: "dishes", pump: "load", other: "load" };
export const KIND_LABEL: Record<WashKind, string> = { washer: "Washing machine", dryer: "Dryer", dishwasher: "Dishwasher", pump: "Pump", other: "Appliance" };
/** Short names for the glance chip. */
const KIND_SHORT: Record<WashKind, string> = { washer: "Washer", dryer: "Dryer", dishwasher: "Dishwasher", pump: "Pump", other: "Appliance" };

/** Plain words for a WashData state. `kind` picks the verb ("Drying") and what is inside ("Dishes still inside"). */
function stateWords(state: string, kind: WashKind = "washer"): string {
  switch (state) {
    case "running": return VERB[kind];
    case "starting": return "Starting";
    case "paused": return "Paused";
    case "user_paused": return "Paused by you";
    case "ending": return "Almost done";
    case "finished": return "Finished";
    case "clean": return `${LOAD[kind][0].toUpperCase()}${LOAD[kind].slice(1)} still inside`;
    case "anti_wrinkle": return "Tumbling (anti-wrinkle)";
    case "delay_wait": return "Waiting for its start time";
    case "force_stopped": return "Stopped";
    case "interrupted": return "Interrupted";
    case "idle": return "Idle";
    case "off": return "Off";
    default: return "Not reporting";
  }
}

/** "58 min", "1 h 05 min" (a length of time). */
export function durationWords(min: number): string {
  const m = Math.round(min);
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, "0")} min`;
}

/** "32 min left", "1 h 05 min left", "Finishing". */
export function remainingWords(min: number): string {
  return !Number.isFinite(min) || Math.round(min) < 1 ? "Finishing" : `${durationWords(min)} left`;
}
const shortRemaining = (min: number) => remainingWords(min).replace(/ left$/, "");

const clock = (t: number) => {
  const d = new Date(t);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
};
/** "ready about 21:45". */
export const readyAbout = (t: number) => `ready about ${clock(t)}`;

// ---- the view -----------------------------------------------------------------------------------------------------------------------------------

type WashControls = { pause?: string; resume?: string; forceEnd?: string; markUnloaded?: string; program?: string };
type WashCycle = { minutes?: number; kwh?: number; cost?: number; currency?: string; startedAt?: number };

export type WashView = {
  base: string;
  name: string;
  kind: WashKind;
  state: WashState;
  phase: WashPhase;
  /** Working right now: starting or running. Drums turn only while this is true. */
  running: boolean;
  /** A cycle is under way: running, the end wait, or paused. */
  inCycle: boolean;
  program?: string;
  phaseName?: string;
  progress?: number;
  remainingMin?: number;
  elapsedMin?: number;
  totalMin?: number;
  powerW?: number;
  /** Laundry or dishes still inside (WashData state `clean`; plain `finished` is not it). */
  loadInside: boolean;
  /** When it finished, for the done states (when the state last changed). */
  finishedAt?: number;
  /** When it is expected to finish: now plus the time left, while it runs. */
  readyAt?: number;
  lastCycle?: WashCycle;
  cycleCount?: number;
  energyKwh?: number;
  maintenanceDue: boolean;
  suggestions?: number;
  /** The select's options, as WashData names them (`auto_detect` and the taught programs). */
  programs: string[];
  selectedProgram?: string;
  /** A control's entity id, only when it exists and is not unavailable. */
  controls: WashControls;
};

const PHASE: Record<WashState, WashPhase> = {
  off: "off", idle: "idle", starting: "running", running: "running", ending: "running", paused: "paused", user_paused: "paused", finished: "done", clean: "done", anti_wrinkle: "done",
  delay_wait: "waiting", interrupted: "problem", force_stopped: "problem", unknown: "off", unavailable: "off",
};

/** The state name WashData reports; without a state sensor the "running" sensor decides. */
function stateOf(s: States, base: string): WashState {
  const raw = present(s, "sensor", base, "state")?.state.trim().toLowerCase();
  const known = STATES.find((x) => x === raw);
  if (known) return known;
  const running = present(s, "binary_sensor", base, "running")?.state;
  if (raw === undefined || raw === "unknown") return running === "on" ? "running" : "unknown";
  return "unavailable";
}

const usable = (st: HAState | undefined) => !!st && st.state !== "unavailable";

/** One normalised look at a WashData device. `now` (epoch ms) is only used for the expected finish time. */
export function washView(states: States, base: string, now = Date.now()): WashView {
  const dev = washdataAt(states, base);
  const name = dev?.name ?? nameOf(states, base);
  const kind = dev?.kind ?? kindOf(states, base, name);
  const state = stateOf(states, base);
  const phase = PHASE[state];
  const get = (suffix: string, domain = "sensor") => present(states, domain, base, suffix);
  const power = get("current_power");
  const powerW = power && power.state !== "unknown" && power.state !== "unavailable" ? (toWatts(power.state, power.attributes.unit_of_measurement) ?? undefined) : undefined;
  const progress = numberOf(get("progress"));
  const remaining = numberOf(get("time_remaining"));
  const programText = textOf(get("program"));
  const program = programText && !["off", "idle", "none"].includes(programText.toLowerCase()) ? programText : undefined;
  const phaseName = textOf(get("current_phase"));
  const elapsed = numberOf(get("elapsed_time"));
  const total = numberOf(get("total_duration"));
  const cycles = numberOf(get("cycle_count"));
  const energy = numberOf(get("energy_total"));
  const cost = get("last_cycle_cost");
  const started = Date.parse(textOf(get("last_cycle_start")) ?? "");
  const minutes = numberOf(get("last_cycle_duration"));
  const kwh = numberOf(get("last_cycle_energy"));
  const price = numberOf(cost);
  const lastCycle: WashCycle = {
    ...(minutes !== undefined ? { minutes } : {}),
    ...(kwh !== undefined ? { kwh } : {}),
    ...(price !== undefined ? { cost: price, ...(cost?.attributes.unit_of_measurement ? { currency: cost.attributes.unit_of_measurement } : {}) } : {}),
    ...(Number.isFinite(started) ? { startedAt: started } : {}),
  };
  const suggested = numberOf(get("suggested_settings_available"));
  const select = get("cycle_program", "select");
  const options = Array.isArray(select?.attributes.options) ? (select.attributes.options as unknown[]).filter((o): o is string => typeof o === "string") : [];
  const changed = Date.parse(present(states, "sensor", base, "state")?.last_changed ?? "");
  const ctl = (domain: string, suffix: string) => (usable(get(suffix, domain)) ? id(domain, base, suffix) : undefined);
  return {
    base, name, kind, state, phase,
    running: state === "starting" || state === "running",
    inCycle: state === "starting" || state === "running" || state === "ending" || phase === "paused",
    ...(program ? { program } : {}),
    ...(phaseName ? { phaseName } : {}),
    ...(progress !== undefined ? { progress: Math.max(0, Math.min(100, progress)) } : {}),
    ...(remaining !== undefined ? { remainingMin: Math.max(0, remaining) } : {}),
    ...(elapsed !== undefined ? { elapsedMin: elapsed } : {}),
    ...(total !== undefined ? { totalMin: total } : {}),
    ...(powerW !== undefined ? { powerW } : {}),
    loadInside: state === "clean",
    ...(phase === "done" && Number.isFinite(changed) ? { finishedAt: changed } : {}),
    ...((state === "running" || state === "starting" || state === "ending") && remaining !== undefined ? { readyAt: now + Math.max(0, remaining) * 60_000 } : {}),
    ...(Object.keys(lastCycle).length ? { lastCycle } : {}),
    ...(cycles !== undefined ? { cycleCount: cycles } : {}),
    ...(energy !== undefined ? { energyKwh: energy } : {}),
    maintenanceDue: get("maintenance_due", "binary_sensor")?.state === "on",
    ...(suggested !== undefined && suggested > 0 ? { suggestions: suggested } : {}),
    programs: options,
    ...(textOf(select) ? { selectedProgram: textOf(select) } : {}),
    controls: { pause: ctl("button", "pause_cycle"), resume: ctl("button", "resume_cycle"), forceEnd: ctl("button", "force_end_cycle"), markUnloaded: ctl("button", "mark_unloaded"), program: ctl("select", "cycle_program") },
  };
}

// ---- what the UI says and colours -----------------------------------------------------------------------------------------------------------

export const wordsOf = (v: WashView): string => stateWords(v.state, v.kind); // the card, the list rows and the badges all say it this way

/** The list row: "Washing - 32 min left", "Finished - laundry inside", "Paused", "Idle". */
export function rowWords(v: WashView): string {
  if (v.state === "clean") return `Finished - ${LOAD[v.kind]} inside`;
  if (v.phase === "running" && v.remainingMin !== undefined && v.state !== "ending") return `${wordsOf(v)} - ${remainingWords(v.remainingMin)}`;
  return wordsOf(v);
}

export type WashBadge = { title: string; sub?: string; pct?: number; tone: WashTone; /** worth a pulse and never hidden: laundry waiting, or a problem */ attention: boolean; /** nothing to read: the scene may shrink it to a status dot (idle, off, plain finished) */ calm: boolean };

/** The marker over the appliance in the 3D scene: `Washing 45%  32 min`, `Done`, `Laundry inside` (pulsing), `Paused`, `Interrupted`. */
export function badgeOf(v: WashView): WashBadge {
  const b = badgeCore(v);
  return { ...b, calm: b.tone === "muted" || v.state === "finished" };
}

function badgeCore(v: WashView): Omit<WashBadge, "calm"> {
  const pct = v.progress !== undefined && v.phase !== "done" ? Math.round(v.progress) : undefined;
  const left = v.remainingMin !== undefined ? shortRemaining(v.remainingMin) : undefined;
  switch (v.state) {
    case "starting": case "running": return { title: stateWords(v.state, v.kind), sub: [pct !== undefined ? `${pct}%` : "", left ?? ""].filter(Boolean).join("  ") || undefined, pct, tone: "run", attention: false };
    case "ending": return { title: "Almost done", pct, tone: "run", attention: false };
    case "paused": case "user_paused": return { title: v.state === "paused" ? "Paused" : "Paused by you", sub: [pct !== undefined ? `${pct}%` : "", left ?? ""].filter(Boolean).join("  ") || undefined, pct, tone: "paused", attention: false };
    case "delay_wait": return { title: "Waiting", sub: "for its start time", tone: "paused", attention: false };
    case "finished": return { title: "Done", tone: "done", attention: false };
    case "clean": return { title: `${LOAD[v.kind][0].toUpperCase()}${LOAD[v.kind].slice(1)} inside`, sub: "still in", tone: "done", attention: true };
    case "anti_wrinkle": return { title: "Tumbling", sub: "anti-wrinkle", tone: "done", attention: false };
    case "interrupted": case "force_stopped": return { title: stateWords(v.state, v.kind), tone: "problem", attention: true };
    case "idle": return { title: "Idle", tone: "muted", attention: false };
    case "off": return { title: "Off", tone: "muted", attention: false };
    default: return { title: "No reading", tone: "muted", attention: false };
  }
}

/** The one-line form of the badge, for screen readers and tooltips: "Washing 45%  32 min". */
export const badgeLine = (v: WashView): string => {
  const b = badgeOf(v);
  return [b.title, b.sub].filter(Boolean).join(" ");
};

export const WASH_COLOR: Record<WashTone, string> = { run: "#5ad7ff", paused: "#ffb020", done: "#43d17a", problem: "#ff5a4a", muted: "#8a98a3" };
const RUN_TINT: Partial<Record<WashKind, string>> = { dryer: "#ffb066", dishwasher: "#4aa3ff" };

/** The colour of the glow and marker: blue while it works (orange for a dryer), amber paused, green done, red problem, grey idle. */
export const washColor = (v: WashView): string => {
  const tone = badgeOf(v).tone;
  return tone === "run" ? (RUN_TINT[v.kind] ?? WASH_COLOR.run) : WASH_COLOR[tone];
};

// ---- glance and notifications --------------------------------------------------------------------------------------------------------------

export type Glance = { label: string; text: string; entity: string; tone: WashTone };

/** A chip's worth of news: "Washer 32 min" while it runs, "Dishwasher done" when the load is waiting to be unloaded. Nothing for an idle appliance. */
export function glanceOf(v: WashView, entity: string): Glance | undefined {
  const label = KIND_SHORT[v.kind] === "Appliance" ? v.name : KIND_SHORT[v.kind];
  if (v.loadInside) return { label, text: `${label} done`, entity, tone: "done" };
  if (v.state === "ending") return { label, text: `${label} almost done`, entity, tone: "run" };
  if (v.phase === "paused") return { label, text: `${label} paused`, entity, tone: "paused" };
  if (v.running) return { label, text: v.remainingMin !== undefined ? `${label} ${shortRemaining(v.remainingMin)}` : `${label} running`, entity, tone: "run" };
  return undefined;
}

/** A cycle has just ended: the last reading was a cycle under way and this one is done. Reloading the page (no earlier reading) never counts. */
export const cycleEnded = (prev: WashState | undefined, next: WashState): boolean => !!prev && ACTIVE.includes(prev) && ENDED.includes(next);

/** What the "it finished" toast says. */
export function finishNote(v: WashView): { title: string; message: string } {
  const what = LOAD[v.kind];
  return {
    title: `${v.name} is done`,
    message: v.loadInside ? `The ${what} is waiting to be taken out.` : v.state === "anti_wrinkle" ? "It is tumbling to keep the creases out." : "The cycle has finished.",
  };
}

// ---- what a device provides ------------------------------------------------------------------------------------------------------------------

const PROVIDES: [label: string, suffixes: string[]][] = [
  ["State", ["state"]], ["Progress", ["progress"]], ["Time left", ["time_remaining"]], ["Program", ["program", "current_phase"]], ["Power", ["current_power"]],
  ["Last cycle", ["last_cycle_duration", "last_cycle_energy", "last_cycle_cost"]], ["Totals", ["cycle_count", "energy_total"]], ["Maintenance", ["maintenance_due"]],
  ["Pause", ["pause_cycle", "resume_cycle"]], ["Force end", ["force_end_cycle"]], ["Mark unloaded", ["mark_unloaded"]], ["Program choice", ["cycle_program"]],
];

/** The short list of what linking a device gives the dashboard ("State", "Time left", "Pause"...), for the little chips in the inspector. Only what exists is listed. */
export function washProvides(dev: WashDevice): string[] {
  const have = new Set(dev.entities.map((e) => e.slice(e.indexOf(".") + dev.base.length + 2))); // "sensor.<base>_state" -> "state"
  return PROVIDES.filter(([, suffixes]) => suffixes.some((s) => have.has(s))).map(([label]) => label);
}
