// Periodic noise for the procedural PBR tiles (pbrTiles.ts, pbrGround.ts). Pure and deterministic. Every lattice wraps after a whole number of cells per tile,
// so anything built from these meets itself at the tile edges.

export const hash = (x: number, y: number, s: number): number => {
  let h = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(s | 0, 1274126177);
  h = Math.imul(h ^ (h >>> 13), 1103515245);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};
export const smooth = (t: number) => t * t * (3 - 2 * t);
const quintic = (t: number) => t * t * t * (t * (t * 6 - 15) + 10);
export const clamp = (x: number, a = 0, b = 1) => (x < a ? a : x > b ? b : x);
export const step = (a: number, b: number, x: number) => smooth(clamp((x - a) / (b - a)));
export const wrap = (i: number, n: number) => ((i % n) + n) % n;
export const frac = (x: number) => x - Math.floor(x);

/** Value noise 0..1 with `fx` x `fy` lattice cells per tile (periodic). */
export function vnoise(u: number, v: number, fx: number, fy: number, s: number): number {
  const x = u * fx, y = v * fy;
  const x0 = Math.floor(x), y0 = Math.floor(y);
  const tx = quintic(x - x0), ty = quintic(y - y0);
  const xa = wrap(x0, fx), xb = wrap(x0 + 1, fx), ya = wrap(y0, fy), yb = wrap(y0 + 1, fy);
  const a = hash(xa, ya, s), b = hash(xb, ya, s), c = hash(xa, yb, s), d = hash(xb, yb, s);
  return a + (b - a) * tx + (c - a) * ty + (a - b - c + d) * tx * ty;
}

/** Fractal noise 0..1: `oct` octaves, each twice as fine and half as strong. */
export function fbm(u: number, v: number, fx: number, fy: number, oct: number, s: number): number {
  let sum = 0, amp = 1, tot = 0;
  for (let o = 0; o < oct; o++) {
    sum += amp * vnoise(u, v, fx << o, fy << o, s + o * 31);
    tot += amp;
    amp *= 0.5;
  }
  return sum / tot;
}

/**
 * Cellular noise with n x ny (default n x n) jittered cells per tile: distance (in cell units) to the nearest and second nearest point, and a random 0..1 for the
 * nearest cell; when `out` has 5 slots also the offset (cell units) from the pixel to that nearest point in out[3], out[4]. Unequal counts stretch the cells along the axis with fewer of them (flakes, planks). `u`/`v` may be any real (an integer shear keeps it periodic).
 */
export function worley(u: number, v: number, n: number, s: number, out: Float64Array, ny = n) {
  const x = u * n, y = v * ny;
  const cx = Math.floor(x), cy = Math.floor(y);
  let f1 = 81, f2 = 81, id = 0, nearDx = 0, nearDy = 0;
  for (let j = -1; j <= 1; j++)
    for (let i = -1; i <= 1; i++) {
      const gx = cx + i, gy = cy + j;
      const wx = wrap(gx, n), wy = wrap(gy, ny);
      const dx = gx + 0.15 + 0.7 * hash(wx, wy, s) - x, dy = gy + 0.15 + 0.7 * hash(wx, wy, s + 17) - y;
      const d = dx * dx + dy * dy; // squared: the root is taken once at the end
      if (d < f1) {
        f2 = f1;
        f1 = d;
        id = hash(wx, wy, s + 53);
        nearDx = dx;
        nearDy = dy;
      } else if (d < f2) f2 = d;
    }
  out[0] = Math.sqrt(f1);
  out[1] = Math.sqrt(f2);
  out[2] = id;
  if (out.length > 4) {
    out[3] = nearDx;
    out[4] = nearDy;
  }
}

/** Hash of lattice point (i, j) of a diagonal noise: points `(Fa, Fl)` apart are the same point, which is exactly what makes it repeat once per tile. */
const diagLat = (i: number, j: number, fa: number, fl: number, s: number): number => {
  let a = wrap(i, 2 * fa), b = wrap(j, 2 * fl);
  if (a >= fa) {
    a -= fa;
    b = wrap(b - fl, 2 * fl);
  }
  return hash(a, b, s);
};

/**
 * Value noise 0..1 on a lattice turned 45 degrees (`sgn` = 1 or -1 picks the diagonal): `fa` cells per tile across the stripes, `fl` along them, so fa >> fl gives
 * thin strands lying at 45 degrees (an axis-aligned lattice can only stretch noise along x or y). Periodic: a whole tile step moves by a lattice vector.
 */
export function dnoise(u: number, v: number, sgn: 1 | -1, fa: number, fl: number, s: number): number {
  const x = (u + sgn * v) * fa, y = (v - sgn * u) * fl;
  const x0 = Math.floor(x), y0 = Math.floor(y);
  const tx = quintic(x - x0), ty = quintic(y - y0);
  const a = diagLat(x0, y0, fa, fl, s), b = diagLat(x0 + 1, y0, fa, fl, s), c = diagLat(x0, y0 + 1, fa, fl, s), d = diagLat(x0 + 1, y0 + 1, fa, fl, s);
  return a + (b - a) * tx + (c - a) * ty + (a - b - c + d) * tx * ty;
}
