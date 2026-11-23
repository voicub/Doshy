import type { Def, Part } from "./catalog.ts";
import type { Pt } from "./types.ts";

type V3 = { x: number; y: number; z: number };

/** Plan-space grids for dragging furniture (metres): 5 cm, Shift 1 cm, Alt free. */
export const itemGrid = (m: { shiftKey: boolean; altKey: boolean }) => (m.altKey ? 0 : m.shiftKey ? 0.01 : 0.05);

/** Round to a grid step (0 = no grid), without float dust. */
export const snapTo = (v: number, step: number) => (step > 0 ? +(Math.round(v / step) * step).toFixed(4) : v);

/** Where a ray (origin o, direction d) meets the horizontal plane y = h, as plan coordinates (plan y = world z). Null when parallel or behind the origin. */
export function rayPlane(o: V3, d: V3, h: number): Pt | null {
  if (Math.abs(d.y) < 1e-6) return null;
  const t = (h - o.y) / d.y;
  return t < 0 ? null : { x: o.x + d.x * t, y: o.z + d.z * t };
}

/**
 * Where the pointer ray lands for something that stands on the level floor inside the building and on the ground outside it (`groundOk`):
 * hit the floor plane first; if that point is outside the building re-hit the ground plane, so the thing follows the cursor on the drive without parallax.
 * `lift` is the height above the surface the ray is aimed at (a lifted item). Returns the plan point and the surface height it stands on.
 */
export function surfaceHit(o: V3, d: V3, floorH: number, lift: number, groundOk: boolean, outside: (p: Pt) => boolean): { p: Pt; y: number } | null {
  const onFloor = rayPlane(o, d, floorH + lift);
  if (!groundOk || (onFloor && !outside(onFloor))) return onFloor && { p: onFloor, y: floorH };
  const onGround = rayPlane(o, d, lift);
  return onGround && outside(onGround) ? { p: onGround, y: 0 } : onFloor && { p: onFloor, y: floorH };
}

/** Height (world y) where a ray meets the vertical plane through plan point c whose horizontal normal is n. Null when parallel or behind. */
export function rayVerticalPlane(o: V3, d: V3, c: Pt, n: Pt): number | null {
  const dn = d.x * n.x + d.z * n.y;
  if (Math.abs(dn) < 1e-6) return null;
  const t = ((c.x - o.x) * n.x + (c.y - o.z) * n.y) / dn;
  return t < 0 ? null : o.y + d.y * t;
}

/** Offset from the pointer to the item centre at grab time: adding it to a later pointer position keeps the item under the same spot. */
export const grabOffset = (pointer: Pt, item: Pt): Pt => ({ x: item.x - pointer.x, y: item.y - pointer.y });

/** Where the item centre should go for this pointer, grab offset kept, snapped to the grid. */
export const dragTarget = (pointer: Pt, off: Pt, grid: number): Pt => ({ x: snapTo(pointer.x + off.x, grid), y: snapTo(pointer.y + off.y, grid) });

const norm360 = (d: number) => ((d % 360) + 360) % 360;

/** Degrees (clockwise in plan, y down, 0 = +x) of the direction from c to p. */
export const angleAround = (c: Pt, p: Pt) => norm360((Math.atan2(p.y - c.y, p.x - c.x) * 180) / Math.PI);

/** Snap an angle to a step in degrees (0 = free) and wrap it into [0, 360). */
export const snapAngle = (deg: number, step: number) => norm360(step > 0 ? Math.round(deg / step) * step : Math.round(deg * 100) / 100) % 360;

/** The rotation a ring drag gives: the item turns by the angle the pointer swept around its centre since the grab. */
export const ringRotation = (startRot: number, startAngle: number, nowAngle: number, step: number) => snapAngle(startRot + (nowAngle - startAngle), step);

