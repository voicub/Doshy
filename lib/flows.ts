// Live flows between items (solar -> inverter -> house / battery / grid / EV ...): pure maths. Reading units, smoothing, particle speed and density,
// colours, routing of the drawn path, the "connect my energy system" proposal, and the totals behind the energy panel. No React, no three.js.
import { CATALOG } from "./catalog.ts";
import { itemExtent } from "./editMath.ts";
import { floorY, levelIdOf } from "./levels.ts";
import { lerp, type V3 } from "./mathUtil.ts";
import { uid } from "./uid.ts";
import type { Flow, FlowKind, Item, Plan, Wall } from "./types.ts";

type P2 = [number, number];
/** The bits of a Home Assistant state this module reads. */
export type StateLike = { entity_id?: string; state: string; attributes?: { unit_of_measurement?: string; device_class?: string; friendly_name?: string } };
export type States = Record<string, StateLike>;

// ---- what an item is in the energy system -------------------------------------------------------------------------

export type EnergyRole = "solar" | "inverter" | "battery" | "meter" | "board" | "charger" | "car";
// first match wins: "solar_inverter" is an inverter, "ev_charger" a charger, "solar_panel" is not a distribution board
const ROLES: [EnergyRole, RegExp][] = [
  ["charger", /charger|wallbox|evse/],
  ["inverter", /inverter/],
  ["solar", /solar|photovoltaic|(^|[_ ])pv([_ ]|$)/],
  ["battery", /batter|powerwall/],
  ["meter", /meter|(^|[_ ])grid([_ ]|$)|utility/],
  ["board", /fuse|breaker|distribution|switchboard|(house|main|electric\w*)[_ ]?(board|panel)/],
  ["car", /(^|[_ ])(car|ev|vehicle|tesla|suv|sedan)([_ ]|$)/],
];
/** Energy role of a catalog kind, guessed from its id and label (any naming works: "solar_panel", "Grid meter", "ev_wallbox" ...). */
export function roleOf(kind: string): EnergyRole | null {
  const text = `${kind} ${CATALOG[kind]?.label ?? ""}`.toLowerCase();
  return ROLES.find(([, re]) => re.test(text))?.[0] ?? null;
}

// ---- readings -----------------------------------------------------------------------------------------------------

const UNIT_W: Record<string, number> = { mW: 0.001, W: 1, kW: 1000, MW: 1e6, GW: 1e9 };
const isPowerUnit = (unit?: string) => !!unit && Object.hasOwn(UNIT_W, unit);
/** A sensor that reports power (W / kW ...): what a flow can carry. */
export const isPowerSensor = (st: StateLike) => (st.entity_id ?? "").startsWith("sensor.") && isPowerUnit(st.attributes?.unit_of_measurement);

/** Watts of a power sensor whatever its unit (W, kW ...); a sensor with no unit is taken as watts. Undefined when unavailable, not a number, or not a power unit. */
export function readWatts(st?: StateLike): number | undefined {
  if (!st || st.state.trim() === "") return undefined;
  const unit = st.attributes?.unit_of_measurement || "W";
  const n = Number(st.state);
  return Object.hasOwn(UNIT_W, unit) && Number.isFinite(n) ? n * UNIT_W[unit] : undefined;
}

/** Signed watts of a flow: positive = from -> to. `invert` flips sensors that report the other way. Undefined when there is no usable reading. */
export function flowWatts(f: Flow, states: States): number | undefined {
  const w = f.entity ? readWatts(states[f.entity]) : undefined;
  return w === undefined ? undefined : f.invert && w !== 0 ? -w : w;
}

/** Below this many watts a line is idle: dim, no motion. */
const IDLE_W = 15;
export const isIdle = (w?: number) => w === undefined || Math.abs(w) < IDLE_W;
/** Seconds the shown value takes to catch up with a new reading. */
const SMOOTH_TAU = 1.1;
/** Exponential easing toward a new reading (frame-rate independent); snaps when within half a watt. */
export function smoothTo(cur: number, target: number, dt: number, tau = SMOOTH_TAU): number {
  const d = target - cur;
  return Math.abs(d) < 0.5 ? target : cur + d * (1 - Math.exp(-Math.max(0, dt) / tau));
}

