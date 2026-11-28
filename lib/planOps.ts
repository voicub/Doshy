import { CATALOG } from "./catalog.ts";
import { WALL_H, WALL_T, normalizeOpening, wallLen } from "./geometry.ts";
import { shellWalls, wallHeight } from "./fences.ts";
import { DEFAULT_LEVEL_HEIGHT, GROUND_ID, RAISED_FLOOR, findLevel, levelIdOf, levelsOf, nextElevation, newLevelId, onLevel, planOfLevel } from "./levels.ts";
import { swings } from "./openings.ts";
import { classify, clearWalls, doorSwing, settleItem, swingHitsFootprint } from "./placement.ts";
import type { Building, BuildingEntry, BuildingType, Item, Level, Opening, Plan, Pt, Roof, Room, Wall } from "./types.ts";
import { uid } from "./uid.ts";
import { withAutoVoids } from "./voids.ts";
import { dropOrphanFlows } from "./flows.ts";

/**
 * Run a plan operation on one level only: it sees just that level's walls, openings, rooms and items, and whatever it
 * returns replaces them, so nothing on another level can be moved, split or collided with.
 */
function onLevelOnly(plan: Plan, levelId: string, fn: (levelPlan: Plan) => Plan): Plan {
  const sub = planOfLevel(plan, levelId);
  const out = fn(sub);
  if (out === sub) return plan;
  const elsewhere = <T extends { level?: string }>(list: T[]) => list.filter((e) => levelIdOf(plan, e) !== levelId);
  return { ...plan, walls: [...elsewhere(plan.walls), ...out.walls], openings: [...elsewhere(plan.openings), ...out.openings], rooms: [...elsewhere(plan.rooms), ...out.rooms], items: [...elsewhere(plan.items), ...out.items] };
}

/** Run an operation on the level of the given room (unchanged plan when the room does not exist). */
function onRoomLevel(plan: Plan, roomId: string, fn: (levelPlan: Plan) => Plan): Plan {
  const room = plan.rooms.find((r) => r.id === roomId);
  return room ? onLevelOnly(plan, levelIdOf(plan, room), fn) : plan;
}

/** Move a room with its walls, openings, alcoves and furniture, all on the room's own level. */
export const moveRoomWithContents = (plan: Plan, roomId: string, dx: number, dy: number, newId: () => string = uid): Plan => onRoomLevel(plan, roomId, (p) => moveRoomOnLevel(p, roomId, dx, dy, newId));

/** Give a room new inside dimensions (its east/south walls move), on the room's own level. */
export const resizeRoom = (plan: Plan, roomId: string, w: number, h: number): Plan => onRoomLevel(plan, roomId, (p) => resizeRoomOnLevel(p, roomId, w, h));

/** A room's floor rectangle can be a few centimetres off its wall centrelines (walls have thickness), so edge matching allows this much slack. */
const EDGE_TOL = 0.15;
const margin = WALL_T / 2 + 0.02;

const inside = (r: Room, p: Pt, pad = 0) => p.x >= r.x - pad && p.x <= r.x + r.w + pad && p.y >= r.y - pad && p.y <= r.y + r.h + pad;

/** A room plus the parts (alcoves) that belong to it. */
export const roomGroup = (plan: Plan, room: Room): Room[] => [room, ...plan.rooms.filter((r) => r.parent === room.id)];

type Rect = { x: number; y: number; w: number; h: number };
type Span = [number, number];
/** A stretch of a wall (distance from its a end) that becomes its own wall when a room is pulled out of its neighbours. */
type Piece = { s0: number; s1: number; moved: boolean };

/** Shorter overlaps are a room corner brushing past a crossing wall, not a wall that borders the room. */
const MIN_BORDER = 0.2;
/** Wall pieces shorter than this are dropped instead of leaving zero-length walls behind. */
const MIN_PIECE = 0.01;

const mergeSpans = (spans: Span[]): Span[] => {
  const out: Span[] = [];
  for (const s of [...spans].sort((p, q) => p[0] - q[0])) {
    const last = out.at(-1);
    if (last && s[0] <= last[1] + 1e-9) last[1] = Math.max(last[1], s[1]);
    else out.push([s[0], s[1]]);
  }
  return out;
};