/** Common bases for things lifted off the floor: floor, chair seat, desk, counter, shelf, high shelf. */
export const ELEV_SNAPS = [0, 0.45, 0.75, 0.9, 1.5, 1.85];
const ELEV_REACH = 0.06;
const ELEV_MAX = 2.6;

/** Elevation for a dragged height: sticks to a common height within 6 cm, else 5 cm steps (Shift 1 cm, Alt free); never below the floor. */
export function snapElev(v: number, m: { shiftKey: boolean; altKey: boolean }): number {
  const c = Math.min(ELEV_MAX, Math.max(0, v));
  if (!m.altKey) {
    const near = ELEV_SNAPS.reduce((a, b) => (Math.abs(b - c) < Math.abs(a - c) ? b : a));
    if (Math.abs(near - c) <= ELEV_REACH) return near;
  }
  return snapTo(c, m.altKey ? 0.01 : m.shiftKey ? 0.01 : 0.05);
}

const partHalfY = (p: Part) => (p.r ? Math.hypot(...p.s) / 2 : p.shape === "sph" ? p.s[0] / 2 : p.s[1] / 2);

/** Vertical extent (metres above the floor) of an item's parts as drawn: used to size its pick box so it matches what the eye sees. */
export function itemExtent(def: Def, item: { h: number; elev?: number }, cutH?: number): { y0: number; y1: number } {
  const k = item.h / def.h;
  const e = item.elev ?? 0;
  let lo = Infinity;
  let hi = -Infinity;
  for (const p of def.parts) {
    const half = partHalfY(p);
    lo = Math.min(lo, p.p[1] - half);
    hi = Math.max(hi, p.p[1] + half);
  }
  if (!Number.isFinite(lo)) return { y0: e, y1: e + item.h };
  const y0 = e + Math.max(0, lo) * k;
  const y1 = Math.max(y0 + 0.04, e + hi * k);
  return { y0, y1: cutH !== undefined && y1 > cutH ? Math.max(y0 + 0.04, cutH) : y1 };
}

/** Camera target and ortho zoom (pixels per metre) that frame a plan footprint for the isometric camera: same maths as the Rig's framing, so RESET returns to the opening view. */
export function fitIso(b: { x0: number; y0: number; x1: number; y1: number }, width: number, height: number, pad = 1.3, fitH = 2.2, minZoom = 10, maxZoom = 220) {
  const cx = (b.x0 + b.x1) / 2;
  const cz = (b.y0 + b.y1) / 2;
  const ty = fitH / 2;
  const r = Math.SQRT1_2; // right = (1,0,-1)/sqrt2
  const k = 1 / Math.sqrt(6); // up = (-1,2,-1)/sqrt6
  let u = 0.1;
  let v = 0.1;
  for (const x of [b.x0, b.x1])
    for (const z of [b.y0, b.y1])
      for (const y of [0, fitH]) {
        const dx = x - cx;
        const dy = y - ty;
        const dz = z - cz;
        u = Math.max(u, Math.abs((dx - dz) * r));
        v = Math.max(v, Math.abs((-dx + 2 * dy - dz) * k));
      }
  const zoom = Math.min(maxZoom, Math.max(minZoom, Math.min(width / (2 * u * pad), height / (2 * v * pad))));
  return { x: cx, y: ty, z: cz, zoom };
}

// ---- modular furniture (IKEA-planner style): snapping a module to neighbours of the same family ---------------------------------

/** A module as the snapper sees it: footprint centre (plan x, y), size, rotation (degrees clockwise) and base height. */
export type ModuleBox = { x: number; y: number; w: number; d: number; h: number; rot: number; elev: number };
/** A snap guide: a segment in plan x, height, plan y. */
export type Guide = { a: [number, number, number]; b: [number, number, number] };
type ModuleSnap = { x: number; y: number; elev: number; snapped: boolean; label: string | null; guides: Guide[] };

