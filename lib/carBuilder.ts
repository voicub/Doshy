import { clamp, type V3 } from "./mathUtil.ts";

// Tiny indexed-mesh builder for the procedural cars (lib/carGeometry.ts). Plain arrays, no three.js, so it runs in the tests.
// Everything is built for the car's left side (+x) and mirrored with `both`, which makes the cars exactly symmetric.

export type MeshData = { pos: Float32Array; nor: Float32Array; col: Float32Array; idx: Uint32Array };

export const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
export const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const unit = (a: V3): V3 => {
  const l = Math.hypot(a[0], a[1], a[2]);
  return l < 1e-12 ? [0, 0, 0] : [a[0] / l, a[1] / l, a[2] / l];
};
export const smooth = (a: number, b: number, v: number) => {
  const t = clamp((v - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

export class Mesh {
  pos: number[] = [];
  col: number[] = [];
  idx: number[] = [];
  /** -1 while the right-hand copy is being built: x is mirrored and the winding flipped. */
  sx = 1;

  vert(p: V3, c: V3 = [1, 1, 1]): number {
    this.pos.push(p[0] * this.sx, p[1], p[2]);
    this.col.push(c[0], c[1], c[2]);
    return this.pos.length / 3 - 1;
  }

  tri(a: number, b: number, c: number) {
    if (this.sx < 0) this.idx.push(a, c, b);
    else this.idx.push(a, b, c);
  }

  both(fn: () => void) {
    this.sx = 1;
    fn();
    this.sx = -1;
    fn();
    this.sx = 1;
  }

  /**
   * A grid of points rows[i][j] as quads. `outward` is a direction (or a function of a point) the surface must face: the winding is
   * chosen to match it, so callers never have to think about orientation. Returns the index of the first vertex.
   */
  grid(rows: V3[][], outward: V3 | ((p: V3) => V3), opts: { wrap?: boolean; color?: V3 } = {}): number {
    const base = this.pos.length / 3;
    const nr = rows.length;
    const nc = rows[0].length;
    for (const row of rows) for (const p of row) this.vert(p, opts.color);
    const cols = opts.wrap ? nc : nc - 1;
    // orientation: a vote over every quad (a single quad can be degenerate or flat against the hint)
    let score = 0;
    for (let i = 0; i < nr - 1; i++) {
      for (let j = 0; j < cols; j++) {
        const a = rows[i][j];
        const n = cross(sub(rows[i][(j + 1) % nc], a), sub(rows[i + 1][j], a));
        score += dot(n, typeof outward === "function" ? outward(a) : outward);
      }
    }
    const flip = score < 0;
    for (let i = 0; i < nr - 1; i++) {
      for (let j = 0; j < cols; j++) {
        const a = base + i * nc + j;
        const b = base + i * nc + ((j + 1) % nc);
        const c = a + nc;
        const d = b + nc;
        if (flip) {
          this.tri(a, c, b);
          this.tri(b, c, d);
        } else {
          this.tri(a, b, c);
          this.tri(b, d, c);
        }
      }
    }
    return base;
  }

  /** Axis-aligned box with its own flat faces. */
  box(c: V3, s: V3, color?: V3) {
    const [hx, hy, hz] = [s[0] / 2, s[1] / 2, s[2] / 2];
    const p = (x: number, y: number, z: number): V3 => [c[0] + x * hx, c[1] + y * hy, c[2] + z * hz];
    const faces: [V3, V3[][]][] = [
      [[1, 0, 0], [[p(1, -1, -1), p(1, -1, 1)], [p(1, 1, -1), p(1, 1, 1)]]],
      [[-1, 0, 0], [[p(-1, -1, -1), p(-1, -1, 1)], [p(-1, 1, -1), p(-1, 1, 1)]]],
      [[0, 1, 0], [[p(-1, 1, -1), p(-1, 1, 1)], [p(1, 1, -1), p(1, 1, 1)]]],
      [[0, -1, 0], [[p(-1, -1, -1), p(-1, -1, 1)], [p(1, -1, -1), p(1, -1, 1)]]],
      [[0, 0, 1], [[p(-1, -1, 1), p(-1, 1, 1)], [p(1, -1, 1), p(1, 1, 1)]]],
      [[0, 0, -1], [[p(-1, -1, -1), p(-1, 1, -1)], [p(1, -1, -1), p(1, 1, -1)]]],
    ];
    for (const [n, rows] of faces) this.grid(rows, n, { color });
  }

  /** Ellipsoid with semi-axes r, centred on c. */
  ellipsoid(c: V3, r: V3, nu: number, nv: number, color?: V3) {
    const rows: V3[][] = [];
    for (let i = 0; i <= nv; i++) {
      const phi = (Math.PI * i) / nv;
      const row: V3[] = [];
      for (let j = 0; j < nu; j++) {
        const th = (2 * Math.PI * j) / nu;
        row.push([c[0] + r[0] * Math.sin(phi) * Math.cos(th), c[1] + r[1] * Math.cos(phi), c[2] + r[2] * Math.sin(phi) * Math.sin(th)]);
      }
      rows.push(row);
    }
    this.grid(rows, (p) => sub(p, c), { wrap: true, color });
  }

  /**
   * Surface of revolution. `profile` is [radius, offset along the axis]; the axis runs through `c` along x or z.
   * The result faces away from the axis, or along `hint` when given (flat discs).
   */
  lathe(c: V3, axis: "x" | "z", profile: [number, number][], seg: number, color?: V3, hint?: V3) {
    const rows: V3[][] = profile.map(([r, h]) => {
      const row: V3[] = [];
      for (let j = 0; j < seg; j++) {
        const a = (2 * Math.PI * j) / seg;
        const u = r * Math.cos(a);
        const v = r * Math.sin(a);
        row.push(axis === "x" ? [c[0] + h, c[1] + u, c[2] + v] : [c[0] + u, c[1] + v, c[2] + h]);
      }
      return row;
    });
    this.grid(
      rows,
      hint ??
        ((p) => {
          const d = sub(p, c);
          return axis === "x" ? [0, d[1], d[2]] : [d[0], d[1], 0];
        }),
      { wrap: true, color },
    );
  }

  /** Smooth normals, each face weighted by its angle at the vertex. */
  normals(): Float32Array {
    const n = new Float32Array(this.pos.length);
    const P = (i: number): V3 => [this.pos[i * 3], this.pos[i * 3 + 1], this.pos[i * 3 + 2]];
    for (let t = 0; t < this.idx.length; t += 3) {
      const ids = [this.idx[t], this.idx[t + 1], this.idx[t + 2]];
      const p = ids.map(P);
      const fn = unit(cross(sub(p[1], p[0]), sub(p[2], p[0])));
      if (fn[0] === 0 && fn[1] === 0 && fn[2] === 0) continue;
      for (let k = 0; k < 3; k++) {
        const e1 = unit(sub(p[(k + 1) % 3], p[k]));
        const e2 = unit(sub(p[(k + 2) % 3], p[k]));
        const w = Math.acos(clamp(dot(e1, e2), -1, 1));
        n[ids[k] * 3] += fn[0] * w;
        n[ids[k] * 3 + 1] += fn[1] * w;
        n[ids[k] * 3 + 2] += fn[2] * w;
      }
    }
    for (let i = 0; i < n.length; i += 3) {
      const l = Math.hypot(n[i], n[i + 1], n[i + 2]);
      if (l < 1e-12) n[i + 1] = 1;
      else {
        n[i] /= l;
        n[i + 1] /= l;
        n[i + 2] /= l;
      }
    }
    return n;
  }

  data(): MeshData {
    return { pos: Float32Array.from(this.pos), nor: this.normals(), col: Float32Array.from(this.col), idx: Uint32Array.from(this.idx) };
  }
}

/** Quadratic-Bezier rounding of a polyline's corners: radius r[i] at vertex i, k[i] samples (1 = keep the sharp vertex). */
export function roundPolyline(pts: [number, number][], radius: number[], samples: number[]): [number, number][] {
  const out: [number, number][] = [];
  const n = pts.length;
  const dist = (a: [number, number], b: [number, number]) => Math.hypot(a[0] - b[0], a[1] - b[1]);
  for (let i = 0; i < n; i++) {
    const p = pts[i];
    // nearest distinct neighbours: coincident vertices (a collapsed wheel notch) must not break the rounding
    let a = i - 1;
    while (a >= 0 && dist(pts[a], p) < 1e-9) a--;
    let b = i + 1;
    while (b < n && dist(pts[b], p) < 1e-9) b++;
    const k = samples[i];
    if (k <= 1 || a < 0 || b >= n || radius[i] <= 0) {
      for (let s = 0; s < Math.max(1, k); s++) out.push(p);
      continue;
    }
    const da = dist(pts[a], p);
    const db = dist(pts[b], p);
    const lim = (d: number, j: number) => d * (radius[j] > 0 && samples[j] > 1 ? 0.5 : 0.95);
    const r = Math.min(radius[i], lim(da, a), lim(db, b));
    const ua: [number, number] = [(pts[a][0] - p[0]) / da, (pts[a][1] - p[1]) / da];
    const ub: [number, number] = [(pts[b][0] - p[0]) / db, (pts[b][1] - p[1]) / db];
    const A: [number, number] = [p[0] + ua[0] * r, p[1] + ua[1] * r];
    const B: [number, number] = [p[0] + ub[0] * r, p[1] + ub[1] * r];
    for (let s = 0; s < k; s++) {
      const t = s / (k - 1);
      const w0 = (1 - t) * (1 - t);
      const w1 = 2 * t * (1 - t);
      const w2 = t * t;
      out.push([w0 * A[0] + w1 * p[0] + w2 * B[0], w0 * A[1] + w1 * p[1] + w2 * B[1]]);
    }
  }
  return out;
}