/**
 * The stretches of an axis-aligned wall that run along or inside any of the rectangles (their edges are wall centre lines
 * half a wall thickness outside the floor, hence the margin). Spans are distances from the wall's a end.
 */
function spansAlong(wall: Wall, rects: Rect[]): Span[] {
  const horizontal = wall.a.y === wall.b.y;
  const len = wallLen(wall);
  const a0 = horizontal ? wall.a.x : wall.a.y;
  const dir = (horizontal ? wall.b.x - wall.a.x : wall.b.y - wall.a.y) > 0 ? 1 : -1;
  const c = horizontal ? wall.a.y : wall.a.x;
  const out: Span[] = [];
  for (const r of rects) {
    const [c0, c1, l0, l1] = horizontal ? [r.y, r.y + r.h, r.x, r.x + r.w] : [r.x, r.x + r.w, r.y, r.y + r.h];
    if (c < c0 - margin || c > c1 + margin) continue;
    const lo = l0 - margin;
    const hi = l1 + margin;
    const [s0, s1] = dir > 0 ? [lo - a0, hi - a0] : [a0 - hi, a0 - lo];
    const span: Span = [Math.max(0, s0), Math.min(len, s1)];
    if (span[1] - span[0] >= Math.min(MIN_BORDER, len)) out.push(span);
  }
  return mergeSpans(out);
}

/**
 * Cut a wall into what leaves with the moving group and what stays. A stretch that borders both the group and
 * another room is shared: the group gets a moved copy and the neighbour keeps the original, so nobody is left open.
 * Null when the wall has nothing to do with the group.
 */
function splitWall(wall: Wall, group: Rect[], others: Rect[]): Piece[] | null {
  const len = wallLen(wall);
  const axisAligned = wall.a.x === wall.b.x || wall.a.y === wall.b.y;
  if (len < MIN_PIECE || !axisAligned) return null;
  const leaving = spansAlong(wall, group);
  if (!leaving.length) return null;
  const staying = spansAlong(wall, others);
  const cuts = [...new Set([0, len, ...leaving.flat(), ...staying.flat()])].sort((p, q) => p - q);
  const has = (spans: Span[], s: number) => spans.some(([lo, hi]) => s >= lo && s <= hi);
  const stay: Span[] = [];
  const go: Span[] = [];
  cuts.slice(1).forEach((end, i) => {
    const start = cuts[i];
    if (end - start < 1e-9) return;
    const mid = (start + end) / 2;
    const moves = has(leaving, mid);
    if (moves) go.push([start, end]);
    if (!moves || has(staying, mid)) stay.push([start, end]);
  });
  return [...mergeSpans(stay).map(([s0, s1]): Piece => ({ s0, s1, moved: false })), ...mergeSpans(go).map(([s0, s1]): Piece => ({ s0, s1, moved: true }))].filter((p) => p.s1 - p.s0 >= MIN_PIECE);
}

/**
 * Move a room together with everything that makes it a room: the walls around it, the doors and windows in them,
 * its alcoves and the furniture standing in it. The room is pulled out cleanly: a wall it shares with a neighbour
 * is split, the moving room takes the stretch along its own floor and the neighbour keeps its wall. Doors and windows
 * stay in their wall's piece (a shared door goes with the moving room). Other rooms and their furniture are untouched.
 */
