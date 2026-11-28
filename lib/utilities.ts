// The Pipes model: lines of water, gas, drain and heating pipes drawn on the plan (`plan.utilities`), and the valves and meters (catalog kinds `ut_*`) that sit on them.
// A drawn model, not an engineered plan: it only has to be good enough to say where a leak or gas alarm is likely fed from and which valve stops it. This file is the data
// (kinds, reading a saved plan safely, the edits); the graph and the trace are lib/utilitiesGraph.ts. Pure: the node test runner loads this file directly.
import { isRecord } from "./guards.ts";
import type { Pt } from "./types.ts";

export const UTILITY_KINDS = ["cold", "hot", "gas", "drain", "heating"] as const;
export type UtilityKind = (typeof UTILITY_KINDS)[number];
/** What a pipe carries, for tracing: cold and hot water are one network, gas another. Drain and heating pipes are drawn but never traced (nothing to shut off). */
export type Medium = "water" | "gas";

export type UtilityLine = {
  id: string;
  kind: UtilityKind;
  /** The corner points in plan metres, first to last. */
  pts: Pt[];
  /** The level it runs on (absent = the first level). */
  level?: string;
  /** Height of the pipe above that level's floor, in metres (absent = the kind's usual height). */
  h?: number;
  /** Pipe diameter in metres (absent = the kind's usual size). */
  width?: number;
  name?: string;
};

type KindInfo = { label: string; color: string; width: number; h: number; medium?: Medium; hint: string };

/** The colours are the conventional ones (blue cold, red hot, yellow gas, grey drain) and stay physical: they are not theme colours. */
export const KINDS: Record<UtilityKind, KindInfo> = {
  cold: { label: "Cold water", color: "#3b8fe8", width: 0.022, h: 0.12, medium: "water", hint: "The supply from the main valve to taps and appliances" },
  hot: { label: "Hot water", color: "#e8503b", width: 0.022, h: 0.2, medium: "water", hint: "From the boiler or heater to taps" },
  gas: { label: "Gas", color: "#f2c230", width: 0.028, h: 0.3, medium: "gas", hint: "From the gas valve to the boiler, hob or fire" },
  drain: { label: "Drain", color: "#8a93a0", width: 0.05, h: 0.05, hint: "Waste water going out; drawn only, never shut off" },
  heating: { label: "Heating pipe", color: "#ee8a3d", width: 0.02, h: 0.16, hint: "Radiator flow and return; drawn only" },
};

export const mediumOf = (kind: UtilityKind): Medium | undefined => KINDS[kind].medium;

/** Where a pipe usually runs: the three heights the editor offers. */
export const HEIGHTS: readonly { id: string; label: string; h: number }[] = [
  { id: "floor", label: "Along the floor", h: 0.1 },
  { id: "wall", label: "Along the wall", h: 1.0 },
  { id: "ceiling", label: "Along the ceiling", h: 2.4 },
];

export const WIDTH_RANGE = { min: 0.01, max: 0.2 } as const;
export const H_RANGE = { min: 0, max: 8 } as const;
export const MAX_LINES = 100;
export const MAX_POINTS = 40; // per line
const MAX_TOTAL_POINTS = 1500; // the whole plan: bounds the graph a hostile file could make
const COORD = 1000; // metres either side of the origin
const NAME_MAX = 60;
const ID = /^[A-Za-z0-9_-]{1,60}$/;

export const widthOf = (l: Pick<UtilityLine, "kind" | "width">): number => l.width ?? KINDS[l.kind].width;
export const heightOf = (l: Pick<UtilityLine, "kind" | "h">): number => l.h ?? KINDS[l.kind].h;

const round2 = (n: number) => Math.round(n * 100) / 100;
const clampTo = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

function ptOf(raw: unknown): Pt | undefined {
  if (!isRecord(raw)) return undefined;
  const { x, y } = raw;
  return typeof x === "number" && typeof y === "number" && Math.abs(x) <= COORD && Math.abs(y) <= COORD ? { x: round2(x), y: round2(y) } : undefined;
}

