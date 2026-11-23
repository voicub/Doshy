import { elevationOf, levelIdOf } from "./levels.ts";
import { FLOORS } from "./materials.ts";
import type { Brush } from "./materials.ts";
import type { FloorKind, GroundArea, GroundEdge, GroundPath, Plan, Pt } from "./types.ts";

// ---- what the ground is made of ---------------------------------------------------------------------------------------------

/** Height of a ground surface above the ground plane (m): a hair above it, so it never fights the lawn or the studio floor. Paths lie a little over areas. */
export const GROUND_LIFT = 0.012;
export const PATH_LIFT = 0.016;
/** Top of a room's floor slab on the ground (components/scene/RoomFloor.tsx FLOOR_T): ground laid over a lawn or terrace room rests on it, not under it. */
const ROOM_FLOOR_TOP = 0.06;
export const MIN_AREA_SIDE = 0.3;
export const MIN_PATH_WIDTH = 0.3;
export const MAX_PATH_WIDTH = 6;
/** A garden path, pond or patio smaller than this in either direction is not drawn (the pointer only twitched). */
export const MIN_DRAW = 0.3;

/** How the rim of an area or path looks: `h` metres above the ground, `t` metres wide, `color` the material. */
export type EdgeDef = { label: string; h: number; t: number; color: string };
export const EDGES: Record<GroundEdge, EdgeDef> = {
  none: { label: "None", h: 0, t: 0, color: "#000000" },
  kerb: { label: "Stone kerb", h: 0.1, t: 0.12, color: "#b9b6ae" },
  sleeper: { label: "Wooden sleeper", h: 0.14, t: 0.14, color: "#6b4f36" },
  brick: { label: "Brick edge", h: 0.07, t: 0.1, color: "#a8553f" },
  steel: { label: "Steel strip", h: 0.06, t: 0.015, color: "#3a3f46" },
};
export const EDGE_KINDS = Object.keys(EDGES) as GroundEdge[];
export const edgeOf = (g: { edge?: GroundEdge }): GroundEdge => (g.edge && EDGES[g.edge] ? g.edge : "none");

/** Surface of an area or path, tolerating a kind from an older or newer save. */
export const groundKind = (g: { kind: FloorKind }): FloorKind => (FLOORS[g.kind] ? g.kind : "gravel");
/** The tint an area or path is drawn with: the user's colour, else the kind's natural one. */
export const groundColor = (g: { kind: FloorKind; color?: string }): string => g.color ?? FLOORS[groundKind(g)].color;
/** Surfaces plants may stand on: a lawn, a flower bed, a bark bed. Everything else (paving, gravel, water ...) is bare. */
const PLANTABLE: readonly FloorKind[] = ["grass", "soil", "mulch"];
export const isPlantable = (k: FloorKind) => PLANTABLE.includes(k);

// ---- geometry ------------------------------------------------------------------------------------------------------------

const DEG = Math.PI / 180;
const r3 = (v: number) => Math.round(v * 1000) / 1000;

export const areaCenter = (a: Pick<GroundArea, "x" | "y" | "w" | "h">): Pt => ({ x: a.x + a.w / 2, y: a.y + a.h / 2 });

/** The four corners of an area in plan metres, turned about its centre: nw, ne, se, sw of the unturned rectangle. */
export function areaCorners(a: Pick<GroundArea, "x" | "y" | "w" | "h" | "rot">): Pt[] {
  const c = areaCenter(a);
  const [cos, sin] = [Math.cos((a.rot ?? 0) * DEG), Math.sin((a.rot ?? 0) * DEG)];
  return [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([sx, sy]) => {
    const [lx, ly] = [(sx * a.w) / 2, (sy * a.h) / 2];
    return { x: c.x + lx * cos - ly * sin, y: c.y + lx * sin + ly * cos };
  });
}