/** 0..1 on a log scale: idle = 0, 15 kW = 1, so 50 W (0.17) and 5 kW (0.84) both read well. */
export const intensity = (w: number) => Math.min(1, Math.max(0, Math.log10(Math.max(Math.abs(w), IDLE_W) / IDLE_W) / 3));

export type Pulse = { speed: number; spacing: number; size: number; alpha: number };
/** How a flow of `w` watts looks: particle speed (m/s), gap between particles (m), particle size (m) and line opacity. */
export function pulseOf(w?: number): Pulse {
  if (w === undefined || isIdle(w)) return { speed: 0, spacing: 1.2, size: 0.035, alpha: 0.16 };
  const t = intensity(w);
  return { speed: 0.3 + 1.2 * t, spacing: 1 / (0.8 + 2.4 * t), size: 0.035 + 0.03 * t, alpha: 0.32 + 0.28 * t };
}

/** "2.4 kW", "350 W", "12 kW"; sign is shown by the animation, so this is the magnitude. */
export function formatPower(w?: number): string {
  if (w === undefined) return "n/a";
  const a = Math.abs(w);
  if (a < IDLE_W) return "0 W";
  if (a < 1000) return `${Math.round(a)} W`;
  const k = a / 1000;
  return `${k >= 10 ? Math.round(k) : k.toFixed(1)} kW`;
}

// ---- colours ------------------------------------------------------------------------------------------------------

type Tone = "generation" | "consumption" | "export" | "import";
export const TONE_COLOR: Record<Tone, string> = { generation: "#3df2c4", consumption: "#ffb347", export: "#5aa0ff", import: "#ff7a45" };
const KIND_COLOR: Record<Exclude<FlowKind, "power">, string> = { water: "#5ad7ff", gas: "#ffe066", data: "#b9c7d3" };

/** Colour class of power moving from `src` to `dst`: from the grid = import, into it = export, out of panels / inverter / battery = generation, the rest = consumption. */
export function toneOf(src: EnergyRole | null, dst: EnergyRole | null): Tone {
  if (src === "meter") return "import";
  if (dst === "meter") return "export";
  return src === "solar" || src === "inverter" || src === "battery" ? "generation" : "consumption";
}
export const flowColor = (kind: FlowKind | undefined, tone: Tone) => (kind && kind !== "power" ? KIND_COLOR[kind] : TONE_COLOR[tone]);

/** Source and destination role after the sign is applied (negative power runs backwards). */
export function effectiveRoles(from: EnergyRole | null, to: EnergyRole | null, w: number | undefined): { src: EnergyRole | null; dst: EnergyRole | null } {
  return w !== undefined && w < 0 ? { src: to, dst: from } : { src: from, dst: to };
}

/** Panels (as source) or a charger / car (as destination) measured with a negative sign means the sensor counts the other way: flip it for the user. Two-way pairs (grid, battery) keep their sign. */
export const autoInvert = (from: EnergyRole | null, to: EnergyRole | null, w: number | undefined): boolean =>
  w !== undefined && w <= -IDLE_W && (from === "solar" || to === "charger" || to === "car");

// ---- flows of a plan ----------------------------------------------------------------------------------------------

export const itemById = (plan: Plan, id: string) => plan.items.find((i) => i.id === id);
export const itemLabel = (it: Item) => CATALOG[it.kind]?.label ?? it.kind;
/** Flows whose two items still exist (a flow outlives nothing: removing an item removes its flows, this only guards against hand-edited plans). */
export const flowsOf = (plan: Plan): Flow[] => (plan.flows ?? []).filter((f) => f.from !== f.to && itemById(plan, f.from) && itemById(plan, f.to));

