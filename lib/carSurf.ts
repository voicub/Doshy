import { Mesh, cross, sub, unit } from "./carBuilder.ts";
import { clamp, lerp, type V3 } from "./mathUtil.ts";
import type { Frame } from "./carFrame.ts";
import type { PlateEnd } from "./plate.ts";

// The lofted body as a queryable surface, and the helpers that lay trim (glass, lights, shut lines) on it.
// Everything is asked for the car's left side (+x); the caller mirrors it with `Mesh.both`.

export type Pt = { p: V3; n: V3 };
export type Layer = "paint" | "glass" | "chrome" | "black" | "lamp" | "tail";
export const LAYERS: Layer[] = ["paint", "glass", "chrome", "black", "lamp", "tail"];
export type PlateMount = { end: PlateEnd; p: V3; rot: [number, number, number] };

export class Surf {
  zs: number[];
  P: V3[][];
  N: V3[][];
  Hn: number; // points in the +x half of a section
  ns: number;
  constructor(zs: number[], P: V3[][], N: V3[][], Hn: number) {
    this.zs = zs;
    this.P = P;
    this.N = N;
    this.Hn = Hn;
    this.ns = zs.length;
  }

  /** Fractional station index of a z. */
  iAtZ(z: number): number {
    const { zs, ns } = this;
    if (z <= zs[0]) return 0;
    if (z >= zs[ns - 1]) return ns - 1;
    let lo = 0;
    let hi = ns - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (zs[mid] <= z) lo = mid;
      else hi = mid;
    }
    return lo + (z - zs[lo]) / (zs[hi] - zs[lo]);
  }

  /** Point and normal at fractional station i and fractional position j along the +x half of the section (0 = underbody centre, Hn-1 = top centre). */
  at(i: number, j: number): Pt {
    const i0 = clamp(Math.floor(i), 0, this.ns - 2);
    const fi = i - i0;
    const jj = clamp(j, 0, this.Hn - 1);
    const j0 = Math.min(Math.floor(jj), this.Hn - 2);
    const fj = jj - j0;
    const mix = (A: V3[][]): V3 => {
      const out: V3 = [0, 0, 0];
      for (let k = 0; k < 3; k++) out[k] = lerp(lerp(A[i0][j0][k], A[i0][j0 + 1][k], fj), lerp(A[i0 + 1][j0][k], A[i0 + 1][j0 + 1][k], fj), fi);
      return out;
    };
    return { p: mix(this.P), n: unit(mix(this.N)) };
  }

  private rowY(i: number, y: number): number {
    const row = this.P[i];
    for (let j = 0; j < this.Hn; j++) {
      if (row[j][1] < y) continue;
      if (j === 0) return 0;
      const d = row[j][1] - row[j - 1][1];
      return j - 1 + (d > 1e-9 ? (y - row[j - 1][1]) / d : 1);
    }
    return this.Hn - 1;
  }

  private rowX(i: number, x: number): number {
    const row = this.P[i];
    for (let j = this.Hn - 1; j >= 1; j--) {
      if (row[j - 1][0] < x) continue;
      const d = row[j - 1][0] - row[j][0];
      return j - 1 + (d > 1e-9 ? (row[j - 1][0] - x) / d : 0);
    }
    return 0;
  }

  /** Fractional j at height y on the side (and nose and tail), from the wheel-arch lip upward. */
  jAtY(i: number, y: number): number {
    const i0 = Math.floor(i);
    const i1 = Math.min(i0 + 1, this.ns - 1);
    return lerp(this.rowY(i0, y), this.rowY(i1, y), i - i0);
  }

  /** Fractional j at lateral position x on the top (bonnet, windscreen, roof, boot). */
  jAtX(i: number, x: number): number {
    const i0 = Math.floor(i);
    const i1 = Math.min(i0 + 1, this.ns - 1);
    return lerp(this.rowX(i0, x), this.rowX(i1, x), i - i0);
  }

  sideAt(z: number, y: number): Pt {
    const i = this.iAtZ(z);
    return this.at(i, this.jAtY(i, y));
  }

  topAt(z: number, x: number): Pt {
    const i = this.iAtZ(z);
    return this.at(i, this.jAtX(i, x));
  }

  /** Height of the top on the centre line at fractional station i. */
  topY(i: number): number {
    const i0 = clamp(Math.floor(i), 0, this.ns - 2);
    return lerp(this.P[i0][this.Hn - 1][1], this.P[i0 + 1][this.Hn - 1][1], i - i0);
  }

  /** Fractional station index, counted from the nose (front) or tail, where the body at height y is x wide. */
  idxAtX(front: boolean, y: number, x: number): number {
    const tip = front ? this.ns - 1 : 0;
    if (x <= 1e-9) return tip;
    const step = front ? -1 : 1;
    let i = tip;
    let prev = 0;
    for (let k = 0; k < this.ns - 1; k++) {
      const nx = i + step;
      const xn = this.at(nx, this.jAtY(nx, y)).p[0];
      if (xn >= x) return i + step * ((x - prev) / Math.max(xn - prev, 1e-9));
      prev = xn;
      i = nx;
    }
    return i;
  }

  /** The nose or tail surface at lateral position x and height y. */
  endAt(front: boolean, x: number, y: number): Pt {
    const i = this.idxAtX(front, y, x);
    return this.at(i, this.jAtY(i, y));
  }
}