/** `p` in the area's own frame: metres from its centre along its width (x) and depth (y). */
export function toAreaLocal(a: Pick<GroundArea, "x" | "y" | "w" | "h" | "rot">, p: Pt): Pt {
  const c = areaCenter(a);
  const [cos, sin] = [Math.cos((a.rot ?? 0) * DEG), Math.sin((a.rot ?? 0) * DEG)];
  const [dx, dy] = [p.x - c.x, p.y - c.y];
  return { x: dx * cos + dy * sin, y: -dx * sin + dy * cos };
}

export function pointInArea(a: Pick<GroundArea, "x" | "y" | "w" | "h" | "rot">, p: Pt): boolean {
  const l = toAreaLocal(a, p);
  return Math.abs(l.x) <= a.w / 2 && Math.abs(l.y) <= a.h / 2;
}

/** Points with consecutive duplicates removed (a double click leaves two equal ones). */
export const cleanPoints = (pts: Pt[]): Pt[] => pts.filter((p, i) => i === 0 || Math.hypot(p.x - pts[i - 1].x, p.y - pts[i - 1].y) > 1e-6);

export function pathLength(p: Pick<GroundPath, "points">): number {
  const pts = cleanPoints(p.points);
  let len = 0;
  for (let i = 1; i < pts.length; i++) len += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
  return len;
}

/** Distance from `p` to the segment a-b. */
export function distToSegment(p: Pt, a: Pt, b: Pt): number {
  const [dx, dy] = [b.x - a.x, b.y - a.y];
  const l2 = dx * dx + dy * dy;
  const t = l2 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2)) : 0;
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

/** Is `p` on the path (within half its width of the line, round at the ends and bends)? */
export function pointInPath(path: Pick<GroundPath, "points" | "width">, p: Pt): boolean {
  const pts = cleanPoints(path.points);
  if (pts.length === 1) return Math.hypot(p.x - pts[0].x, p.y - pts[0].y) <= path.width / 2;
  for (let i = 1; i < pts.length; i++) if (distToSegment(p, pts[i - 1], pts[i]) <= path.width / 2) return true;
  return false;
}

/** Steps an eighth of a turn each: how smooth the rounded joins and caps are. */
const ARC_STEP = Math.PI / 8;

const rot2 = (v: Pt, a: number): Pt => ({ x: v.x * Math.cos(a) - v.y * Math.sin(a), y: v.x * Math.sin(a) + v.y * Math.cos(a) });

/** The point half way along a path (where its label sits). */
export function pathMidpoint(p: Pick<GroundPath, "points">): Pt {
  const pts = cleanPoints(p.points);
  if (pts.length < 2) return pts[0] ?? { x: 0, y: 0 };
  let left = pathLength(p) / 2;
  for (let i = 1; i < pts.length; i++) {
    const l = Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
    if (left <= l) return { x: pts[i - 1].x + ((pts[i].x - pts[i - 1].x) * left) / l, y: pts[i - 1].y + ((pts[i].y - pts[i - 1].y) * left) / l };
    left -= l;
  }
  return pts[pts.length - 1];
}

/**
 * The outline of a path as one closed polygon: both sides offset by half the width, rounded on the outside of every bend and at both ends.
 * The inside of a bend takes the mitre point (kept inside the shorter neighbouring segment), so a path whose segments are longer than its width has a
 * simple outline. ponytail: segments shorter than the width at a sharp bend can make the outline cross itself; split such a bend into longer segments.
 */
const normalOf = (d: Pt): Pt => ({ x: -d.y, y: d.x });

/** Outside of a bend: a round join from one offset to the next, `turn` radians in all. */
function roundJoin(out: Pt[], v: Pt, n0: Pt, s: 1 | -1, r: number, turn: number) {
  const n = Math.max(1, Math.ceil(Math.abs(turn) / ARC_STEP));
  const from: Pt = { x: s * n0.x * r, y: s * n0.y * r };
  for (let k = 0; k <= n; k++) {
    const q = rot2(from, (turn * k) / n);
    out.push({ x: v.x + q.x, y: v.y + q.y });
  }
}