/** Drop flows that lost an item. Same plan object when none did. */
export function dropOrphanFlows(plan: Plan): Plan {
  if (!plan.flows?.length) return plan;
  const keep = flowsOf(plan);
  return keep.length === plan.flows.length ? plan : { ...plan, flows: keep };
}
/** Add a flow between two existing, different items; the plan comes back unchanged otherwise. */
export function addFlowTo(plan: Plan, f: Omit<Flow, "id">, newId: () => string = uid): { plan: Plan; id: string | null } {
  if (f.from === f.to || !itemById(plan, f.from) || !itemById(plan, f.to)) return { plan, id: null };
  const id = newId();
  return { plan: { ...plan, flows: [...(plan.flows ?? []), { ...f, id }] }, id };
}
export const patchFlowIn = (plan: Plan, id: string, p: Partial<Omit<Flow, "id">>): Plan =>
  plan.flows?.some((f) => f.id === id) ? { ...plan, flows: plan.flows.map((f) => (f.id === id ? { ...f, ...p } : f)) } : plan;
export const removeFlowFrom = (plan: Plan, id: string): Plan => (plan.flows?.some((f) => f.id === id) ? { ...plan, flows: plan.flows.filter((f) => f.id !== id) } : plan);

// ---- routing ------------------------------------------------------------------------------------------------------

/** Where a flow attaches to an item: its centre, at mid height, in world metres (level elevation included). */
function itemAnchor(plan: Plan, it: Item): V3 {
  const lv = floorY(plan, it);
  const def = CATALOG[it.kind];
  if (!def) return [it.x, lv + 0.5, it.y];
  const { y0, y1 } = itemExtent(def, it);
  return [it.x, lv + (y0 + y1) / 2, it.y];
}

const orient = (a: P2, b: P2, c: P2) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
const crosses = (a: P2, b: P2, w: Wall) => {
  const c: P2 = [w.a.x, w.a.y];
  const d: P2 = [w.b.x, w.b.y];
  return orient(a, b, c) * orient(a, b, d) < 0 && orient(c, d, a) * orient(c, d, b) < 0;
};
/** How many walls the plan-view segment a-b crosses. */
export const wallCrossings = (walls: Wall[], a: P2, b: P2) => walls.reduce((n, w) => n + (crosses(a, b, w) ? 1 : 0), 0);

const dist = (a: V3, b: V3) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

/** Round every corner of a polyline with a small quadratic curve (radius `r`, shrunk to fit short legs). */
function roundCorners(pts: V3[], r: number, steps = 6): V3[] {
  if (pts.length < 3) return pts;
  const out: V3[] = [pts[0]];
  for (let i = 1; i < pts.length - 1; i++) {
    const [p0, p1, p2] = [pts[i - 1], pts[i], pts[i + 1]];
    const d1 = dist(p0, p1);
    const d2 = dist(p1, p2);
    const rr = Math.min(r, d1 / 2, d2 / 2);
    if (rr < 1e-6) { out.push(p1); continue; }
    const a: V3 = [lerp(p1[0], p0[0], rr / d1), lerp(p1[1], p0[1], rr / d1), lerp(p1[2], p0[2], rr / d1)];
    const b: V3 = [lerp(p1[0], p2[0], rr / d2), lerp(p1[1], p2[1], rr / d2), lerp(p1[2], p2[2], rr / d2)];
    for (let s = 0; s <= steps; s++) {
      const t = s / steps;
      const u = 1 - t;
      out.push([u * u * a[0] + 2 * u * t * p1[0] + t * t * b[0], u * u * a[1] + 2 * u * t * p1[1] + t * t * b[1], u * u * a[2] + 2 * u * t * p1[2] + t * t * b[2]]);
    }
  }
  out.push(pts[pts.length - 1]);
  return out;
}

