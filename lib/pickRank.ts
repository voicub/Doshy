import type { Def, Part } from "./catalog.ts";
import { itemExtent } from "./editMath.ts";
import { inflate } from "./pickMath.ts";

/**
 * Picking of furniture, as plain maths on the pointer ray (no meshes): every item is a handful of boxes built from its biggest parts,
 * the boxes under the ray are ranked by what the eye sees first and by what the user most likely means, and padding that keeps tiny things
 * clickable only counts when nothing real is hit (or the tiny thing rests on what is hit).
 */

type V3t = [number, number, number];
export type V3 = { x: number; y: number; z: number };
export type Ray = { o: V3; d: V3 };
/** A box in the item's own frame (x along its width, z along its depth, y = height above the surface it stands on): centre and half sizes. */
export type LBox = { c: V3t; h: V3t };

export const MAX_PICK_BOXES = 12;
/** Parts whose longest side is below this (m) are specks, left out of the pick boxes. */
const MIN_PART = 0.04;
/** A part is a silhouette part when it is at least this share of the item's volume, or at least this share of its longest side (poles, rails, legs). Small contents (books, bins, knobs) are left out, so a shelf's cells stay open. */
const SILHOUETTE_VOLUME = 0.015;
const SILHOUETTE_LENGTH = 0.35;
/** Glass thinner than this (m) in its thinnest side is not a target (a pane, a railing). */
const MIN_GLASS = 0.05;
/** An item no taller than this (m) and with a footprint of at least `FLAT_AREA` (m2) lies on the floor like a rug and loses to whatever stands on it. A small puck is not a rug. */
const FLAT_H = 0.06;
const FLAT_AREA = 0.1;
/** A box is never thinner than this (m): a rug stays hittable. */
const MIN_THICK = 0.04;
/** How much (m along the ray) a container loses against something resting on or in it that is also under the pointer. */
export const SUPPORT_PENALTY = 0.12;
const REST_TOL = 0.02;

// ---- boxes from parts ------------------------------------------------------------------------------------------------------

/** Half sizes of the axis-aligned box that holds a box of half sizes `h` turned by the Euler angles `r` (three's default XYZ order). */
function turnedHalf(h: V3t, r: V3t): V3t {
  const [x, y, z] = r;
  const a = Math.cos(x), b = Math.sin(x), c = Math.cos(y), d = Math.sin(y), e = Math.cos(z), f = Math.sin(z);
  const ae = a * e, af = a * f, be = b * e, bf = b * f;
  const m = [c * e, -c * f, d, af + be * d, ae - bf * d, -b * c, bf - ae * d, be + af * d, a * c]; // rows of the rotation matrix
  return [0, 1, 2].map((i) => Math.abs(m[i * 3]) * h[0] + Math.abs(m[i * 3 + 1]) * h[1] + Math.abs(m[i * 3 + 2]) * h[2]) as V3t;
}

const volume = (b: LBox) => 8 * b.h[0] * b.h[1] * b.h[2];

const unionOf = (a: LBox, b: LBox): LBox => {
  const c: V3t = [0, 0, 0];
  const h: V3t = [0, 0, 0];
  for (let i = 0; i < 3; i++) {
    const lo = Math.min(a.c[i] - a.h[i], b.c[i] - b.h[i]);
    const hi = Math.max(a.c[i] + a.h[i], b.c[i] + b.h[i]);
    c[i] = (lo + hi) / 2;
    h[i] = (hi - lo) / 2;
  }
  return { c, h };
};

const inside = (a: LBox, b: LBox) => [0, 1, 2].every((i) => Math.abs(a.c[i] - b.c[i]) + a.h[i] <= b.h[i] + 1e-6);

/** The box one part fills, in the def's own coordinates, or null when it is not a pick target (detail, glow, thin glass, a speck). */
export function partBox(p: Part): LBox | null {
  if (p.detail || p.glow) return null;
  const half: V3t = [p.s[0] / 2, p.s[1] / 2, p.s[2] / 2];
  const h = p.r ? turnedHalf(half, p.r) : half;
  if (p.glass && Math.min(...half) * 2 < MIN_GLASS) return null;
  if (Math.max(...h) * 2 < MIN_PART) return null;
  return { c: [p.p[0], p.p[1], p.p[2]], h };
}

/** The parts that make the silhouette (see `SILHOUETTE_VOLUME`); all of them when none would be left out or none would stay. */
function silhouetteBoxes(boxes: LBox[]): LBox[] {
  if (boxes.length < 2) return boxes;
  const all = boxes.reduce((u, b) => unionOf(u, b));
  const vol = volume(all);
  const long = Math.max(...all.h) * 2;
  const keep = boxes.filter((b) => volume(b) >= vol * SILHOUETTE_VOLUME || Math.max(...b.h) * 2 >= long * SILHOUETTE_LENGTH);
  return keep.length ? keep : boxes;
}