/** A line from untrusted JSON: kind and id valid, at least two distinct points (repeats in a row are dropped), numbers inside their ranges. Undefined when it is not a line. */
export function lineOf(raw: unknown): UtilityLine | undefined {
  if (!isRecord(raw) || typeof raw.id !== "string" || !ID.test(raw.id)) return undefined;
  const kind = UTILITY_KINDS.find((k) => k === raw.kind);
  if (!kind || !Array.isArray(raw.pts)) return undefined;
  const pts: Pt[] = [];
  for (const r of raw.pts.slice(0, MAX_POINTS)) {
    const p = ptOf(r);
    const last = pts[pts.length - 1];
    if (p && !(last && last.x === p.x && last.y === p.y)) pts.push(p);
  }
  if (pts.length < 2) return undefined;
  const name = typeof raw.name === "string" ? raw.name.replace(/[\u0000-\u001f\u007f<>]/g, " ").replace(/\s+/g, " ").trim().slice(0, NAME_MAX) : "";
  const level = typeof raw.level === "string" && ID.test(raw.level) ? raw.level : undefined;
  const width = typeof raw.width === "number" && Number.isFinite(raw.width) ? round2(clampTo(raw.width, WIDTH_RANGE.min, WIDTH_RANGE.max) * 1000) / 1000 : undefined;
  const h = typeof raw.h === "number" && Number.isFinite(raw.h) ? round2(clampTo(raw.h, H_RANGE.min, H_RANGE.max)) : undefined;
  return { id: raw.id, kind, pts, ...(level ? { level } : {}), ...(h !== undefined ? { h } : {}), ...(width !== undefined ? { width } : {}), ...(name ? { name } : {}) };
}

/** The lines of a plan read from untrusted JSON: bad ones and repeated ids dropped, the count and the total number of points capped. Undefined when none is left. */
export function sanitizeUtilities(raw: unknown): UtilityLine[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const seen = new Set<string>();
  const out: UtilityLine[] = [];
  let points = 0;
  for (const r of raw) {
    const line = lineOf(r);
    if (!line || seen.has(line.id) || out.length >= MAX_LINES || points + line.pts.length > MAX_TOTAL_POINTS) continue;
    seen.add(line.id);
    points += line.pts.length;
    out.push(line);
  }
  return out.length ? out : undefined;
}

/** A plan loaded from anywhere (storage, the server, a file): its pipes are made valid. The same plan object when they already are; a plan without pipes stays without. */
export function withUtilities<P extends { utilities?: UtilityLine[] }>(plan: P): P {
  if (plan.utilities === undefined) return plan;
  const clean = sanitizeUtilities(plan.utilities);
  if (JSON.stringify(clean) === JSON.stringify(plan.utilities)) return plan;
  const { utilities: _dropped, ...rest } = plan;
  return (clean ? { ...rest, utilities: clean } : rest) as P;
}

// ---- edits -----------------------------------------------------------------------------------------------------------------------------------------------

type Holder = { utilities?: UtilityLine[] };
const linesOf = (plan: Holder): UtilityLine[] => plan.utilities ?? [];

function withLines<P extends Holder>(plan: P, lines: UtilityLine[]): P {
  const { utilities: _old, ...rest } = plan;
  return (lines.length ? { ...rest, utilities: lines } : rest) as P;
}

/** A line id the plan does not use yet. */
export function newLineId(plan: Holder, random: () => number = Math.random): string {
  const taken = new Set(linesOf(plan).map((l) => l.id));
  for (;;) {
    const id = `pipe-${Math.floor(random() * 0xffffff).toString(36)}`;
    if (!taken.has(id)) return id;
  }
}

/** Add a line. An unusable one (fewer than two points, a repeated id, too many lines) leaves the plan as it was. */
export function addLine<P extends Holder>(plan: P, line: UtilityLine): P {
  const clean = lineOf(line);
  if (!clean || linesOf(plan).length >= MAX_LINES || linesOf(plan).some((l) => l.id === clean.id)) return plan;
  return withLines(plan, sanitizeUtilities([...linesOf(plan), clean]) ?? linesOf(plan));
}

/** Change a line (never its id). A change that would make it invalid leaves the plan as it was. */
export function patchLine<P extends Holder>(plan: P, id: string, patch: Partial<Omit<UtilityLine, "id">>): P {
  const old = linesOf(plan).find((l) => l.id === id);
  if (!old) return plan;
  const merged: Record<string, unknown> = { ...old, ...patch, id };
  for (const key of Object.keys(merged)) if (merged[key] === undefined) delete merged[key]; // a patch of `undefined` clears an optional field
  const next = lineOf(merged);
  if (!next || JSON.stringify(next) === JSON.stringify(old)) return plan;
  return withLines(plan, linesOf(plan).map((l) => (l.id === id ? next : l)));
}