/** Inside of a bend (or straight on): the mitre point, kept inside the shorter neighbour (`shorter` = its length) so it cannot overshoot. */
function mitreJoin(out: Pt[], v: Pt, n0: Pt, n1: Pt, dot: number, s: 1 | -1, r: number, shorter: number) {
  const m = { x: n0.x + n1.x, y: n0.y + n1.y };
  const k = 1 + dot;
  const reach = Math.min(r / Math.max(k, 1e-6) * Math.hypot(m.x, m.y), Math.max(r, shorter));
  const ml = Math.hypot(m.x, m.y) || 1;
  out.push({ x: v.x + s * (m.x / ml) * reach, y: v.y + s * (m.y / ml) * reach });
}

/** One side of the path, start to end: s = +1 the side the normal points to, -1 the other. `dirs` / `lens` are the unit directions and lengths of the segments. */
function offsetSide(pts: Pt[], dirs: Pt[], lens: number[], r: number, s: 1 | -1): Pt[] {
  const out: Pt[] = [{ x: pts[0].x + s * normalOf(dirs[0]).x * r, y: pts[0].y + s * normalOf(dirs[0]).y * r }];
  for (let i = 1; i < pts.length - 1; i++) {
    const [d0, d1] = [dirs[i - 1], dirs[i]];
    const [n0, n1] = [normalOf(d0), normalOf(d1)];
    const cross = d0.x * d1.y - d0.y * d1.x;
    const dot = d0.x * d1.x + d0.y * d1.y;
    if (s * cross < 0 && Math.abs(cross) > 1e-9) roundJoin(out, pts[i], n0, s, r, Math.atan2(cross, dot));
    else mitreJoin(out, pts[i], n0, n1, dot, s, r, Math.min(lens[i - 1], lens[i]));
  }
  const last = dirs[dirs.length - 1];
  out.push({ x: pts[pts.length - 1].x + s * normalOf(last).x * r, y: pts[pts.length - 1].y + s * normalOf(last).y * r });
  return out;
}

/** The half circle round an end of the path, without its two end points (those are the offsets). */
function endCap(centre: Pt, from: Pt): Pt[] {
  const n = Math.ceil(Math.PI / ARC_STEP);
  const out: Pt[] = [];
  for (let k = 1; k < n; k++) {
    const q = rot2(from, (-Math.PI * k) / n);
    out.push({ x: centre.x + q.x, y: centre.y + q.y });
  }
  return out;
}

/**
 * The outline of a path as one closed polygon: both sides offset by half the width, rounded on the outside of every bend and at both ends.
 * The inside of a bend takes the mitre point (kept inside the shorter neighbouring segment), so a path whose segments are longer than its width has a
 * simple outline. ponytail: segments shorter than the width at a sharp bend can make the outline cross itself; split such a bend into longer segments.
 */
export function pathOutline(path: Pick<GroundPath, "points" | "width">): Pt[] {
  const pts = cleanPoints(path.points);
  const r = path.width / 2;
  if (pts.length === 0) return [];
  if (pts.length === 1) return Array.from({ length: 16 }, (_, k) => ({ x: pts[0].x + r * Math.cos((k * Math.PI) / 8), y: pts[0].y + r * Math.sin((k * Math.PI) / 8) }));
  const dirs: Pt[] = [];
  const lens: number[] = [];
  for (let i = 1; i < pts.length; i++) {
    const l = Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
    lens.push(l);
    dirs.push({ x: (pts[i].x - pts[i - 1].x) / l, y: (pts[i].y - pts[i - 1].y) / l });
  }
  const left = offsetSide(pts, dirs, lens, r, 1);
  const right = offsetSide(pts, dirs, lens, r, -1);
  const end = pts[pts.length - 1];
  const nEnd = normalOf(dirs[dirs.length - 1]);
  const nStart = normalOf(dirs[0]);
  return [
    ...left,
    ...endCap(end, { x: nEnd.x * r, y: nEnd.y * r }),
    ...right.reverse(),
    ...endCap(pts[0], { x: -nStart.x * r, y: -nStart.y * r }),
  ];
}

