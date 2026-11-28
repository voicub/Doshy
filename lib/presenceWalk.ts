// Pure: where a person stands in a room and how they walk to another. Built on the floor grid of the robot vacuum (vacuumPath.ts): a cell is free when
// a body of ~20 cm radius fits there, so nobody stands inside furniture or a wall, and a path only crosses a wall through a door.
import { hash32 } from "./presence.ts";
import type { Pt } from "./types.ts";
import { CELL, findPath, makeRoute, nearestFree, type Grid, type Route } from "./vacuumPath.ts";

export const WALK_MPS = 1.1;
/** A long way is walked faster so a trip never takes longer than this (s). */
export const MAX_TRIP_S = 6;
/** Nobody walks a step shorter than this (m): the avatar just stands at its new spot. */
const MIN_WALK_M = 0.3;
/** Stay this far in from the walls of the room when picking a spot (m). */
const INSET = 0.35;
/** Two people in one room stand at least this far apart (m). */
const APART = 0.6;
const TRIES = 8;
/** How far a spot may move from its first pick to find free floor (m). */
const SNAP_M = 1.5;

type Rect = { x: number; y: number; w: number; h: number };

const cellPt = (g: Grid, c: number): Pt => ({ x: g.x0 + ((c % g.nx) + 0.5) * CELL, y: g.y0 + (Math.floor(c / g.nx) + 0.5) * CELL });

/** Free floor of the room, away from its walls and out of the doorways. */
function roomMask(g: Grid, r: Rect): Uint8Array {
  const m = new Uint8Array(g.nx * g.ny);
  const i0 = Math.max(0, Math.ceil((r.x + INSET - g.x0) / CELL - 0.5));
  const i1 = Math.min(g.nx - 1, Math.floor((r.x + r.w - INSET - g.x0) / CELL - 0.5));
  const j0 = Math.max(0, Math.ceil((r.y + INSET - g.y0) / CELL - 0.5));
  const j1 = Math.min(g.ny - 1, Math.floor((r.y + r.h - INSET - g.y0) / CELL - 0.5));
  for (let j = j0; j <= j1; j++)
    for (let i = i0; i <= i1; i++) {
      const c = j * g.nx + i;
      if (g.free[c] && !g.door[c]) m[c] = 1;
    }
  return m;
}

/**
 * Where each of these people stands in the room: a spot picked from the id (so it stays put from one visit to the next), moved to the nearest free floor,
 * and another try when somebody already stands there. People are placed in id order. A room with no free floor gets its centre.
 */
export function spotsIn(g: Grid, room: Rect, entities: readonly string[]): Map<string, Pt> {
  const mask = roomMask(g, room);
  const out = new Map<string, Pt>();
  const taken: Pt[] = [];
  for (const id of [...entities].sort()) {
    let first: Pt | undefined;
    let spot: Pt | undefined;
    for (let k = 0; k < TRIES && !spot; k++) {
      const h = hash32(`${id}#${k}`);
      const c = nearestFree(g, { x: room.x + room.w * (0.2 + 0.6 * ((h & 0xffff) / 0xffff)), y: room.y + room.h * (0.2 + 0.6 * (h >>> 16) / 0xffff) }, SNAP_M, mask);
      if (c < 0) continue;
      const p = cellPt(g, c);
      first ??= p;
      if (taken.every((t) => Math.hypot(t.x - p.x, t.y - p.y) >= APART)) spot = p;
    }
    const at = spot ?? first ?? { x: room.x + room.w / 2, y: room.y + room.h / 2 };
    taken.push(at);
    out.set(id, at);
  }
  return out;
}

export type Walk = { route: Route; s: number; speed: number };

/** The way from one spot to another through the doors, or null when there is none or it is too short to bother (the avatar then just appears). */
export function startWalk(g: Grid, from: Pt, to: Pt): Walk | null {
  const path = findPath(g, from, to);
  if (!path) return null;
  const route = makeRoute(path);
  if (route.len < MIN_WALK_M) return null;
  return { route, s: 0, speed: Math.max(WALK_MPS, route.len / MAX_TRIP_S) };
}

/** The walk `dt` seconds later. Where it is: `pointAt(w.route, w.s)` (vacuumPath.ts); it is over when `w.s >= w.route.len`. */
export const advance = (w: Walk, dt: number): Walk => ({ ...w, s: Math.min(w.route.len, w.s + w.speed * dt) });