/** Merge boxes (cheapest union first: the least empty space added) until at most `max` remain. */
export function mergeBoxes(boxes: LBox[], max = MAX_PICK_BOXES): LBox[] {
  const out = boxes.filter((b, i) => !boxes.some((o, j) => j !== i && inside(b, o) && (!inside(o, b) || j < i))); // a box inside another adds nothing
  while (out.length > max) {
    let best = Infinity;
    let bi = 0;
    let bj = 1;
    for (let i = 0; i < out.length; i++) {
      for (let j = i + 1; j < out.length; j++) {
        const waste = volume(unionOf(out[i], out[j])) - volume(out[i]) - volume(out[j]);
        if (waste < best) [best, bi, bj] = [waste, i, j];
      }
    }
    out[bi] = unionOf(out[bi], out[bj]);
    out.splice(bj, 1);
  }
  return out;
}

const defBoxes = new WeakMap<Def, LBox[] | null>();

/** The merged pick boxes of a def (def coordinates, standing on y = 0), or null when it has none to offer (models, cars and glass-only pieces use the whole box). */
export function boxesOfDef(def: Def): LBox[] | null {
  const cached = defBoxes.get(def);
  if (cached !== undefined) return cached;
  const parts = def.model || def.car ? [] : def.parts.map(partBox).filter((b): b is LBox => !!b);
  const out = parts.length ? mergeBoxes(silhouetteBoxes(parts)) : null;
  defBoxes.set(def, out);
  return out;
}

// ---- entries ---------------------------------------------------------------------------------------------------------------

/** What the picker knows about one item: where it stands, its boxes and what ranking needs. */
export type PickEntry = {
  id: string;
  /** Plan x, z of the centre; `y` = height of the surface the item stands on (world). */
  x: number;
  z: number;
  y: number;
  /** cos and sin of the item's turn about the vertical axis (three: rotation.y = -rot). */
  cos: number;
  sin: number;
  boxes: LBox[];
  /** The whole bounding box (footprint w x d, drawn height): padded for tiny things, outlined on hover. */
  whole: LBox;
  /** A ceiling fixture: picked by a floor dot instead. */
  dot: boolean;
  flat: boolean;
  locked: boolean;
  /** Volume of the whole box, base and top (m above `y`), and the plan order: tie-breaks and "rests on" tests. */
  vol: number;
  base: number;
  top: number;
  order: number;
};

export type ItemLike = { id: string; x: number; y: number; rot: number; w: number; d: number; h: number; elev?: number; locked?: boolean };

/** Build the entry of an item standing on a surface at height `lv`. `cutH`: the wall cut-away height for solid pieces (their drawn top is clipped to it). */
export function buildEntry(def: Def, it: ItemLike, lv: number, order: number, opts: { ceiling?: boolean; cutH?: number } = {}): PickEntry {
  const { y0, y1 } = itemExtent(def, it, opts.cutH);
  const whole: LBox = { c: [0, (y0 + y1) / 2, 0], h: [it.w / 2, Math.max(0.005, (y1 - y0) / 2), it.d / 2] };
  const rad = (-it.rot * Math.PI) / 180;
  const kx = it.w / def.w;
  const ky = it.h / def.h;
  const kz = it.d / def.d;
  const e = it.elev ?? 0;
  const top = y1;
  const boxes = (boxesOfDef(def) ?? []).map((b): LBox => {
    // the same transform the item is drawn with, then clipped to the extent the whole box has (so floor-level and cut-away rules agree)
    const lo = Math.max(e, e + (b.c[1] - b.h[1]) * ky);
    const hi = Math.max(lo + MIN_THICK, Math.min(e + (b.c[1] + b.h[1]) * ky, Math.max(top, lo + MIN_THICK)));
    return { c: [b.c[0] * kx, (lo + hi) / 2, b.c[2] * kz], h: [b.h[0] * kx, (hi - lo) / 2, b.h[2] * kz] };
  });
  return {
    id: it.id,
    x: it.x,
    z: it.y,
    y: lv,
    cos: Math.cos(rad),
    sin: Math.sin(rad),
    boxes: boxes.length ? boxes : [whole],
    whole,
    dot: !!opts.ceiling,
    flat: y1 - y0 <= FLAT_H && it.w * it.d >= FLAT_AREA,
    locked: !!it.locked,
    vol: volume(whole),
    base: lv + y0,
    top: lv + y1,
    order,
  };
}

// ---- ray tests -------------------------------------------------------------------------------------------------------------