/** The polygon an area or path covers, in plan metres. */
export const groundPolygon = (g: GroundArea | GroundPath): Pt[] => ("points" in g ? pathOutline(g) : areaCorners(g));

/** Area of a polygon (m2, always positive). */
export function polygonArea(poly: Pt[]): number {
  let s = 0;
  for (let i = 0; i < poly.length; i++) {
    const [p, q] = [poly[i], poly[(i + 1) % poly.length]];
    s += p.x * q.y - q.x * p.y;
  }
  return Math.abs(s) / 2;
}

export const areaM2 = (a: Pick<GroundArea, "w" | "h">) => a.w * a.h;
/** "12.0 m2" or "6.5 m": what the plan writes next to a ground area or path. */
export const groundLabel = (g: GroundArea | GroundPath) => ("points" in g ? `${pathLength(g).toFixed(1)} m` : `${areaM2(g).toFixed(1)} m2`);

// ---- editing a rectangle ----------------------------------------------------------------------------------------------------

export type Corner = "nw" | "ne" | "se" | "sw";
const CORNER_SIGN: Record<Corner, [number, number]> = { nw: [-1, -1], ne: [1, -1], se: [1, 1], sw: [-1, 1] };
export const CORNERS: readonly Corner[] = ["nw", "ne", "se", "sw"];

/** The corner of the unturned rectangle in plan metres. */
const cornerPoint = (a: Pick<GroundArea, "x" | "y" | "w" | "h" | "rot">, c: Corner): Pt => areaCorners(a)[CORNERS.indexOf(c)];

/**
 * Drag one corner of an area to `p`: the opposite corner stays where it is in the plan and the sides follow the area's own turn
 * (never smaller than MIN_AREA_SIDE, and the corner cannot cross over). Returns the new x, y, w, h.
 */
export function resizeArea(a: Pick<GroundArea, "x" | "y" | "w" | "h" | "rot">, corner: Corner, p: Pt): Pick<GroundArea, "x" | "y" | "w" | "h"> {
  const [sx, sy] = CORNER_SIGN[corner];
  const opp = cornerPoint(a, CORNERS[(CORNERS.indexOf(corner) + 2) % 4]);
  const [cos, sin] = [Math.cos((a.rot ?? 0) * DEG), Math.sin((a.rot ?? 0) * DEG)];
  const [dx, dy] = [p.x - opp.x, p.y - opp.y];
  const w = Math.max(MIN_AREA_SIDE, sx * (dx * cos + dy * sin));
  const h = Math.max(MIN_AREA_SIDE, sy * (-dx * sin + dy * cos));
  const c = { x: opp.x + sx * (w / 2) * cos - sy * (h / 2) * sin, y: opp.y + sx * (w / 2) * sin + sy * (h / 2) * cos };
  return { x: r3(c.x - w / 2), y: r3(c.y - h / 2), w: r3(w), h: r3(h) };
}

/** The turn (degrees, 0 to 359.99) that puts an area's "up" side toward `p`, snapped to `step` degrees (0 = free). */
export function rotationToward(a: Pick<GroundArea, "x" | "y" | "w" | "h">, p: Pt, step: number): number {
  const c = areaCenter(a);
  let deg = (Math.atan2(p.y - c.y, p.x - c.x) / DEG + 90 + 360) % 360;
  if (step > 0) deg = Math.round(deg / step) * step;
  return r3(deg % 360);
}

// ---- what lies where ---------------------------------------------------------------------------------------------------------

type GroundHit = { type: "ground" | "path"; id: string };