export function removeLine<P extends Holder>(plan: P, id: string): P {
  return linesOf(plan).some((l) => l.id === id) ? withLines(plan, linesOf(plan).filter((l) => l.id !== id)) : plan;
}

/** Move every point of a line by (dx, dy). */
export function moveLine<P extends Holder>(plan: P, id: string, dx: number, dy: number): P {
  const old = linesOf(plan).find((l) => l.id === id);
  return old ? patchLine(plan, id, { pts: old.pts.map((p) => ({ x: p.x + dx, y: p.y + dy })) }) : plan;
}

/** Move one corner of a line. */
export function movePoint<P extends Holder>(plan: P, id: string, index: number, to: Pt): P {
  const old = linesOf(plan).find((l) => l.id === id);
  return old && index >= 0 && index < old.pts.length ? patchLine(plan, id, { pts: old.pts.map((p, i) => (i === index ? to : p)) }) : plan;
}

/** Add a corner in the middle of segment `segment` (between points `segment` and `segment + 1`). */
export function splitSegment<P extends Holder>(plan: P, id: string, segment: number): P {
  const old = linesOf(plan).find((l) => l.id === id);
  const a = old?.pts[segment];
  const b = old?.pts[segment + 1];
  return old && a && b ? patchLine(plan, id, { pts: [...old.pts.slice(0, segment + 1), { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, ...old.pts.slice(segment + 1)] }) : plan;
}

/** Swap the first and last point order. */
export function reverseLine<P extends Holder>(plan: P, id: string): P {
  const old = linesOf(plan).find((l) => l.id === id);
  return old ? patchLine(plan, id, { pts: [...old.pts].reverse() }) : plan;
}

/** The same line again, nudged aside so it can be seen and picked, with a new id. */
export function duplicateLine<P extends Holder>(plan: P, id: string, newId: string): P {
  const old = linesOf(plan).find((l) => l.id === id);
  return old ? addLine(plan, { ...old, id: newId, pts: old.pts.map((p) => ({ x: p.x + 0.3, y: p.y + 0.3 })) }) : plan;
}

/** The plan without the pipes of a level (when the level is deleted). */
export function dropLevelLines<P extends Holder>(plan: P, levelId: string, firstLevelId: string): P {
  const keep = linesOf(plan).filter((l) => (l.level ?? firstLevelId) !== levelId);
  return keep.length === linesOf(plan).length ? plan : withLines(plan, keep);
}

// ---- the valves and meters (catalog kinds) -----------------------------------------------------------------------------------------------------------------

export type ValveRole = "main" | "zone" | "valve" | "meter";

type ValveInfo = { medium: Medium; role: ValveRole };

/** The catalog kinds that sit on a pipe. `main` is where the supply enters the home: the source a trace ends at. `zone` and `valve` isolate one part. A `meter` only reads. */
export const VALVE_KINDS: Record<string, ValveInfo> = {
  ut_water_main: { medium: "water", role: "main" },
  ut_water_valve: { medium: "water", role: "valve" },
  ut_water_smart: { medium: "water", role: "valve" },
  ut_zone_valve: { medium: "water", role: "zone" },
  ut_water_usage: { medium: "water", role: "meter" },
  ut_gas_main: { medium: "gas", role: "main" },
  ut_gas_usage: { medium: "gas", role: "meter" },
};

export const valveInfo = (kind: string): ValveInfo | undefined => (Object.hasOwn(VALVE_KINDS, kind) ? VALVE_KINDS[kind] : undefined);

/** Home Assistant domains a valve or shut-off item can be linked to: the valve domain, or a switch (Zigbee and Z-Wave water shut-off devices are switches); a meter links to a sensor. */
export function utilityDomains(kind: string): string[] | undefined {
  const info = valveInfo(kind);
  if (!info) return undefined;
  return info.role === "meter" ? ["sensor"] : ["valve", "switch"];
}

/** What each kind is called in a sentence ("Close the main water valve?"). */
export const VALVE_LABEL: Record<string, string> = {
  ut_water_main: "main water valve",
  ut_water_valve: "water valve",
  ut_water_smart: "smart water valve",
  ut_zone_valve: "zone valve",
  ut_water_usage: "water meter",
  ut_gas_main: "gas valve",
  ut_gas_usage: "gas meter",
};
