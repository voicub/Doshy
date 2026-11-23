import type { HAState } from "./ha.ts";
import { findPath, makeRoute, pathToPark, pointAt, segmentAt, type Route, type World } from "./vacuumPath.ts";
import type { Pt } from "./types.ts";

// What the robot does for each Home Assistant vacuum state, and where it is while it does it. Pure: the 3D component only calls
// `stepDrive` every frame and copies the pose.

/** Real robots crawl at about this speed (m/s) ... */
const REAL_SPEED = 0.25;
/** ... shown this many times faster, so a lap of a flat takes minutes, not half an hour. */
const TIME_SCALE = 6;
export const SPEED = REAL_SPEED * TIME_SCALE;
/** With reduced motion the robot sits at the point a typical clean (30 min) / return (3 min) would have reached. */
const CLEAN_MS = 30 * 60_000;
const RETURN_MS = 3 * 60_000;
const TURN_RATE = 7; // rad/s
const BUMP_ANGLE = 1; // a turn sharper than this (rad) at a lane end is a bump into something
const LIVE_RATE = 5; // 1/s: how quickly the robot follows a reported position
const TELEPORT = 3; // m: a reported position further than this from the robot is a jump, not a drive

export type Mode = "docked" | "cleaning" | "returning" | "paused" | "error" | "idle" | "off";

export function modeOf(state: string | undefined): Mode {
  switch (state) {
    case "docked":
      return "docked";
    case "cleaning":
    case "on":
      return "cleaning";
    case "returning":
      return "returning";
    case "paused":
      return "paused";
    case "error":
      return "error";
    case "idle":
      return "idle";
    default:
      return "off";
  }
}

export type Drive = {
  x: number;
  y: number;
  /** plan angle of the nose (rad, atan2(dy, dx)) */
  heading: number;
  mode: Mode;
  route: Route | null;
  /** "clean": the lap of the flat, "go": a one-way trip home */
  kind: "clean" | "go" | null;
  /** metres driven along the route */
  s: number;
  /** next waypoint whose corner has not been passed yet */
  k: number;
  /** 1 right after a bump, fading to 0 */
  wiggle: number;
};

const angleOf = (hx: number, hy: number) => Math.atan2(hy, hx);
const turnToward = (a: number, b: number, max: number) => {
  const d = Math.atan2(Math.sin(b - a), Math.cos(b - a));
  return a + Math.max(-max, Math.min(max, d));
};

const faceDock = (w: World) => angleOf(w.face.x, w.face.y);

function parked(w: World): Drive {
  return { x: w.park.x, y: w.park.y, heading: faceDock(w), mode: "docked", route: null, kind: null, s: 0, k: 1, wiggle: 0 };
}

function follow(d: Drive, route: Route, kind: "clean" | "go", s: number): Drive {
  const p = pointAt(route, s);
  return { ...d, route, kind, s, k: segmentAt(route, s) + 1, x: p.x, y: p.y, heading: angleOf(p.hx, p.hy) };
}

/** The robot's pose when the page opens in `mode` and the state was last changed `sinceMs` ago. `reduced` picks fixed progress points instead of time-scaled driving. */
export function startDrive(w: World, mode: Mode, sinceMs: number, reduced = false): Drive {
  const base = { ...parked(w), mode };
  if (mode === "cleaning") {
    const s = reduced ? Math.min(sinceMs / CLEAN_MS, 0.95) * w.clean.len : ((Math.max(sinceMs, 0) / 1000) * SPEED) % w.clean.len;
    return follow(base, w.clean, "clean", s);
  }
  if (mode === "paused" || mode === "error") return follow(base, w.clean, "clean", w.clean.len * 0.35);
  if (mode === "returning") {
    const end = w.clean.pts[w.clean.pts.length - 1];
    const home = pathToPark(w, end);
    if (!home) return base;
    const route = makeRoute(home);
    const s = reduced ? Math.min(sinceMs / RETURN_MS, 0.95) * route.len : Math.min((Math.max(sinceMs, 0) / 1000) * SPEED, route.len * 0.9);
    return follow(base, route, "go", s);
  }
  return base;
}

/** Change of state: pick the route for the new mode, keeping the one in use when the robot is only pausing or finishing its way home. */
function enter(d: Drive, w: World, mode: Mode) {
  const prev = d.mode;
  d.mode = mode;
  if (mode === "cleaning") {
    if (prev === "paused" && d.kind === "clean" && d.route) return;
    const here = { x: d.x, y: d.y };
    // rejoin the lap at its nearest waypoint
    let k = 0;
    let best = Infinity;
    w.clean.pts.forEach((p, i) => {
      const dist = Math.hypot(p.x - here.x, p.y - here.y);
      if (dist < best) (best = dist), (k = i);
    });
    const tail = w.clean.pts.slice(k);
    const lead = best > 0.05 ? via(w, here, tail[0]) : [];
    d.route = makeRoute([here, ...lead, ...tail]);
    d.kind = "clean";
    d.s = 0;
    d.k = 1;
    return;
  }
  if (mode === "returning" || mode === "docked") {
    if (d.kind === "go" && d.route) return;
    if (Math.hypot(d.x - w.park.x, d.y - w.park.y) < 0.02) {
      d.route = null;
      d.kind = null;
      return;
    }
    const home = pathToPark(w, { x: d.x, y: d.y });
    d.route = home ? makeRoute(home) : makeRoute([{ x: d.x, y: d.y }, w.park]);
    d.kind = "go";
    d.s = 0;
    d.k = 1;
  }
}