/** The topmost ground under a plan point: paths lie over areas, later ones over earlier ones. */
export function groundAt(plan: Pick<Plan, "ground" | "paths">, p: Pt): GroundHit | null {
  const paths = plan.paths ?? [];
  for (let i = paths.length - 1; i >= 0; i--) if (pointInPath(paths[i], p)) return { type: "path", id: paths[i].id };
  const areas = plan.ground ?? [];
  for (let i = areas.length - 1; i >= 0; i--) if (pointInArea(areas[i], p)) return { type: "ground", id: areas[i].id };
  return null;
}

/** The kind of ground the topmost area or path covering `p` is made of, or null when `p` is on open ground. */
function groundKindAt(plan: Pick<Plan, "ground" | "paths">, p: Pt): FloorKind | null {
  const hit = groundAt(plan, p);
  if (!hit) return null;
  const g = hit.type === "path" ? plan.paths?.find((x) => x.id === hit.id) : plan.ground?.find((x) => x.id === hit.id);
  return g ? groundKind(g) : null;
}

/** May a plant stand at `p`? Yes on open ground, a lawn, a flower bed or a bark bed; never in the middle of a patio, a drive, a path or a pond. */
export const plantableAt = (plan: Pick<Plan, "ground" | "paths">, p: Pt): boolean => {
  const k = groundKindAt(plan, p);
  return k === null || isPlantable(k);
};

/** Placements (anything with x and z) that stand on ground a plant may grow in. The same array when the plan has no ground. */
export function keepPlantable<T extends { x: number; z: number }>(plan: Pick<Plan, "ground" | "paths">, placements: T[]): T[] {
  if (!plan.ground?.length && !plan.paths?.length) return placements;
  return placements.filter((q) => plantableAt(plan, { x: q.x, y: q.z }));
}

/** Does the plan have any garden ground (an area or a path)? */
export const hasGround = (plan: Pick<Plan, "ground" | "paths">) => !!(plan.ground?.length || plan.paths?.length);

/** Does the plan have any outdoor ground at all: a ground area, a path or a room floored with an outdoor surface? (the "Blank garden" hint) */
export const hasOutdoor = (plan: Pick<Plan, "ground" | "paths" | "rooms">) => hasGround(plan) || plan.rooms.some((r) => FLOORS[r.floor]?.outdoor);

/**
 * The height an area or path starts from: 0 on open ground, the top of the floor slab when it overlaps an outdoor room on the ground (a lawn or terrace
 * room), so a path drawn across the garden room is seen above its floor instead of hidden under it.
 */
export function groundBase(plan: Pick<Plan, "rooms" | "levels">, g: GroundArea | GroundPath): number {
  const poly = groundPolygon(g);
  if (!poly.length) return 0;
  const [x0, x1] = [Math.min(...poly.map((p) => p.x)), Math.max(...poly.map((p) => p.x))];
  const [y0, y1] = [Math.min(...poly.map((p) => p.y)), Math.max(...poly.map((p) => p.y))];
  const onRoom = plan.rooms.some((r) => FLOORS[r.floor]?.outdoor && elevationOf(plan, levelIdOf(plan, r)) < 0.005 && r.x < x1 && r.x + r.w > x0 && r.y < y1 && r.y + r.h > y0);
  return onRoom ? ROOM_FLOOR_TOP : 0;
}

// ---- editing the plan ------------------------------------------------------------------------------------------------------

export type NewArea = Pick<GroundArea, "x" | "y" | "w" | "h" | "kind"> & Partial<Pick<GroundArea, "rot" | "color" | "edge" | "name">>;
export type NewPath = Pick<GroundPath, "points" | "width" | "kind"> & Partial<Pick<GroundPath, "color" | "edge" | "name">>;

/** Default name of a new area or path: its surface, numbered. */
const nameFor = (kind: FloorKind, taken: (GroundArea | GroundPath)[]) => `${kind === "water" ? "Pond" : FLOORS[kind].label} ${taken.filter((g) => g.kind === kind).length + 1}`;

export function addGroundTo(plan: Plan, a: NewArea, id: string): Plan {
  const area: GroundArea = { ...a, id, w: Math.max(MIN_AREA_SIDE, a.w), h: Math.max(MIN_AREA_SIDE, a.h), name: a.name ?? nameFor(a.kind, plan.ground ?? []) };
  return { ...plan, ground: [...(plan.ground ?? []), area] };
}