const MODULE_GRID = 0.35;
const MODULE_TOL = 0.06;
/** Default base height of a wall module placed from the catalog. */
export const MODULE_MOUNT_H = 1.3;
/** Common mounting heights of wall modules (base height, m). */
const MOUNT_HEIGHTS = [0, 0.45, 0.75, 0.9, 1.3, 1.5, 1.85];
const SAME_ROT = 2; // degrees: modules only snap to neighbours facing the same way
const MODULE_REACH = 0.6; // a neighbour further than this (edge to edge) is not "touched" and gives no grid anchor

const rad = (d: number) => (d * Math.PI) / 180;
/** A snap candidate: the shift it would apply, its priority on ties, and the coordinate of the edge / height the guide is drawn at. */
type Cand = { delta: number; pri: number; at: number; kind: "side" | "edge" | "stack" | "grid" | "back" | "height" };

/** The module's own frame: along the wall (u) and depth (n), rotated by `rot` degrees from plan x / y. */
type Frame = { toUN: (x: number, y: number) => { u: number; n: number }; toXY: (u: number, n: number) => { x: number; y: number } };
function frameOf(rot: number): Frame {
  const c = Math.cos(rad(rot));
  const s = Math.sin(rad(rot));
  return {
    toUN: (x, y) => ({ u: x * c + y * s, n: -x * s + y * c }),
    toXY: (u, n) => ({ x: u * c - n * s, y: u * s + n * c }),
  };
}

/** Every snap candidate per axis: against neighbours facing the same way on the same wall plane, the grid off the nearest one, and the mounting heights. */
function moduleCandidates(self: ModuleBox, others: ModuleBox[], tol: number, grid: number, toUN: Frame["toUN"], me: { u: number; n: number }) {
  const left = me.u - self.w / 2;
  const right = me.u + self.w / 2;
  const back = me.n - self.d / 2;
  const top = self.elev + self.h;
  const cu: Cand[] = [];
  const cn: Cand[] = [];
  const cv: Cand[] = [];
  let anchor: { box: ModuleBox; u: number; reach: number } | null = null;
  for (const o of others) {
    if (Math.abs(((((o.rot - self.rot) % 360) + 540) % 360) - 180) > SAME_ROT) continue; // not facing the same way
    const p = toUN(o.x, o.y);
    const oL = p.u - o.w / 2;
    const oR = p.u + o.w / 2;
    const oTop = o.elev + o.h;
    const uGap = Math.max(left - oR, oL - right); // < 0: overlapping along the wall
    const vGap = Math.max(self.elev - oTop, o.elev - top); // < 0: overlapping in height
    if (Math.abs(me.n - p.n) - (self.d + o.d) / 2 > tol) continue; // not on the same wall plane
    const reach = Math.hypot(Math.max(0, uGap), Math.max(0, vGap));
    if (reach > MODULE_REACH) continue;
    if (!anchor || reach < anchor.reach) anchor = { box: o, u: p.u, reach };
    if (vGap < -0.01) cu.push({ delta: oR - left, pri: 0, at: oR, kind: "side" }, { delta: oL - right, pri: 0, at: oL, kind: "side" });
    if (vGap <= tol) cu.push({ delta: oL - left, pri: 1, at: oL, kind: "edge" }, { delta: oR - right, pri: 1, at: oR, kind: "edge" });
    if (uGap < -0.01) {
      cv.push({ delta: oTop - self.elev, pri: 0, at: oTop, kind: "stack" }, { delta: o.elev - top, pri: 0, at: o.elev, kind: "stack" });
      cv.push({ delta: o.elev - self.elev, pri: 1, at: o.elev, kind: "stack" }, { delta: oTop - top, pri: 1, at: oTop, kind: "stack" });
    }
    if (uGap <= tol && vGap <= tol) cn.push({ delta: p.n - o.d / 2 - back, pri: 0, at: 0, kind: "back" });
  }
  if (anchor) {
    const aL = anchor.u - anchor.box.w / 2;
    const gu = aL + Math.round((left - aL) / grid) * grid;
    cu.push({ delta: gu - left, pri: 2, at: gu, kind: "grid" });
    const gv = anchor.box.elev + Math.round((self.elev - anchor.box.elev) / grid) * grid;
    cv.push({ delta: gv - self.elev, pri: 2, at: gv, kind: "grid" });
  }
  for (const hgt of MOUNT_HEIGHTS) cv.push({ delta: hgt - self.elev, pri: 3, at: hgt, kind: "height" });
  return { cu, cn, cv };
}

