import type { Rect } from "./zones.ts";
import { findPath, makeRoute, type Route, type World } from "./vacuumPath.ts";
import type { Pt } from "./types.ts";

// The cleaning lap of a vacuum cut down to one room: what the robot drives while its own report says which room it is cleaning. Pure.

const EDGE = 0.05; // m: lane this close outside the room's rectangle still counts as inside
/** Less lane than this inside the room (a lap that only grazes it) is no lap: the whole lap is kept. */
const MIN_LANE = 1.5;
const SAME = 1e-6;

/** The part of the segment a-b inside the rectangle (Liang-Barsky), or null when it misses it. */
function clip(r: Rect, a: Pt, b: Pt): [Pt, Pt] | null {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  let t0 = 0;
  let t1 = 1;
  const sides: [number, number][] = [
    [-dx, a.x - (r.x - EDGE)],
    [dx, r.x + r.w + EDGE - a.x],
    [-dy, a.y - (r.y - EDGE)],
    [dy, r.y + r.h + EDGE - a.y],
  ];
  for (const [p, q] of sides) {
    if (p === 0) {
      if (q < 0) return null;
    } else if (p < 0) t0 = Math.max(t0, q / p);
    else t1 = Math.min(t1, q / p);
  }
  return t0 > t1 ? null : [{ x: a.x + dx * t0, y: a.y + dy * t0 }, { x: a.x + dx * t1, y: a.y + dy * t1 }];
}

/** Waypoints strictly between two points over free floor (none when walled off). */
const between = (w: World, a: Pt, b: Pt): Pt[] => findPath(w.grid, a, b)?.slice(1, -1) ?? [];

/**
 * The parts of the world's lap that lie inside `room`, joined over free floor, starting from the dock like the full lap. Null when the lap hardly enters the
 * room (then the robot keeps its whole lap).
 */
export function lapInRoom(w: World, room: Rect): Route | null {
  const runs: Pt[][] = [];
  let run: Pt[] = [];
  const { pts } = w.clean;
  for (let i = 1; i < pts.length; i++) {
    const piece = clip(room, pts[i - 1], pts[i]);
    if (!piece) {
      if (run.length) (runs.push(run), (run = []));
      continue;
    }
    const last = run[run.length - 1];
    if (last && Math.hypot(last.x - piece[0].x, last.y - piece[0].y) < SAME) run.push(piece[1]);
    else {
      if (run.length) runs.push(run);
      run = [piece[0], piece[1]];
    }
  }
  if (run.length) runs.push(run);
  if (runs.reduce((len, r) => len + makeRoute(r).len, 0) < MIN_LANE) return null;
  const out: Pt[] = [w.park];
  let from = w.park;
  for (const lane of runs) {
    out.push(...between(w, from, lane[0]), ...lane);
    from = lane[lane.length - 1];
  }
  return makeRoute(out);
}