export function addPathTo(plan: Plan, p: NewPath, id: string): Plan {
  const points = cleanPoints(p.points);
  if (points.length < 2) return plan;
  const path: GroundPath = { ...p, id, points, width: Math.min(MAX_PATH_WIDTH, Math.max(MIN_PATH_WIDTH, p.width)), name: p.name ?? nameFor(p.kind, plan.paths ?? []) };
  return { ...plan, paths: [...(plan.paths ?? []), path] };
}

/** Move a path (every point) by dx, dy. */
export const movePath = (p: GroundPath, dx: number, dy: number): Pt[] => p.points.map((q) => ({ x: r3(q.x + dx), y: r3(q.y + dy) }));

/** The ground painted with a brush: its surface (if the brush lays a floor) and colour (absent colour = natural). A wall material is ignored; the same plan when nothing changes. */
export function paintGround(plan: Plan, hit: GroundHit, brush: Brush): Plan {
  if (brush.material?.kind === "wall") return plan;
  const key = hit.type === "path" ? "paths" : "ground";
  const list = (plan[key] ?? []) as (GroundArea | GroundPath)[];
  const g = list.find((x) => x.id === hit.id);
  if (!g) return plan;
  const kind = brush.material ? brush.material.id : groundKind(g);
  const color = brush.color && brush.color !== FLOORS[kind].color ? brush.color : undefined;
  if (g.kind === kind && g.color === color) return plan;
  const next = list.map((x) => {
    if (x.id !== hit.id) return x;
    const { color: _c, ...rest } = x;
    return { ...rest, kind, ...(color ? { color } : {}) };
  });
  return { ...plan, [key]: next };
}

/** What the eyedropper picks up from a ground area or path. */
export function sampleGround(plan: Plan, hit: GroundHit): Brush | null {
  const g = ((hit.type === "path" ? plan.paths : plan.ground) as (GroundArea | GroundPath)[] | undefined)?.find((x) => x.id === hit.id);
  return g ? { material: { kind: "floor", id: groundKind(g) }, color: g.color ?? null } : null;
}

// ---- one-click presets ---------------------------------------------------------------------------------------------------------

export type GroundMode = "area" | "path" | "pond";
export type GroundPreset = { id: string; label: string; mode: GroundMode; kind: FloorKind; edge: GroundEdge; /** A stamp: click to drop an area this big (metres). Absent for a path. */ size?: { w: number; h: number }; /** A path's width. */ width?: number };
export const GROUND_PRESETS: readonly GroundPreset[] = [
  { id: "patio", label: "Patio 3x4 m", mode: "area", kind: "pavers_grey", edge: "none", size: { w: 3, h: 4 } },
  { id: "path", label: "Path 1 m", mode: "path", kind: "gravel", edge: "none", width: 1 },
  { id: "drive", label: "Driveway 3x6 m", mode: "area", kind: "concrete", edge: "none", size: { w: 3, h: 6 } },
  { id: "lawn", label: "Lawn", mode: "area", kind: "grass", edge: "none", size: { w: 4, h: 4 } },
  { id: "pond", label: "Pond 2x3 m", mode: "pond", kind: "water", edge: "kerb", size: { w: 2, h: 3 } },
  { id: "gravel", label: "Gravel bed", mode: "area", kind: "gravel", edge: "sleeper", size: { w: 2, h: 1.5 } },
];

/** The surfaces shown first in the Garden gallery (the rest are one tap away). */
export const GARDEN_KINDS: readonly FloorKind[] = [
  "grass", "gravel", "sand", "concrete", "polished", "slabs", "flagstone", "cobble", "paving", "pavers_grey", "pavers_sand", "pavers_red",
  "deck", "asphalt", "mulch", "soil", "turf", "rubber", "water",
];