function moveRoomOnLevel(plan: Plan, roomId: string, dx: number, dy: number, newId: () => string): Plan {
  const room = plan.rooms.find((r) => r.id === roomId);
  if (!room) return plan;
  const group = roomGroup(plan, room);
  const ids = new Set(group.map((r) => r.id));
  const others = plan.rooms.filter((r) => !ids.has(r.id));
  const shift = (p: Pt): Pt => ({ x: p.x + dx, y: p.y + dy });
  const walls: Wall[] = [];
  const openings = [...plan.openings];

  for (const w of plan.walls) {
    const len = wallLen(w);
    const axisAligned = w.a.x === w.b.x || w.a.y === w.b.y;
    if (!axisAligned) {
      // slanted walls cannot be cut along a rectangle: they move whole when both ends are inside the group
      const both = group.some((r) => inside(r, w.a, margin)) && group.some((r) => inside(r, w.b, margin));
      walls.push(both ? { ...w, a: shift(w.a), b: shift(w.b) } : w);
      continue;
    }
    const pieces = splitWall(w, group, others);
    if (!pieces?.length) {
      walls.push(w);
      continue;
    }
    const point = (s: number, moved: boolean): Pt => {
      const p = s <= 0 ? w.a : s >= len ? w.b : { x: w.a.x + ((w.b.x - w.a.x) * s) / len, y: w.a.y + ((w.b.y - w.a.y) * s) / len };
      return moved ? shift(p) : p;
    };
    const longest = pieces.reduce((best, p) => (p.s1 - p.s0 > best.s1 - best.s0 + 1e-9 ? p : best), pieces[0]);
    const made = pieces.map((p) => ({ p, wall: { ...w, id: p === longest ? w.id : newId(), a: point(p.s0, p.moved), b: point(p.s1, p.moved) } }));
    walls.push(...made.map((m) => m.wall));
    if (pieces.length === 1 && pieces[0].s0 <= 0 && pieces[0].s1 >= len) continue; // the whole wall moved: openings keep their place on it
    // openings follow the piece that holds their centre (a moved piece wins where a stretch is shared)
    for (let i = 0; i < openings.length; i++) {
      const o = openings[i];
      if (o.wallId !== w.id) continue;
      const s = o.t * len;
      const holds = (m: (typeof made)[number]) => s >= m.p.s0 - 1e-9 && s <= m.p.s1 + 1e-9;
      const nearest = (m: (typeof made)[number]) => Math.min(Math.abs(s - m.p.s0), Math.abs(s - m.p.s1));
      const home = made.find((m) => m.p.moved && holds(m)) ?? made.find(holds) ?? made.reduce((best, m) => (nearest(m) < nearest(best) ? m : best));
      const plen = home.p.s1 - home.p.s0;
      openings[i] = normalizeOpening({ ...o, wallId: home.wall.id, t: Math.min(1, Math.max(0, (s - home.p.s0) / plen)) }, plen, wallHeight(home.wall, WALL_H));
    }
  }

  return {
    ...plan,
    rooms: plan.rooms.map((r) => (ids.has(r.id) ? { ...r, x: r.x + dx, y: r.y + dy } : r)),
    walls,
    openings: openings.filter((o) => walls.some((w) => w.id === o.wallId)),
    items: plan.items.map((i) => (group.some((r) => inside(r, i)) ? { ...i, x: i.x + dx, y: i.y + dy } : i)),
  };
}

/**
 * Give a room new inside dimensions by moving its east and south walls (and the corners of the walls that meet them),
 * so typing a measurement changes the real walls, not just the floor tint. Furniture stays where it is.
 */
function resizeRoomOnLevel(plan: Plan, roomId: string, w: number, h: number): Plan {
  const room = plan.rooms.find((r) => r.id === roomId);
  if (!room || !(w > 0) || !(h > 0)) return plan;
  const dw = w - room.w;
  const dh = h - room.h;
  const east = room.x + room.w;
  const south = room.y + room.h;
  const moveEnd = (p: Pt): Pt => {
    const onEast = Math.abs(p.x - east) <= EDGE_TOL && p.y >= room.y - EDGE_TOL && p.y <= south + EDGE_TOL;
    const onSouth = Math.abs(p.y - south) <= EDGE_TOL && p.x >= room.x - EDGE_TOL && p.x <= east + EDGE_TOL;
    return { x: p.x + (onEast ? dw : 0), y: p.y + (onSouth ? dh : 0) };
  };
  return {
    ...plan,
    rooms: plan.rooms.map((r) => (r.id === roomId ? { ...r, w, h } : r)),
    walls: plan.walls.map((wall) => ({ ...wall, a: moveEnd(wall.a), b: moveEnd(wall.b) })),
  };
}