/** Waypoints strictly between `a` and `b` on the way over free floor (none when walled off). */
function via(w: World, a: Pt, b: Pt): Pt[] {
  return findPath(w.grid, a, b)?.slice(1, -1) ?? [];
}

/** Advance the robot by `dt` seconds in `mode`. Mutates `d` (it lives in a ref and is stepped every frame). */
export function stepDrive(d: Drive, w: World, mode: Mode, dt: number) {
  if (d.mode !== mode) enter(d, w, mode);
  d.wiggle = Math.max(0, d.wiggle - dt * 2.5);
  const driving = d.route && (mode === "cleaning" || mode === "returning" || mode === "docked");
  if (!driving || !d.route) {
    if (!d.route && mode !== "cleaning" && mode !== "returning") d.heading = turnToward(d.heading, faceDock(w), TURN_RATE * dt);
    return;
  }
  d.s += SPEED * dt;
  if (d.s >= d.route.len) {
    if (d.kind === "go") {
      Object.assign(d, { x: w.park.x, y: w.park.y, route: null, kind: null, s: 0, k: 1 });
      return;
    }
    // a lap finished while the vacuum still reports cleaning: start over from where it stands
    const here = { x: d.x, y: d.y };
    const lead = via(w, here, w.clean.pts[1] ?? w.park);
    d.route = makeRoute([here, ...lead, ...w.clean.pts.slice(1)]);
    d.kind = "clean";
    d.s = 0;
    d.k = 1;
  }
  const route = d.route;
  while (d.k < route.pts.length - 1 && d.s >= route.cum[d.k]) {
    const a = route.pts[d.k - 1];
    const b = route.pts[d.k];
    const c = route.pts[d.k + 1];
    const turn = Math.abs(Math.atan2(Math.sin(angleOf(c.x - b.x, c.y - b.y) - angleOf(b.x - a.x, b.y - a.y)), Math.cos(angleOf(c.x - b.x, c.y - b.y) - angleOf(b.x - a.x, b.y - a.y))));
    if (d.kind === "clean" && turn > BUMP_ANGLE) d.wiggle = 1;
    d.k++;
  }
  const p = pointAt(route, d.s);
  d.x = p.x;
  d.y = p.y;
  d.heading = turnToward(d.heading, angleOf(p.hx, p.hy), TURN_RATE * dt);
}

// ---------- status light ----------

/** The robot's top light: colour, brightness 0..1 and blink rate (Hz, 0 = steady). */
export function ledOf(mode: Mode): { rgb: [number, number, number]; level: number; pulse: number } {
  switch (mode) {
    case "docked":
      return { rgb: [80, 220, 120], level: 0.9, pulse: 0.5 }; // charging: slow green breath
    case "cleaning":
      return { rgb: [90, 215, 255], level: 1, pulse: 0 };
    case "returning":
      return { rgb: [90, 215, 255], level: 1, pulse: 1.2 };
    case "paused":
      return { rgb: [255, 170, 60], level: 1, pulse: 0 };
    case "error":
      return { rgb: [255, 59, 48], level: 1, pulse: 3 };
    case "idle":
      return { rgb: [220, 232, 240], level: 0.45, pulse: 0 };
    default:
      return { rgb: [0, 0, 0], level: 0, pulse: 0 };
  }
}

// ---------- live position ----------

export type Calibration = { x: number; y: number; scale: number };

/** Offset (m) and scale (metres per reported unit) from Item.params; defaults are the identity. */
export function calibrationOf(params: Record<string, number | string | boolean> | undefined): Calibration {
  const num = (v: unknown, fallback: number) => (typeof v === "number" && Number.isFinite(v) ? v : fallback);
  const scale = num(params?.calScale, 1);
  return { x: num(params?.calX, 0), y: num(params?.calY, 0), scale: scale > 0 ? scale : 1 };
}

const finite = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

/** The raw position a vacuum reports (`x`/`y`, or a `position` object `{x, y}` / pair `[x, y]`), or null when it does not report one. */
export function reportedPosition(attrs: HAState["attributes"] | undefined): Pt | null {
  if (!attrs) return null;
  const pos = attrs.position;
  if (Array.isArray(pos) && finite(pos[0]) && finite(pos[1])) return { x: pos[0], y: pos[1] };
  if (pos && typeof pos === "object" && !Array.isArray(pos) && finite((pos as Pt).x) && finite((pos as Pt).y)) return { x: (pos as Pt).x, y: (pos as Pt).y };
  return finite(attrs.x) && finite(attrs.y) ? { x: attrs.x, y: attrs.y } : null;
}

/** Plan position from the vacuum's own report, or null: then the robot drives the simulated path. */
export function livePosition(attrs: HAState["attributes"] | undefined, params: Record<string, number | string | boolean> | undefined): Pt | null {
  const raw = reportedPosition(attrs);
  if (!raw) return null;
  const c = calibrationOf(params);
  return { x: c.x + raw.x * c.scale, y: c.y + raw.y * c.scale };
}

/** Follow a reported position: glide to it and face the way it moved. */
export function stepLive(d: Drive, target: Pt, dt: number) {
  const dx = target.x - d.x;
  const dy = target.y - d.y;
  d.route = null;
  d.kind = null;
  if (Math.hypot(dx, dy) > TELEPORT) {
    d.x = target.x;
    d.y = target.y;
    return;
  }
  const k = 1 - Math.exp(-LIVE_RATE * dt);
  d.x += dx * k;
  d.y += dy * k;
  if (Math.hypot(dx, dy) > 0.02) d.heading = turnToward(d.heading, angleOf(dx, dy), TURN_RATE * dt);
}