export type Path = { pts: V3[]; cum: number[]; len: number };
export function makePath(pts: V3[]): Path {
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + dist(pts[i - 1], pts[i]));
  return { pts, cum, len: cum[cum.length - 1] };
}
/** Point at distance `s` along the path (clamped); with `tan` also the unit direction of travel there. */
export function pointAt(p: Path, s: number, out: V3 = [0, 0, 0], tan?: V3): V3 {
  const n = p.pts.length;
  if (n < 2) return (out[0] = p.pts[0]?.[0] ?? 0, out[1] = p.pts[0]?.[1] ?? 0, out[2] = p.pts[0]?.[2] ?? 0, out);
  const d = Math.min(p.len, Math.max(0, s));
  let lo = 0;
  let hi = n - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (p.cum[mid] <= d) lo = mid;
    else hi = mid;
  }
  const a = p.pts[lo];
  const b = p.pts[lo + 1];
  const seg = p.cum[lo + 1] - p.cum[lo];
  const t = seg > 1e-9 ? (d - p.cum[lo]) / seg : 0;
  out[0] = lerp(a[0], b[0], t);
  out[1] = lerp(a[1], b[1], t);
  out[2] = lerp(a[2], b[2], t);
  if (tan) {
    const l = seg || 1;
    tan[0] = (b[0] - a[0]) / l;
    tan[1] = (b[1] - a[1]) / l;
    tan[2] = (b[2] - a[2]) / l;
  }
  return out;
}

/** Cut `start` metres off the beginning and `end` off the end (nothing is cut when the path is too short for it). */
function trimPath(pts: V3[], start: number, end: number): V3[] {
  const p = makePath(pts);
  if (p.len < start + end + 0.2) return pts;
  const inner = pts.filter((_, i) => p.cum[i] > start && p.cum[i] < p.len - end);
  return [pointAt(p, start), ...inner, pointAt(p, p.len - end)];
}

const CORNER_R = 0.45;
const ARC_STEPS = 18;
/** Items closer than this (plan metres) are joined by a straight line. */
const NEAR = 0.4;

/**
 * The line drawn between two items. Different levels: straight up or down through the floor, along the slab between them. Same level:
 * a smooth arc when nothing is in the way; otherwise the straight line, or an L along the walls, whichever crosses fewer walls.
 */
export function routeFlow(plan: Plan, a: Item, b: Item): V3[] {
  const pa = itemAnchor(plan, a);
  const pb = itemAnchor(plan, b);
  const done = (pts: V3[]) => trimPath(pts, Math.min(0.5, Math.min(a.w, a.d) / 2), Math.min(0.5, Math.min(b.w, b.d) / 2));
  const flat = Math.hypot(pa[0] - pb[0], pa[2] - pb[2]);
  if (levelIdOf(plan, a) !== levelIdOf(plan, b)) {
    const mid = (pa[1] + pb[1]) / 2;
    if (flat < 0.05) return done([pa, pb]);
    return done(roundCorners([pa, [pa[0], mid, pa[2]], [pb[0], mid, pb[2]], pb], CORNER_R));
  }
  if (flat < NEAR) return done([pa, pb]);
  const level = levelIdOf(plan, a);
  const walls = plan.walls.filter((w) => levelIdOf(plan, w) === level);
  const A: P2 = [pa[0], pa[2]];
  const B: P2 = [pb[0], pb[2]];
  const straight = wallCrossings(walls, A, B);
  if (straight === 0) {
    const lift = Math.min(0.6, Math.max(0.1, flat * 0.1));
    const c: V3 = [(pa[0] + pb[0]) / 2, (pa[1] + pb[1]) / 2 + 2 * lift, (pa[2] + pb[2]) / 2];
    const arc: V3[] = [];
    for (let s = 0; s <= ARC_STEPS; s++) {
      const t = s / ARC_STEPS;
      const u = 1 - t;
      arc.push([u * u * pa[0] + 2 * u * t * c[0] + t * t * pb[0], u * u * pa[1] + 2 * u * t * c[1] + t * t * pb[1], u * u * pa[2] + 2 * u * t * c[2] + t * t * pb[2]]);
    }
    return done(arc);
  }
  // an L: corner at (b.x, a.z) or (a.x, b.z); its height is where it falls along the way
  const corner = (x: number, z: number): V3 => {
    const d1 = Math.hypot(x - pa[0], z - pa[2]);
    const d2 = Math.hypot(pb[0] - x, pb[2] - z);
    return [x, lerp(pa[1], pb[1], d1 / (d1 + d2 || 1)), z];
  };
  const c1 = corner(pb[0], pa[2]);
  const c2 = corner(pa[0], pb[2]);
  const n1 = wallCrossings(walls, A, [c1[0], c1[2]]) + wallCrossings(walls, [c1[0], c1[2]], B);
  const n2 = wallCrossings(walls, A, [c2[0], c2[2]]) + wallCrossings(walls, [c2[0], c2[2]], B);
  if (Math.min(n1, n2) >= straight) return done([pa, pb]);
  return done(roundCorners([pa, n1 <= n2 ? c1 : c2, pb], CORNER_R));
}