/** Uncovered stretches of the segment a-b (axis-aligned) that no existing wall lies along, ignoring slivers shorter than a doorway frame. */
function uncovered(walls: Wall[], a: Pt, b: Pt): [number, number][] {
  const axis = a.y === b.y ? "x" : "y";
  const cross = axis === "x" ? "y" : "x";
  const spans = walls
    .filter((w) => Math.abs(w.a[cross] - a[cross]) <= EDGE_TOL && Math.abs(w.b[cross] - a[cross]) <= EDGE_TOL)
    .map((w): [number, number] => [Math.min(w.a[axis], w.b[axis]), Math.max(w.a[axis], w.b[axis])])
    .sort((p, q) => p[0] - q[0]);
  const gaps: [number, number][] = [];
  let cur = a[axis];
  for (const [s, e] of spans) {
    if (s - cur > MIN_GAP) gaps.push([cur, Math.min(s, b[axis])]);
    cur = Math.max(cur, e);
    if (cur >= b[axis]) break;
  }
  if (b[axis] - cur > MIN_GAP) gaps.push([cur, b[axis]]);
  return gaps;
}
const MIN_GAP = 0.2;

/**
 * Close a room with walls: the four edges of its rectangle, pushed out by half a wall thickness so the floor stays the
 * inside dimension. Edges that already have a wall are skipped; a partly walled edge only gets the missing stretch.
 */
function createRoomWallsOnLevel(plan: Plan, roomId: string, newId: () => string): Plan {
  const room = plan.rooms.find((r) => r.id === roomId);
  if (!room) return plan;
  const h = WALL_T / 2;
  const [x0, y0, x1, y1] = [room.x - h, room.y - h, room.x + room.w + h, room.y + room.h + h];
  const edges: [Pt, Pt][] = [
    [{ x: x0, y: y0 }, { x: x1, y: y0 }],
    [{ x: x1, y: y0 }, { x: x1, y: y1 }],
    [{ x: x0, y: y1 }, { x: x1, y: y1 }],
    [{ x: x0, y: y0 }, { x: x0, y: y1 }],
  ];
  const added = edges.flatMap(([a, b]) => {
    const axis = a.y === b.y ? "x" : "y";
    return uncovered(shellWalls(plan.walls), a, b).map(([g0, g1]): Wall => ({ id: newId(), a: { ...a, [axis]: g0 }, b: { ...b, [axis]: g1 }, style: "plaster", ...(room.level ? { level: room.level } : {}) }));
  });
  return added.length ? { ...plan, walls: [...plan.walls, ...added] } : plan;
}

/** Add the walls missing around a room, on the room's level. */
export const createRoomWalls = (plan: Plan, roomId: string, newId: () => string = uid): Plan => onRoomLevel(plan, roomId, (p) => createRoomWallsOnLevel(p, roomId, newId));

/** Shortest wall the length field accepts (metres). */
const MIN_WALL = 0.1;

/**
 * Set a wall's length by moving its b end along the wall's own direction. Its doors and windows keep their distance
 * from the a end (and are squeezed to fit when the wall gets shorter).
 */
export function resizeWall(plan: Plan, wallId: string, len: number): Plan {
  const wall = plan.walls.find((w) => w.id === wallId);
  const old = wall ? wallLen(wall) : 0;
  if (!wall || !(len >= MIN_WALL) || old === 0) return plan;
  const k = len / old;
  const b = { x: wall.a.x + (wall.b.x - wall.a.x) * k, y: wall.a.y + (wall.b.y - wall.a.y) * k };
  return {
    ...plan,
    walls: plan.walls.map((w) => (w.id === wallId ? { ...w, b } : w)),
    openings: plan.openings.map((o) => (o.wallId === wallId ? normalizeOpening({ ...o, t: (o.t * old) / len }, len, wallHeight(wall, WALL_H)) : o)),
  };
}

/** Distance from the wall's a end to the opening's near edge, and from its far edge to the b end (metres). */
export const openingStart = (o: { t: number; width: number }, len: number) => o.t * len - o.width / 2;
export const openingEnd = (o: { t: number; width: number }, len: number) => len - o.t * len - o.width / 2;
/** Inverse of the two above: the centre fraction `t` that puts the opening that far from an end. */
export const tFromStart = (start: number, width: number, len: number) => (start + width / 2) / len;
export const tFromEnd = (end: number, width: number, len: number) => (len - end - width / 2) / len;

/**
 * Apply typed values to an item without ever leaving it inside a wall. A typed X/Y moves the item from where it
 * stands toward the typed spot and stops at the wall in the way (as dragging does, so it cannot jump to the far side);
 * a typed size or rotation is simply cleared out of any wall it now overlaps. `moved` reports that the typed position was changed.
 */