export interface Ctx {
  f: Frame;
  q: 0 | 1;
  surf: Surf;
  paint: Mesh;
  glass: Mesh;
  chrome: Mesh;
  black: Mesh;
  lamp: Mesh;
  tail: Mesh;
  plates: PlateMount[];
  /** Which ends get the dark plate holder behind the plate (off where the owner moved the plate away from it). */
  holders: Record<PlateEnd, boolean>;
  info: { chargePort?: "l" | "r" | "f"; exhausts: number; spokes: number };
}

const avg = (rows: Pt[][]): V3 => {
  const s: V3 = [0, 0, 0];
  for (const r of rows) for (const { n } of r) for (let k = 0; k < 3; k++) s[k] += n[k];
  return unit(s);
};

/** A quad grid lying on the body, lifted `off` metres along the surface normal. */
export function patch(m: Mesh, rows: Pt[][], off: number, color?: V3) {
  m.grid(
    rows.map((r) => r.map(({ p, n }): V3 => [p[0] + n[0] * off, p[1] + n[1] * off, p[2] + n[2] * off])),
    avg(rows),
    { color },
  );
}

/** A ribbon of `width` along a path on the body (shut lines, wipers, arch mouldings). */
export function strip(m: Mesh, pts: Pt[], width: number, off: number, color?: V3) {
  const rows: Pt[][] = pts.map((pt, k) => {
    const t = unit(sub(pts[Math.min(k + 1, pts.length - 1)].p, pts[Math.max(k - 1, 0)].p));
    const lat = unit(cross(pt.n, t));
    const side = (s: number): Pt => ({ p: [pt.p[0] + (lat[0] * s * width) / 2, pt.p[1] + (lat[1] * s * width) / 2, pt.p[2] + (lat[2] * s * width) / 2], n: pt.n });
    return [side(-1), side(1)];
  });
  patch(m, rows, off, color);
}

export type YFn = (u: number, i: number) => number;

/**
 * A patch around the nose or tail: from lateral position xa out to `end` (an x, or a z further round the corner), between two heights
 * that may depend on how far round it is. `ua`..`ub` cut a sub-range of that span.
 */
export function contour(c: Ctx, m: Mesh, front: boolean, xa: number, end: { x: number } | { z: number }, y0: YFn, y1: YFn, o: { off: number; color?: V3; nv?: number; ua?: number; ub?: number }) {
  const { surf } = c;
  const tip = front ? surf.ns - 1 : 0;
  const ym = (y0(0, tip) + y1(0, tip)) / 2;
  const ia = surf.idxAtX(front, ym, xa);
  const ib = "x" in end ? surf.idxAtX(front, ym, end.x) : surf.iAtZ(end.z);
  const iA = lerp(ia, ib, o.ua ?? 0);
  const iB = lerp(ia, ib, o.ub ?? 1);
  const nu = clamp(Math.ceil(2 * Math.abs(iB - iA)) + 1, 2, c.q ? 5 : 22);
  const nv = o.nv ?? 2;
  const rows: Pt[][] = [];
  for (let ku = 0; ku <= nu; ku++) {
    const u = lerp(o.ua ?? 0, o.ub ?? 1, ku / nu);
    const i = lerp(iA, iB, ku / nu);
    let a = y0(u, i);
    let b = y1(u, i);
    const over = Math.max(0, b - (surf.topY(i) - 0.02)); // near the tip the top is rounded down: the patch follows it
    a -= over;
    b -= over;
    const row: Pt[] = [];
    for (let kv = 0; kv <= nv; kv++) row.push(surf.at(i, surf.jAtY(i, lerp(a, b, kv / nv))));
    rows.push(row);
  }
  patch(m, rows, o.off, o.color);
}

/** A round rod between two points. */
export function rod(m: Mesh, a: V3, b: V3, r: number, seg: number, color?: V3) {
  const axis = unit(sub(b, a));
  const ref: V3 = Math.abs(axis[1]) > 0.9 ? [1, 0, 0] : [0, 1, 0];
  const e1 = unit(cross(axis, ref));
  const e2 = cross(axis, e1);
  const ring = (c: V3): V3[] =>
    Array.from({ length: seg }, (_, j) => {
      const th = (2 * Math.PI * j) / seg;
      return [c[0] + r * (Math.cos(th) * e1[0] + Math.sin(th) * e2[0]), c[1] + r * (Math.cos(th) * e1[1] + Math.sin(th) * e2[1]), c[2] + r * (Math.cos(th) * e1[2] + Math.sin(th) * e2[2])];
    });
  const mid: V3 = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
  m.grid([ring(a), ring(b)], (p) => sub(p, mid), { wrap: true, color });
}

const meshes = (c: Ctx) => [c.paint, c.glass, c.chrome, c.black, c.lamp, c.tail];

/** Run `fn` (written for the left side, +x) twice: as is, then mirrored to the right side. */
export function mirrored(c: Ctx, fn: () => void) {
  for (const m of meshes(c)) m.sx = 1;
  fn();
  for (const m of meshes(c)) m.sx = -1;
  fn();
  for (const m of meshes(c)) m.sx = 1;
}

/** Run `fn` once, on the left (+x) or the right side of the car. */
export function oneSide(c: Ctx, left: boolean, fn: () => void) {
  for (const m of meshes(c)) m.sx = left ? 1 : -1;
  fn();
  for (const m of meshes(c)) m.sx = 1;
}