// ---- guessing entities --------------------------------------------------------------------------------------------

/** Keywords (best first) the name of the power sensor for each kind of link probably contains. */
const WORDS: Record<string, string[]> = {
  "solar>inverter": ["solar", "pv", "panel", "production", "generation", "dc"],
  "solar>board": ["solar", "pv", "production", "generation"],
  "inverter>battery": ["battery", "storage", "charge"],
  "inverter>board": ["inverter", "output", "house", "home", "load", "consumption", "ac"],
  "board>charger": ["charger", "wallbox", "ev", "car"],
  "charger>car": ["charger", "wallbox", "ev", "car"],
  "meter>board": ["grid", "import", "meter", "mains"],
  "meter>inverter": ["grid", "import", "meter", "mains"],
};
export const wordsFor = (from: EnergyRole | null, to: EnergyRole | null) => WORDS[`${from}>${to}`] ?? [];

/** Every power sensor, best name match for `words` first (earlier words count more, a `power` device class breaks ties), then by id; `taken` sensors are left out. `matched` = how many fit at all. */
export function rankPowerEntities(states: States, words: readonly string[], taken: ReadonlySet<string> = new Set()): { ids: string[]; matched: number } {
  const scored = Object.entries(states)
    .filter(([id, st]) => !taken.has(id) && isPowerSensor({ ...st, entity_id: id }))
    .map(([id, st]) => {
      const hay = `${id} ${st.attributes?.friendly_name ?? ""}`.toLowerCase();
      const hit = words.reduce((s, w, i) => s + (hay.includes(w) ? words.length - i : 0), 0);
      return { id, hit, score: hit && hit + (st.attributes?.device_class === "power" ? 0.5 : 0) };
    })
    .sort((a, b) => b.score - a.score || a.id.length - b.id.length || a.id.localeCompare(b.id));
  return { ids: scored.map((s) => s.id), matched: scored.filter((s) => s.hit).length };
}
/** The power sensor whose name best matches `words`; undefined when none fits. */
export const guessPowerEntity = (states: States, words: readonly string[], taken: ReadonlySet<string> = new Set()): string | undefined => {
  const { ids, matched } = rankPowerEntities(states, words, taken);
  return matched ? ids[0] : undefined;
};

/** The sensor holding a home battery's charge in percent (state of charge): "soc" or "state of charge" in the name beats a plain "battery" with storage / capacity words. */
export function guessSocEntity(states: States, taken: ReadonlySet<string> = new Set()): string | undefined {
  let best: { id: string; score: number } | undefined;
  for (const [id, st] of Object.entries(states)) {
    if (taken.has(id) || !id.startsWith("sensor.") || st.attributes?.unit_of_measurement !== "%") continue;
    const hay = `${id} ${st.attributes?.friendly_name ?? ""}`.toLowerCase();
    const score = /soc|state[_ ]of[_ ]charge/.test(hay) ? 3 : /batter/.test(hay) && /capacity|level|charge|storage|inverter|home|house|pack/.test(hay) ? 2 : 0;
    if (score && (!best || score > best.score)) best = { id, score };
  }
  return best?.id;
}