export function typedItemPatch(walls: Wall[], item: Item, def: { wall?: boolean; h: number }, p: Partial<Item>): { patch: Partial<Item>; moved: boolean } {
  const next = { ...item, ...p };
  const cls = classify(def, item.kind);
  const shifts = p.x !== undefined || p.y !== undefined;
  // where the item stands now, under its new size and rotation
  const here = { ...next, ...clearWalls({ ...next, x: item.x, y: item.y }, walls, cls) };
  const c = shifts ? settleItem(here, { x: next.x, y: next.y }, walls, cls, false) : clearWalls(next, walls, cls);
  const moved = Math.hypot(c.x - next.x, c.y - next.y) > 1e-4;
  return { patch: moved ? { ...p, x: c.x, y: c.y } : p, moved };
}

const COMPASS = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"];
/** How far either side of a wall is sampled to see which side is inside a room (metres past the wall face). */
const SIDE_PROBE = WALL_T / 2 + 0.15;

/**
 * Compass direction an exterior door or window looks out to: the wall side NOT inside any room rectangle, converted with
 * the plan's `bearing` (compass bearing of plan-up; plan-right is bearing + 90). Null when both sides or neither are inside a room.
 */
export function outwardFacing(plan: Plan, wallId: string, t: number): { deg: number; label: string } | null {
  const w = plan.walls.find((x) => x.id === wallId);
  const len = w ? wallLen(w) : 0;
  if (!w || len === 0) return null;
  const c = { x: w.a.x + (w.b.x - w.a.x) * t, y: w.a.y + (w.b.y - w.a.y) * t };
  const n = { x: (w.b.y - w.a.y) / len, y: -(w.b.x - w.a.x) / len };
  const roomed = (s: 1 | -1) => plan.rooms.some((r) => inside(r, { x: c.x + n.x * SIDE_PROBE * s, y: c.y + n.y * SIDE_PROBE * s }));
  const a = roomed(1);
  if (a === roomed(-1)) return null;
  const out = a ? { x: -n.x, y: -n.y } : n;
  const deg = Math.round((((plan.bearing ?? 0) + (Math.atan2(out.x, -out.y) * 180) / Math.PI) % 360 + 360) % 360) % 360;
  return { deg, label: `${COMPASS[Math.round(deg / 22.5) % 16]} ${deg}` };
}

type Swing = "left" | "right";
type Hinge = "start" | "end";

/**
 * Which hand the hinges are on, seen standing on the swing side facing the door. Standing on the left side of a west-to-east
 * wall you face south, west is on your right: so hinge "start" with swing "left" reads as hinge RIGHT.
 */
export const hingeHand = (o: { hinge?: Hinge; swing?: Swing }): Swing => ((o.hinge ?? "start") === "start") === ((o.swing ?? "left") === "left") ? "right" : "left";
/** Inverse of `hingeHand`: the stored `hinge` that puts the hinges on `hand` when the door opens toward `swing`. */
export const hingeForHand = (hand: Swing, swing: Swing): Hinge => (hand === "right") === (swing === "left") ? "start" : "end";

/** The rooms on the left and right side of a wall at `t` (walking a to b, y down), or null where no room is. */
export function wallSides(plan: Plan, wallId: string, t: number): { left: Room | null; right: Room | null } {
  const w = plan.walls.find((x) => x.id === wallId);
  const len = w ? wallLen(w) : 0;
  if (!w || len === 0) return { left: null, right: null };
  const c = { x: w.a.x + (w.b.x - w.a.x) * t, y: w.a.y + (w.b.y - w.a.y) * t };
  const n = { x: (w.b.y - w.a.y) / len, y: -(w.b.x - w.a.x) / len }; // left normal in plan view
  const at = (s: number) => {
    const p = { x: c.x + n.x * SIDE_PROBE * s, y: c.y + n.y * SIDE_PROBE * s };
    return plan.rooms.filter((r) => inside(r, p)).sort((a, b) => a.w * a.h - b.w * b.h)[0] ?? null;
  };
  return { left: at(1), right: at(-1) };
}