/** Where a ray meets a box in the entry's frame: the distance at which it enters, or -1 when it misses. Scalars only, no allocation. */
function slab(o: V3, d: V3, e: PickEntry, b: LBox, minWidth = 0): number {
  const px = o.x - e.x;
  const pz = o.z - e.z;
  const ox = px * e.cos - pz * e.sin;
  const oy = o.y - e.y;
  const oz = px * e.sin + pz * e.cos;
  const dx = d.x * e.cos - d.z * e.sin;
  const dz = d.x * e.sin + d.z * e.cos;
  let near = -Infinity;
  let far = Infinity;
  for (let i = 0; i < 3; i++) {
    const p = i === 0 ? ox : i === 1 ? oy : oz;
    const v = i === 0 ? dx : i === 1 ? d.y : dz;
    const g = i === 1 ? 0 : Math.max(0, (minWidth - 2 * b.h[i]) / 2); // thin uprights are widened, never made taller
    const lo = b.c[i] - b.h[i] - g;
    const hi = b.c[i] + b.h[i] + g;
    if (Math.abs(v) < 1e-12) {
      if (p < lo || p > hi) return -1;
      continue;
    }
    const t1 = (lo - p) / v;
    const t2 = (hi - p) / v;
    near = Math.max(near, Math.min(t1, t2));
    far = Math.min(far, Math.max(t1, t2));
  }
  return near <= far && far >= 0 ? Math.max(near, 0) : -1;
}

const PAD_BOX: LBox = { c: [0, 0, 0], h: [0, 0, 0] };

/** Distance at which the ray first meets any of the entry's real boxes (a pole or leg narrower than `minWidth` in both directions is widened to it, so a lamp pole stays clickable), or -1. */
export function hitReal(ray: Ray, e: PickEntry, minWidth = 0): number {
  let best = -1;
  for (const b of e.boxes) {
    const t = slab(ray.o, ray.d, e, b, 2 * b.h[0] < minWidth && 2 * b.h[2] < minWidth ? minWidth : 0);
    if (t >= 0 && (best < 0 || t < best)) best = t;
  }
  return best;
}

/** Distance at which the ray meets the entry's whole box grown to `min` metres on every axis, or -1. Only a box smaller than `min` on every axis grows: anything bigger has no padding, so the empty space around its parts is not a hit. */
export function hitPad(ray: Ray, e: PickEntry, min: number): number {
  const size: [number, number, number] = [e.whole.h[0] * 2, e.whole.h[1] * 2, e.whole.h[2] * 2];
  const grown = inflate(size, min);
  if (grown === size) return -1;
  PAD_BOX.c[0] = e.whole.c[0];
  PAD_BOX.c[1] = e.whole.c[1];
  PAD_BOX.c[2] = e.whole.c[2];
  PAD_BOX.h[0] = grown[0] / 2;
  PAD_BOX.h[1] = grown[1] / 2;
  PAD_BOX.h[2] = grown[2] / 2;
  return slab(ray.o, ray.d, e, PAD_BOX);
}

const DOT_Y = 0.08;
const DOT_R = 0.2;
/** Distance at which the ray meets the floor dot of a ceiling fixture (radius at least `min / 2`), or -1. */
export function hitDot(ray: Ray, e: PickEntry, min: number): number {
  if (Math.abs(ray.d.y) < 1e-9) return -1;
  const t = (e.y + DOT_Y - ray.o.y) / ray.d.y;
  if (t < 0) return -1;
  const r = Math.max(DOT_R, min / 2);
  return Math.hypot(ray.o.x + ray.d.x * t - e.x, ray.o.z + ray.d.z * t - e.z) <= r ? t : -1;
}

/** Is `a` standing on or in `b`: its centre inside b's footprint, its base within b's height, and its footprint is the smaller one (or b is a rug)? */
export function restsOn(a: PickEntry, b: PickEntry): boolean {
  if (a.id === b.id || a.dot || b.dot) return false;
  const dx = a.x - b.x;
  const dz = a.z - b.z;
  const lx = dx * b.cos - dz * b.sin;
  const lz = dx * b.sin + dz * b.cos;
  if (Math.abs(lx) > b.whole.h[0] + REST_TOL || Math.abs(lz) > b.whole.h[2] + REST_TOL) return false;
  if ((!b.flat && a.base < b.base - REST_TOL) || a.base > b.top + REST_TOL) return false; // a rug is drawn slightly above the floor: what stands on it starts lower
  return b.flat || a.whole.h[0] * a.whole.h[2] < b.whole.h[0] * b.whole.h[2]; // standing on or in something bigger, never the other way round
}

// ---- ranking ---------------------------------------------------------------------------------------------------------------

type PickType = "item" | "room" | "opening";
/**
 * real: a real box is under the pointer. promoted: a tiny thing's padding is under the pointer and it rests on something that is hit, so it counts as real.
 * pad: only padding. dot: a ceiling fixture's floor dot. room: a room's floor.
 */