export type Proposal = { from: string; to: string; fromRole: EnergyRole; toRole: EnergyRole; entity?: string };

const planDist = (a: Item, b: Item) => Math.hypot(a.x - b.x, a.y - b.y);
const nearest = (it: Item, list: Item[]) => list.reduce<Item | undefined>((best, c) => (!best || planDist(it, c) < planDist(it, best) ? c : best), undefined);

/**
 * The standard wiring of the energy items found in the plan: panels -> inverter -> battery, inverter -> house board, board -> EV charger -> car,
 * grid meter -> board. Missing pieces are skipped (no board: the inverter is the hub); links that already exist are not proposed again.
 * With `states`, each link gets the best-matching power sensor, never the same one twice.
 */
export function proposeFlows(plan: Plan, states: States = {}): Proposal[] {
  const by = (r: EnergyRole) => plan.items.filter((i) => roleOf(i.kind) === r);
  const [solar, inverters, batteries, meters, boards, chargers, cars] = (["solar", "inverter", "battery", "meter", "board", "charger", "car"] as const).map(by);
  const linked = new Set((plan.flows ?? []).map((f) => [f.from, f.to].sort().join("|")));
  const out: Proposal[] = [];
  const add = (from: Item | undefined, to: Item | undefined) => {
    const [fromRole, toRole] = [from && roleOf(from.kind), to && roleOf(to.kind)];
    if (!from || !to || !fromRole || !toRole) return;
    const key = [from.id, to.id].sort().join("|");
    if (linked.has(key)) return;
    linked.add(key);
    out.push({ from: from.id, to: to.id, fromRole, toRole });
  };
  const hubFor = (it: Item) => nearest(it, boards) ?? nearest(it, inverters);
  for (const s of solar) add(s, nearest(s, inverters) ?? nearest(s, boards));
  for (const b of batteries) add(nearest(b, inverters) ?? nearest(b, boards), b);
  for (const i of inverters) add(i, nearest(i, boards));
  for (const c of chargers) add(hubFor(c), c);
  for (const car of cars) add(nearest(car, chargers), car);
  for (const m of meters) add(m, hubFor(m));
  const taken = new Set<string>();
  return out.map((p) => {
    const entity = guessPowerEntity(states, wordsFor(p.fromRole, p.toRole), taken);
    if (entity) taken.add(entity);
    return { ...p, entity };
  });
}

// ---- totals for the energy panel ----------------------------------------------------------------------------------

export type Summary = {
  /** False when no flow of the plan has a usable reading: the panel shows its empty state. */
  live: boolean;
  productionW: number;
  importW: number;
  exportW: number;
  /** Positive = charging, negative = discharging. */
  batteryW: number;
  evW: number;
  /** House load without the car. */
  homeW: number;
  /** Share of the solar production used on site (not exported), percent. Undefined without production. */
  selfPct?: number;
  /** Average state of charge of the batteries that have a charge sensor, percent. */
  soc?: number;
};

const SOC_KEY = "soc";
const readNumber = (st?: StateLike) => (st && st.state.trim() !== "" && Number.isFinite(Number(st.state)) ? Number(st.state) : undefined);
/** State of charge (0-100 %) of a battery item from its `params.soc` sensor; undefined when none is linked or the reading is unusable. */
export function socOf(it: Item, states: States): number | undefined {
  const entity = it.params?.[SOC_KEY];
  const v = typeof entity === "string" ? readNumber(states[entity]) : undefined;
  return v !== undefined && v >= 0 && v <= 100 ? v : undefined;
}