/** Floor items a door (or casement window) hits while it swings open: its quarter disc overlaps the footprint at a height the leaf occupies. */
export function doorSwingBlockers(plan: Plan, o: Opening): Item[] {
  const wall = plan.walls.find((w) => w.id === o.wallId);
  if (!wall || !swings(o)) return []; // sliding, rolling and fixed openings have no swing
  const sw = doorSwing(o, wall);
  return plan.items.filter((i) => {
    const def = CATALOG[i.kind];
    if (!def || def.stair === "step" || classify({ wall: def.wall, h: i.h }, i.kind) !== "floor") return false; // entry steps sit outside the door: its leaf swings over them
    const base = i.elev ?? 0;
    if (base >= o.sill + o.height || base + i.h <= o.sill) return false; // passes above or below the leaf
    return swingHitsFootprint(sw, o.width, i);
  });
}

// ---- levels and building ----

/** Allowed floor-to-floor heights (m). */
export const MIN_LEVEL_HEIGHT = 2.2;
export const MAX_LEVEL_HEIGHT = 4.5;
const clampLevelHeight = (h: number) => Math.min(MAX_LEVEL_HEIGHT, Math.max(MIN_LEVEL_HEIGHT, Number.isFinite(h) ? h : DEFAULT_LEVEL_HEIGHT));

/** The user's flat: first level of a building, a ground floor raised one metre above the ground. */
const defaultLevels = (): Level[] => [{ id: GROUND_ID, name: "Ground floor", elevation: RAISED_FLOOR, height: DEFAULT_LEVEL_HEIGHT }];

/** A plan with a building and at least one level (plans saved before levels existed get an apartment on a raised ground floor). Same object when already complete. */
export function withDefaultLevels(plan: Plan): Plan {
  if (plan.building && plan.levels?.length) return plan;
  return { ...plan, building: plan.building ?? { type: "apartment" }, levels: plan.levels?.length ? plan.levels : defaultLevels() };
}

export type NewLevel = { name?: string; elevation?: number; height?: number; copyFrom?: string };

const HA_ROOM_LINKS = { areas: undefined, tempEntity: undefined, humidityEntity: undefined, presenceEntities: undefined, powerEntities: undefined } as const;

/**
 * Add a level (default: on top of the highest one). With `copyFrom` the new level starts as a copy of that level's walls, rooms,
 * openings and furniture with fresh ids; openings follow their copied wall, alcoves their copied parent. Home Assistant links are not
 * copied (a second storey must not drive the first one's lights).
 */
export function addLevelTo(plan: Plan, opts: NewLevel = {}, newId: () => string = uid): { plan: Plan; id: string } {
  const base = withDefaultLevels(plan);
  const levels = levelsOf(base);
  const id = newLevelId(base);
  const src = opts.copyFrom && levels.some((l) => l.id === opts.copyFrom) ? opts.copyFrom : undefined;
  const level: Level = {
    id,
    name: opts.name?.trim() || `Level ${levels.length + 1}`,
    elevation: opts.elevation !== undefined && Number.isFinite(opts.elevation) ? opts.elevation : nextElevation(base),
    height: clampLevelHeight(opts.height ?? (src ? findLevel(base, src).height : DEFAULT_LEVEL_HEIGHT)),
  };
  let { walls, openings, rooms, items } = base;
  if (src) {
    const from = onLevel(base, src);
    const wallIds = new Map(from.walls.map((w) => [w.id, newId()]));
    const roomIds = new Map(from.rooms.map((r) => [r.id, newId()]));
    walls = [...walls, ...from.walls.map((w) => ({ ...w, id: wallIds.get(w.id) ?? w.id, a: { ...w.a }, b: { ...w.b }, level: id }))];
    openings = [
      ...openings,
      ...from.openings.flatMap((o) => {
        const wallId = wallIds.get(o.wallId);
        return wallId === undefined ? [] : [{ ...o, id: newId(), wallId, entity: undefined, level: id }];
      }),
    ];
    rooms = [...rooms, ...from.rooms.map((r) => ({ ...r, ...HA_ROOM_LINKS, id: roomIds.get(r.id) ?? r.id, parent: r.parent ? roomIds.get(r.parent) : undefined, level: id }))];
    items = [...items, ...from.items.map((i) => ({ ...i, id: newId(), entity: undefined, level: id }))];
  }
  const copied = src ? (base.voids ?? []).filter((v) => !v.auto && levelIdOf(base, v) === src).map((v) => ({ ...v, id: newId(), level: id })) : []; // stair holes are derived: the copied stairs make their own
  return { plan: withAutoVoids({ ...base, levels: [...levels, level], walls, openings, rooms, items, ...(copied.length ? { voids: [...(base.voids ?? []), ...copied] } : {}) }), id };
}