export type Kind = "real" | "promoted" | "pad" | "dot" | "room";
export type Cand = { type: PickType; id: string; t: number; kind: Kind; score: number };
/** A non-item target the caller raycast itself (HA mode): an opening is real, a room is the floor. */
export type Extra = { type: "room" | "opening"; id: string; t: number };
export type RankOpts = {
  /** Smallest on-screen target in metres (0 = no padding). */
  minSize: number;
  /** Narrowest a real box may look on screen, in metres (0 = as built). */
  minWidth?: number;
  /** Locked items are not under the pointer at all (Furniture mode); false lists them (HA linking, Tab). */
  skipLocked: boolean;
};

const TIER: Record<Kind, number> = { real: 0, promoted: 0, dot: 1e3, pad: 1e5, room: 1e6 };
const FLAT_TIER = 1e4;

type Slot = { c: Cand; e: PickEntry | null };
type Placed = Slot & { e: PickEntry };
const precise = (k: Kind) => k === "real" || k === "promoted";

/**
 * Everything under the pointer, best first: the item you see first wins, but padding never beats a real hit, a rug loses to what stands on it,
 * and a container loses to the thing resting on or in it. Ties: smaller volume, then higher base, then plan order.
 */
export function rankItems(ray: Ray, entries: readonly PickEntry[], opts: RankOpts, extras: readonly Extra[] = []): Cand[] {
  const slots: Slot[] = [];
  for (const e of entries) {
    if (e.locked && opts.skipLocked) continue;
    if (e.dot) {
      const t = hitDot(ray, e, opts.minSize);
      if (t >= 0) slots.push({ c: { type: "item", id: e.id, t, kind: "dot", score: TIER.dot + t }, e });
      continue;
    }
    const t = hitReal(ray, e, opts.minWidth);
    if (t >= 0) {
      slots.push({ c: { type: "item", id: e.id, t, kind: "real", score: (e.flat ? FLAT_TIER : 0) + t }, e });
      continue;
    }
    const p = opts.minSize > 0 ? hitPad(ray, e, opts.minSize) : -1;
    if (p >= 0) slots.push({ c: { type: "item", id: e.id, t: p, kind: "pad", score: TIER.pad + p }, e });
  }
  for (const x of extras) {
    const kind: Kind = x.type === "room" ? "room" : "real";
    slots.push({ c: { type: x.type, id: x.id, t: x.t, kind, score: TIER[kind] + x.t }, e: null });
  }
  const reals = slots.filter((s): s is Placed => s.c.kind === "real" && s.e !== null);
  for (const s of slots) {
    const e = s.e;
    if (s.c.kind === "pad" && e && reals.some((r) => restsOn(e, r.e))) {
      s.c.kind = "promoted";
      s.c.score = s.c.t;
    }
  }
  const standing = slots.filter((s): s is Placed => precise(s.c.kind) && s.e !== null);
  for (const s of standing) if (standing.some((o) => o !== s && restsOn(o.e, s.e))) s.c.score += SUPPORT_PENALTY;
  return slots
    .sort((a, b) => {
      const sa = Math.round(a.c.score * 1000);
      const sb = Math.round(b.c.score * 1000);
      if (sa !== sb) return sa - sb;
      const ea = a.e;
      const eb = b.e;
      if (!ea || !eb) return ea ? -1 : eb ? 1 : 0;
      return ea.vol - eb.vol || eb.base - ea.base || ea.order - eb.order;
    })
    .map((s) => s.c);
}

// ---- selection rules -------------------------------------------------------------------------------------------------------

/** What a press selects and starts moving: the already-selected item when its real volume is under the pointer, else the best candidate. */
export function pressTarget(cands: readonly Cand[], selId: string | null | undefined): Cand | null {
  const sel = selId ? cands.find((c) => c.type === "item" && c.id === selId && precise(c.kind)) : undefined;
  return sel ?? cands[0] ?? null;
}

/** "Pick through": the candidates behind the best one (a lone candidate stays: there is nothing to see through to). */
export const behind = <T>(cands: readonly T[]): readonly T[] => (cands.length > 1 ? cands.slice(1) : cands);

/** The id after (dir 1) or before (dir -1) `current` in `order`, wrapping; the first (last) when `current` is not in it; null for an empty list. */
export function tabNext(order: readonly string[], current: string | null | undefined, dir: 1 | -1): string | null {
  if (!order.length) return null;
  const i = current ? order.indexOf(current) : -1;
  if (i < 0) return dir === 1 ? order[0] : order[order.length - 1];
  return order[(i + dir + order.length) % order.length];
}

/** Tab with something selected: step through the items under the pointer when there are several and the selection is one of them, else through the room. */
export function tabTarget(atPointer: readonly string[], inRoom: readonly string[], current: string, dir: 1 | -1): string | null {
  return tabNext(atPointer.length > 1 && atPointer.includes(current) ? atPointer : inRoom, current, dir);
}