function closestCand(cs: Cand[], tol: number): Cand | undefined {
  const ok = cs.filter((k) => Math.abs(k.delta) <= tol).sort((a, b) => Math.abs(a.delta) - Math.abs(b.delta) || a.pri - b.pri);
  return ok.find((k) => k.kind !== "height") ?? ok[0]; // a neighbour beats a generic mounting height
}

/** A vertical guide at the snapped edge along the wall, and a horizontal one at the snapped height (none for a generic mounting height). */
function snapGuides(self: ModuleBox, others: ModuleBox[], toXY: Frame["toXY"], bu: Cand | undefined, bv: Cand | undefined, u: number, n: number, elev: number): Guide[] {
  const guides: Guide[] = [];
  const front = n + self.d / 2;
  const y0 = Math.min(elev, ...others.map((o) => o.elev));
  const y1 = Math.max(elev + self.h, ...others.map((o) => o.elev + o.h));
  if (bu) {
    const g = toXY(bu.at, front);
    guides.push({ a: [g.x, y0, g.y], b: [g.x, y1, g.y] });
  }
  if (bv && bv.kind !== "height") {
    const a = toXY(u - self.w / 2 - 0.1, front);
    const b = toXY(u + self.w / 2 + 0.1, front);
    guides.push({ a: [a.x, bv.at, a.y], b: [b.x, bv.at, b.y] });
  }
  return guides;
}

/**
 * Where a module lands when dragged near others of its family: side by side flush (gap 0), stacked top to bottom, edges aligned,
 * back planes flush, a 0.35 m grid relative to the nearest neighbour, then the common mounting heights.
 * Each axis (along the wall, depth, height) picks the closest candidate within `tol`; `axes` limits which axes may move (the elevation gizmo moves height only).
 */
export function snapModule(self: ModuleBox, others: ModuleBox[], opts: { tol?: number; grid?: number; axes?: { u?: boolean; n?: boolean; v?: boolean } } = {}): ModuleSnap {
  const tol = opts.tol ?? MODULE_TOL;
  const grid = opts.grid ?? MODULE_GRID;
  const ax = { u: true, n: true, v: true, ...opts.axes };
  const { toUN, toXY } = frameOf(self.rot);
  const me = toUN(self.x, self.y);
  const { cu, cn, cv } = moduleCandidates(self, others, tol, grid, toUN, me);

  const bu = ax.u ? closestCand(cu, tol) : undefined;
  const bn = ax.n ? closestCand(cn, tol) : undefined;
  const bv = ax.v ? closestCand(cv, tol) : undefined;
  const u = me.u + (bu?.delta ?? 0);
  const n = me.n + (bn?.delta ?? 0);
  const elev = +(self.elev + (bv?.delta ?? 0)).toFixed(4);
  const pos = toXY(u, n);

  const guides = snapGuides(self, others, toXY, bu, bv, u, n, elev);
  const label = bu ? `SNAP ${Math.round((bu.kind === "grid" ? grid : self.w) * 100)} CM` : bv ? `SNAP ${Math.round((bv.kind === "grid" ? grid : self.h) * 100)} CM` : bn ? "SNAP FLUSH" : null;
  return { x: pos.x, y: pos.y, elev, snapped: !!(bu || bn || bv), label, guides };
}