export function summarize(plan: Plan, states: States): Summary {
  let live = false;
  let solarMeasured = false;
  const sum = (match: (src: EnergyRole | null, dst: EnergyRole | null) => boolean, flows: { src: EnergyRole | null; dst: EnergyRole | null; w: number }[]) => flows.filter((f) => match(f.src, f.dst)).reduce((s, f) => s + f.w, 0);
  const flows = flowsOf(plan).flatMap((f) => {
    const w = flowWatts(f, states);
    if (w === undefined) return [];
    live = true;
    const [from, to] = [itemById(plan, f.from), itemById(plan, f.to)];
    if (!from || !to) return [];
    const { src, dst } = effectiveRoles(roleOf(from.kind), roleOf(to.kind), w);
    solarMeasured ||= src === "solar" || dst === "solar";
    return Math.abs(w) < IDLE_W || (f.kind && f.kind !== "power") ? [] : [{ src, dst, w: Math.abs(w) }];
  });
  // panels measured directly are the production; without them, what the inverter hands to the house is the best estimate
  const productionW = solarMeasured ? sum((s) => s === "solar", flows) : sum((s, d) => s === "inverter" && d !== "battery" && d !== "inverter" && d !== "meter", flows);
  const importW = sum((s) => s === "meter", flows);
  const exportW = sum((_, d) => d === "meter", flows);
  const charge = sum((_, d) => d === "battery", flows);
  const discharge = sum((s) => s === "battery", flows);
  const evW = sum((_, d) => d === "charger", flows) || sum((_, d) => d === "car", flows);
  const homeW = Math.max(0, productionW + importW + discharge - exportW - charge - evW);
  const socs = plan.items.filter((i) => roleOf(i.kind) === "battery").map((i) => socOf(i, states)).filter((v): v is number => v !== undefined);
  return {
    live,
    productionW,
    importW,
    exportW,
    batteryW: charge - discharge,
    evW,
    homeW,
    selfPct: productionW >= IDLE_W ? Math.min(100, Math.max(0, ((productionW - exportW) / productionW) * 100)) : undefined,
    soc: socs.length ? socs.reduce((a, b) => a + b, 0) / socs.length : undefined,
  };
}

/** `w` = width in the diagram (both sides add up to the same total), `value` = the measured watts. */
export type SankeyNode = { id: "solar" | "battery" | "grid" | "home" | "ev" | "export" | "charge"; w: number; value: number };
export type Sankey = { sources: SankeyNode[]; sinks: SankeyNode[]; links: { from: SankeyNode["id"]; to: SankeyNode["id"]; w: number }[]; total: number };

/**
 * Where the power comes from and where it goes. Every source is spread over the sinks in proportion to their size (the usual Sankey
 * simplification), so the widths on both sides always add up to the same total.
 */
export function sankeyOf(s: Summary): Sankey {
  const keep = (n: SankeyNode) => n.w >= IDLE_W;
  const node = (id: SankeyNode["id"], w: number): SankeyNode => ({ id, w, value: w });
  const sinks = [node("home", s.homeW), node("ev", s.evW), node("charge", Math.max(0, s.batteryW)), node("export", s.exportW)].filter(keep);
  const sinkTotal = sinks.reduce((a, n) => a + n.w, 0);
  const raw = [node("solar", s.productionW), node("battery", Math.max(0, -s.batteryW)), node("grid", s.importW)].filter(keep);
  const rawTotal = raw.reduce((a, n) => a + n.w, 0);
  const total = Math.max(sinkTotal, rawTotal);
  if (!total) return { sources: [], sinks: [], links: [], total: 0 };
  // sources are scaled up to the sinks when something is not measured, sinks the other way: both sides always fill the same height
  const sources = raw.map((n) => ({ ...n, w: (n.w / (rawTotal || 1)) * total }));
  const fullSinks = sinks.length ? sinks.map((n) => ({ ...n, w: (n.w / sinkTotal) * total })) : [];
  const links = sources.flatMap((a) => fullSinks.map((b) => ({ from: a.id, to: b.id, w: (a.w * b.w) / total })));
  return { sources, sinks: fullSinks, links, total };
}