/** Remove a level and everything on it. The last level cannot be removed (the plan is returned unchanged). */
export function removeLevelFrom(plan: Plan, levelId: string): Plan {
  const base = withDefaultLevels(plan);
  const levels = levelsOf(base);
  if (levels.length <= 1 || !levels.some((l) => l.id === levelId)) return plan;
  const keep = <T extends { level?: string }>(list: T[]) => list.filter((e) => levelIdOf(base, e) !== levelId);
  const walls = keep(base.walls);
  return withAutoVoids(dropOrphanFlows({ ...base, levels: levels.filter((l) => l.id !== levelId), walls, openings: keep(base.openings).filter((o) => walls.some((w) => w.id === o.wallId)), rooms: keep(base.rooms), items: keep(base.items), ...(base.voids ? { voids: keep(base.voids) } : {}) }));
}

/** Edit a level's name, elevation or height (height kept within 2.2 to 4.5 m, elevation finite). Unknown ids change nothing. */
export function updateLevelIn(plan: Plan, levelId: string, p: Partial<Pick<Level, "name" | "elevation" | "height">>): Plan {
  const base = withDefaultLevels(plan);
  if (!levelsOf(base).some((l) => l.id === levelId)) return plan;
  const clean: Partial<Level> = {};
  if (p.name !== undefined && p.name.trim()) clean.name = p.name;
  if (p.elevation !== undefined && Number.isFinite(p.elevation)) clean.elevation = Math.round(p.elevation * 1000) / 1000;
  if (p.height !== undefined && Number.isFinite(p.height)) clean.height = clampLevelHeight(p.height);
  return { ...base, levels: levelsOf(base).map((l) => (l.id === levelId ? { ...l, ...clean } : l)) };
}

export const setBuildingTypeIn = (plan: Plan, type: BuildingType): Plan => {
  const base = withDefaultLevels(plan);
  return base.building?.type === type ? base : { ...base, building: { ...(base.building as Building), type } };
};

/** Set the house's roof (a complete, already normalised Roof). Same plan object when nothing changes. */
export const setRoofIn = (plan: Plan, roof: Roof): Plan => {
  const base = withDefaultLevels(plan);
  const cur = base.building?.roof;
  if (cur && cur.type === roof.type && cur.pitch === roof.pitch && cur.overhang === roof.overhang) return plan;
  return { ...base, building: { ...(base.building as Building), roof } };
};

/** What the front door opens onto: the choice saved on the building, else the building shared hallway for an apartment and entrance steps for a house. Old "street" reads as "stairs". */
export const entryOf = (b?: Pick<Building, "type" | "entry">): BuildingEntry => (b?.entry === "street" ? "stairs" : b?.entry ?? (b?.type === "house" ? "stairs" : "hallway"));

/** Choose how the front door is reached. Same plan object when it already is that. */
export const setEntryIn = (plan: Plan, entry: BuildingEntry): Plan => {
  const base = withDefaultLevels(plan);
  return entryOf(base.building) === entry ? plan : { ...base, building: { ...(base.building as Building), entry } };
};

/** Floors whose slabs overlap: [lower, upper] pairs where the upper level starts below the lower one's ceiling. */
export function overlappingLevels(levels: Level[]): [Level, Level][] {
  const s = [...levels].sort((a, b) => a.elevation - b.elevation);
  return s.slice(1).flatMap((u, i) => (u.elevation < s[i].elevation + s[i].height - 1e-6 ? [[s[i], u] as [Level, Level]] : []));
}

/** Top of the highest storey above the ground, bottom of the lowest below it (m). */
export function buildingExtent(levels: Level[]): { top: number; bottom: number; height: number } {
  const top = Math.max(0, ...levels.map((l) => l.elevation + l.height));
  const bottom = Math.min(0, ...levels.map((l) => l.elevation));
  return { top, bottom, height: top - bottom };
}
