// Procedural, seamlessly tiling surface patterns for the PBR textures (components/scene/pbr.ts uploads them). Pure and deterministic: a recipe turns a point
// (u, v in 0..1, one tile) into a height, a brightness and a roughness; a job fills a whole tile in time slices (so a 512 px texture never blocks a frame for long),
// then derives the normal map from the heights and rescales colour and roughness to the shared means (ALBEDO_MEAN, ROUGH_MEAN) so the part colour stays the albedo.
// Every noise is periodic (a whole number of cells per tile), so tiles meet at their edges. Row y = v (row 0 is v = 0, "up" in texture space).
import { ALBEDO_MEAN, ROUGH_MEAN, type PbrKind } from "./materialsPbr.ts";

export type TileOpts = {
  /** Normal map wanted (the roughness and colour maps are always made). */
  normal?: boolean;
  /** tile: cells across and down one tile; stagger: every other row shifted by half a cell. */
  cols?: number;
  rows?: number;
  stagger?: boolean;
  /** woodfloor: plank width in metres (default 0.14). */
  plankW?: number;
  /** concrete: panel seams every half tile. */
  formwork?: boolean;
  seed?: number;
};

// ---- noise ------------------------------------------------------------------------------------------------------------

const hash = (x: number, y: number, s: number): number => {
  let h = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(s | 0, 1274126177);
  h = Math.imul(h ^ (h >>> 13), 1103515245);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};
const smooth = (t: number) => t * t * (3 - 2 * t);
const quintic = (t: number) => t * t * t * (t * (t * 6 - 15) + 10);
const clamp = (x: number, a = 0, b = 1) => (x < a ? a : x > b ? b : x);
const step = (a: number, b: number, x: number) => smooth(clamp((x - a) / (b - a)));
const wrap = (i: number, n: number) => ((i % n) + n) % n;
const frac = (x: number) => x - Math.floor(x);

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

/** Cellular noise with n x n jittered cells per tile: distance (in cell units) to the nearest and second nearest point, and a random 0..1 for the nearest cell. */
function worley(u: number, v: number, n: number, s: number, out: Float64Array) {
  const x = u * n, y = v * n;
  const cx = Math.floor(x), cy = Math.floor(y);
  let f1 = 9, f2 = 9, id = 0;
  for (let j = -1; j <= 1; j++)
    for (let i = -1; i <= 1; i++) {
      const gx = cx + i, gy = cy + j;
      const wx = wrap(gx, n), wy = wrap(gy, n);
      const px = gx + 0.15 + 0.7 * hash(wx, wy, s), py = gy + 0.15 + 0.7 * hash(wx, wy, s + 17);
      const d = Math.hypot(px - x, py - y);
      if (d < f1) {
        f2 = f1;
        f1 = d;
        id = hash(wx, wy, s + 53);
      } else if (d < f2) f2 = d;
    }
  out[0] = f1;
  out[1] = f2;
  out[2] = id;
}

// ---- recipes ----------------------------------------------------------------------------------------------------------
// out[0] = height 0..1, out[1] = brightness (relative: rescaled to the mean afterwards), out[2] = roughness (relative likewise).

type Px = (u: number, v: number, out: Float64Array) => void;
const W = new Float64Array(3); // scratch for worley

/** Wood grain along u: growth rings, fine fibres and open pores. `vv` may be any real (the planks of a floor sample their own stretch). */
function woodAt(u: number, vv: number, s: number, out: Float64Array) {
  const warp = fbm(u, vv, 2, 3, 3, s);
  const t = vv * 12 + (warp - 0.5) * 2.4;
  const r = 0.5 + 0.5 * Math.sin(2 * Math.PI * t);
  const band = r * r;
  const fibre = vnoise(u, vv, 3, 190, s + 1);
  const pore = step(0.84, 0.95, vnoise(u, vv, 26, 150, s + 2));
  out[0] = 0.5 + 0.12 * band + (fibre - 0.5) * 0.18 - 0.3 * pore;
  out[1] = 0.98 - 0.15 * band - 0.07 * (1 - fibre) - 0.18 * pore + 0.04 * (warp - 0.5);
  out[2] = 0.86 - 0.1 * (1 - band) + 0.12 * pore + 0.05 * (fibre - 0.5);
}

const brushed = (s: number): Px => (u, v, o) => {
  const a = vnoise(u, v, 2, 380, s), b = vnoise(u, v, 6, 190, s + 1), c = fbm(u, v, 3, 3, 2, s + 2);
  o[0] = 0.5 + (a - 0.5) * 0.3 + (b - 0.5) * 0.2;
  o[1] = 0.95 + (a - 0.5) * 0.12 + (b - 0.5) * 0.06 + (c - 0.5) * 0.12;
  o[2] = 0.75 + (a - 0.5) * 0.3 + (c - 0.5) * 0.1;
};

const noisy = (fx: number, hAmp: number, aAmp: number, rAmp: number, s: number): Px => (u, v, o) => {
  const n = fbm(u, v, fx, fx, 3, s), m = fbm(u, v, 4, 4, 2, s + 9);
  o[0] = 0.5 + (n - 0.5) * hAmp;
  o[1] = 1 + (n - 0.5) * aAmp + (m - 0.5) * aAmp * 1.4;
  o[2] = 0.9 + (n - 0.5) * rAmp;
};

/** Builds a kind's point sampler from its seed `s`, the tile options and the texture size. */
type Maker = (s: number, o: TileOpts, size: number) => Px;

const woodFloor: Maker = (s, o) => {
  const rows = Math.max(2, Math.round(1.2 / (o.plankW ?? 0.14)));
  const stagger = o.stagger !== false;
  return (u, v, out) => {
    const j = Math.floor(v * rows), fy = v * rows - j;
    const off = stagger ? hash(j, 3, s) : 0;
    const bu = frac(u - off) * 2, k = Math.floor(bu);
    const id = j * 2 + k;
    woodAt(u, hash(id, 5, s) + fy * 0.36, s + id * 7, out);
    const tone = (hash(id, 9, s) - 0.5) * 0.14;
    const seam = Math.min((Math.min(fy, 1 - fy) * 1.2) / rows / 0.0015, (Math.min(bu - k, k + 1 - bu) * 0.6) / 0.0015); // distance to a seam in units of 1.5 mm
    const groove = 1 - step(0.4, 1.6, seam);
    out[0] = out[0] * (1 - groove) + 0.1 * groove;
    out[1] = (out[1] + tone) * (1 - 0.55 * groove);
    out[2] = out[2] + 0.12 * groove;
  };
};

const fabric: Maker = (s) => {
  const n = 48;
  return (u, v, out) => {
    const x = u * n, y = v * n;
    const i = Math.floor(x), j = Math.floor(y), fx = x - i, fy = y - j;
    const warpOver = wrap(i - j, 4) < 2; // 2/2 twill
    const thread = warpOver ? Math.pow(Math.sin(Math.PI * fx), 0.7) : Math.pow(Math.sin(Math.PI * fy), 0.7);
    const slub = fbm(u, v, 6, 6, 3, s) - 0.5;
    const fuzz = vnoise(u, v, n * 4, n * 4, s + 3) - 0.5;
    const tone = (hash(warpOver ? i : j, warpOver ? 1 : 2, s) - 0.5) * 0.12;
    out[0] = 0.15 + 0.6 * thread + 0.12 * fuzz;
    out[1] = 0.8 + 0.2 * thread + slub * 0.25 + tone + fuzz * 0.1;
    out[2] = 0.95 + fuzz * 0.1;
  };
};

const leather: Maker = (s) => (u, v, out) => {
  worley(u, v, 26, s, W);
  const crease = step(0, 0.2, W[1] - W[0]);
  const grain = vnoise(u, v, 180, 180, s + 1) - 0.5;
  out[0] = 0.08 + 0.7 * Math.pow(crease, 0.6) + grain * 0.1;
  out[1] = 0.8 + 0.2 * crease + grain * 0.07 + (W[2] - 0.5) * 0.05;
  out[2] = 0.8 - 0.25 * crease + grain * 0.1;
};

const ceramic: Maker = (s) => (u, v, out) => {
  const n = fbm(u, v, 48, 48, 2, s);
  const pit = step(0.93, 0.97, vnoise(u, v, 90, 90, s + 4));
  out[0] = 0.5 + (n - 0.5) * 0.25 - 0.3 * pit;
  out[1] = 0.99 + (n - 0.5) * 0.03 - 0.1 * pit;
  out[2] = 0.85 + (n - 0.5) * 0.1 + 0.15 * pit;
};

const stone: Maker = (s) => (u, v, out) => {
  const base = fbm(u, v, 6, 6, 4, s), sp = vnoise(u, v, 120, 120, s + 2);
  const dark = 1 - step(0.08, 0.2, sp), light = step(0.88, 0.97, sp);
  out[0] = 0.5 + (fbm(u, v, 48, 48, 3, s + 5) - 0.5) * 0.5;
  out[1] = 0.9 + (base - 0.5) * 0.2 - 0.25 * dark + 0.08 * light;
  out[2] = 0.85 + (base - 0.5) * 0.2;
};

const plaster: Maker = (s) => (u, v, out) => {
  // a gentle periodic warp breaks the value noise's grid, so no squares or diamonds show
  const wu = u + (vnoise(u, v, 9, 9, s + 7) - 0.5) * 0.05, wv = v + (vnoise(u, v, 9, 9, s + 8) - 0.5) * 0.05;
  const blot = fbm(wu, wv, 6, 6, 4, s), grain = fbm(wu, wv, 128, 128, 3, s + 1);
  out[0] = 0.5 + (blot - 0.5) * 0.6 + (grain - 0.5) * 0.5;
  out[1] = 1 + (blot - 0.5) * 0.1 + (grain - 0.5) * 0.06;
  out[2] = 1 + (grain - 0.5) * 0.04;
};

const rubber: Maker = (s) => (u, v, out) => {
  const g = vnoise(u, v, 160, 160, s), n = fbm(u, v, 8, 8, 2, s + 1);
  out[0] = 0.5 + (g - 0.5) * 0.4;
  out[1] = 0.97 + (g - 0.5) * 0.08 + (n - 0.5) * 0.06;
  out[2] = 0.96;
};

const foam: Maker = (s) => (u, v, out) => {
  worley(u, v, 40, s, W);
  const pore = 1 - step(0.06, 0.3, W[0]);
  const n = fbm(u, v, 5, 5, 3, s + 2);
  out[0] = 1 - pore * 0.8;
  out[1] = 0.95 - 0.35 * pore + (n - 0.5) * 0.1;
  out[2] = 0.95;
};

const concrete: Maker = (s, o, size) => {
  const form = !!o.formwork;
  return (u, v, out) => {
    const base = fbm(u, v, 4, 4, 5, s), pore = step(0.9, 0.97, vnoise(u, v, 90, 90, s + 3));
    let seam = 0;
    if (form) {
      const px = 1 / size;
      const gx = Math.min(frac(u * 2), 1 - frac(u * 2)) / (2 * px), gy = Math.min(frac(v * 2), 1 - frac(v * 2)) / (2 * px);
      seam = 1 - step(0.5, 2.5, Math.min(gx, gy) * 0.5);
    }
    out[0] = 0.55 + (base - 0.5) * 0.3 - 0.45 * pore - 0.4 * seam;
    out[1] = 0.9 + (base - 0.5) * 0.2 - 0.35 * pore - 0.3 * seam;
    out[2] = 0.9 + (base - 0.5) * 0.1;
  };
};

const brick: Maker = (s) => (u, v, out) => {
  const x = u * 4, y = v * 12;
  const j = Math.floor(y);
  const xo = x + (j & 1) * 0.5;
  const i = Math.floor(xo);
  const d = Math.min(Math.min(xo - i, i + 1 - xo) * 0.225, Math.min(y - j, j + 1 - y) * 0.075); // metres to the nearest brick edge
  const joint = 1 - step(0.004, 0.0065, d);
  const tone = hash(wrap(i, 4), j, s), pit = fbm(u, v, 64, 64, 3, s + 1), blot = fbm(u, v, 8, 8, 3, s + 2);
  out[0] = (0.85 + (pit - 0.5) * 0.18 - 0.1 * (1 - step(0.004, 0.02, d))) * (1 - joint) + 0.4 * joint;
  out[1] = (0.72 + tone * 0.14 + (blot - 0.5) * 0.1 + (pit - 0.5) * 0.08) * (1 - joint) + 0.98 * joint + (pit - 0.5) * 0.06 * joint;
  out[2] = 0.88 * (1 - joint) + 1 * joint;
};

const tile: Maker = (s, o) => {
  const cols = Math.max(1, o.cols ?? 2), rows = Math.max(1, o.rows ?? 2);
  const cw = 0.6 / cols, ch = 0.6 / rows;
  return (u, v, out) => {
    const y = v * rows, j = Math.floor(y);
    const x = u * cols + (o.stagger && j & 1 ? 0.5 : 0);
    const i = Math.floor(x);
    const d = Math.min(Math.min(x - i, i + 1 - x) * cw, Math.min(y - j, j + 1 - y) * ch);
    const grout = 1 - step(0.0013, 0.0027, d);
    const tone = hash(wrap(i, cols), j, s) - 0.5, glaze = fbm(u, v, 48, 48, 2, s + 1) - 0.5;
    out[0] = (0.85 - 0.12 * (1 - step(0.0027, 0.006, d)) + glaze * 0.06) * (1 - grout) + 0.4 * grout;
    out[1] = (0.98 + tone * 0.06 + glaze * 0.02) * (1 - grout) + 0.78 * grout;
    out[2] = 0.5 * (1 - grout) + 1 * grout + glaze * 0.08;
  };
};

const bark: Maker = (s) => (u, v, out) => {
  const n = fbm(u, v, 9, 2, 4, s), ridge = 1 - Math.abs(2 * n - 1), broad = fbm(u, v, 3, 3, 3, s + 1);
  const r2 = ridge * ridge;
  out[0] = r2;
  out[1] = 0.62 + 0.38 * Math.pow(ridge, 1.5) + (broad - 0.5) * 0.15;
  out[2] = 0.97;
};

const leaf: Maker = (s) => (u, v, out) => {
  const dm = Math.abs(u - 0.5) * 2; // 0 on the midrib, 1 at the blade edge
  const mid = 1 - step(0.02, 0.07, dm) * 1;
  const side = frac(v * 9 - dm * 4.5);
  const vein = (1 - step(0.02, 0.08, Math.min(side, 1 - side))) * (1 - step(0.4, 1, dm)) * 0.8;
  const puck = fbm(u, v, 14, 14, 3, s) - 0.5;
  out[0] = 0.55 - 0.35 * Math.max(mid, vein) + puck * 0.35;
  out[1] = 0.88 + 0.2 * Math.max(mid, vein) + puck * 0.08 - 0.12 * dm * dm;
  out[2] = 0.8 - 0.05 * puck;
};

const carpet: Maker = (s) => (u, v, out) => {
  const a = vnoise(u, v, 200, 200, s), b = vnoise(u, v, 96, 96, s + 1), n = fbm(u, v, 6, 6, 3, s + 2);
  out[0] = 0.5 + (a - 0.5) * 0.5 + (b - 0.5) * 0.3;
  out[1] = 0.9 + (a - 0.5) * 0.25 + (b - 0.5) * 0.15 + (n - 0.5) * 0.12;
  out[2] = 1;
};

const paving: Maker = (s) => (u, v, out) => {
  const n = 3, x = u * n, y = v * n, i = Math.floor(x), j = Math.floor(y);
  const d = Math.min(Math.min(x - i, i + 1 - x), Math.min(y - j, j + 1 - y)) * 0.8 / n;
  const joint = 1 - step(0.004, 0.008, d);
  const tone = hash(wrap(i, n), wrap(j, n), s) - 0.5, g = fbm(u, v, 40, 40, 3, s + 1) - 0.5;
  out[0] = (0.8 + g * 0.3) * (1 - joint) + 0.3 * joint;
  out[1] = (0.9 + tone * 0.15 + g * 0.12) * (1 - joint) + 0.55 * joint;
  out[2] = 0.9 * (1 - joint) + joint;
};

/** Irregular stones separated by a gap: cobbles are domed, flagstones flat. */
const stones = (cobble: boolean): Maker => (s) => {
  const cells = cobble ? 8 : 4;
  const gap = cobble ? 0.12 : 0.07;
  return (u, v, out) => {
    worley(u, v, cells, s, W);
    const edge = W[1] - W[0];
    const joint = 1 - step(gap * 0.5, gap * 1.4, edge);
    const dome = cobble ? step(0, 0.6, edge) : 0.85;
    const g = fbm(u, v, 36, 36, 3, s + 1) - 0.5;
    out[0] = (0.35 + 0.55 * dome + g * 0.15) * (1 - joint) + 0.1 * joint;
    out[1] = (0.85 + (W[2] - 0.5) * 0.3 + g * 0.14) * (1 - joint) + 0.5 * joint;
    out[2] = 0.9 * (1 - joint) + joint;
  };
};

const MAKERS: Record<PbrKind, Maker> = {
  wood: (s) => (u, v, out) => woodAt(u, v, s, out),
  woodfloor: woodFloor,
  fabric,
  leather,
  metal: (s) => brushed(s),
  plastic: (s) => noisy(64, 0.3, 0.06, 0.2, s),
  ceramic,
  stone,
  paint: (s) => noisy(80, 0.35, 0.03, 0.1, s),
  plaster,
  rubber,
  foam,
  concrete,
  brick,
  tile,
  bark,
  leaf,
  carpet,
  paving,
  cobble: stones(true),
  flagstone: stones(false),
};

const recipe = (kind: PbrKind, o: TileOpts, size: number): Px => MAKERS[kind]((o.seed ?? 0) * 101 + KIND_SEED[kind], o, size);

const KIND_SEED: Record<PbrKind, number> = { wood: 1, fabric: 2, leather: 3, metal: 4, plastic: 5, ceramic: 6, stone: 7, paint: 8, rubber: 9, foam: 10, plaster: 11, brick: 12, tile: 13, woodfloor: 14, concrete: 15, bark: 16, leaf: 17, carpet: 18, paving: 19, cobble: 20, flagstone: 21 };

/** How strong the normal map's relief is (bigger = deeper grain, weave, mortar). */
const BUMP: Record<PbrKind, number> = { wood: 5, fabric: 9, leather: 8, metal: 4, plastic: 3, ceramic: 2, stone: 5, paint: 3, rubber: 4, foam: 6, plaster: 2.5, brick: 9, tile: 10, woodfloor: 6, concrete: 6, bark: 12, leaf: 7, carpet: 5, paving: 9, cobble: 12, flagstone: 10 };

/** Kinds whose detail is fine noise: more than 512 px adds nothing, so their textures are never larger. */
export const NOISE_ONLY: readonly PbrKind[] = ["plastic", "ceramic", "stone", "paint", "plaster", "rubber", "foam", "concrete", "carpet", "metal", "leather"];

// ---- the job ----------------------------------------------------------------------------------------------------------

export type TileJob = {
  size: number;
  /** RGBA bytes, grey colour multiplier. */
  albedo: Uint8Array;
  /** RGBA bytes, grey roughness multiplier. */
  rough: Uint8Array;
  /** RGBA bytes, tangent-space normals; filled only when `normal` was asked for (now or later through `wantNormal`). */
  normal: Uint8Array;
  readonly done: boolean;
  readonly normalDone: boolean;
  wantNormal(): void;
  /** Work for at most `budgetMs` (checked every few rows); returns true while there is more to do. */
  run(budgetMs: number, now: () => number): boolean;
};

/** Greyscale albedo and roughness bytes for one row, after the mean rescale. */
function shadeColourRow(a: Float32Array, r: Float32Array, ka: number, kr: number, albedo: Uint8Array, rough: Uint8Array, row: number, size: number) {
  for (let i = row * size, end = i + size; i < end; i++) {
    const av = clamp(a[i] * ka) * 255, rv = clamp(r[i] * kr) * 255, o = i * 4;
    albedo[o] = albedo[o + 1] = albedo[o + 2] = av;
    rough[o] = rough[o + 1] = rough[o + 2] = rv;
    albedo[o + 3] = rough[o + 3] = 255;
  }
}

/** Tangent-space normals for one row from central height differences (wrapping at the tile edge, so the map tiles). */
function writeNormalRow(height: Float32Array, normal: Uint8Array, row: number, size: number, bump: number) {
  const ya = wrap(row - 1, size) * size, yb = wrap(row + 1, size) * size, y0 = row * size;
  for (let x = 0; x < size; x++) {
    const xa = wrap(x - 1, size), xb = wrap(x + 1, size);
    const dx = (height[y0 + xb] - height[y0 + xa]) * bump, dy = (height[yb + x] - height[ya + x]) * bump;
    const inv = 1 / Math.sqrt(dx * dx + dy * dy + 1), o = (y0 + x) * 4;
    normal[o] = (-dx * inv * 0.5 + 0.5) * 255;
    normal[o + 1] = (-dy * inv * 0.5 + 0.5) * 255;
    normal[o + 2] = (inv * 0.5 + 0.5) * 255;
    normal[o + 3] = 255;
  }
}

export function createTileJob(kind: PbrKind, size: number, opts: TileOpts = {}): TileJob {
  const px = recipe(kind, opts, size);
  const n = size * size;
  const height = new Float32Array(n);
  const albedo = new Uint8Array(n * 4);
  const rough = new Uint8Array(n * 4);
  const normal = new Uint8Array(n * 4);
  const a = new Float32Array(n), r = new Float32Array(n);
  const out = new Float64Array(3);
  let wantN = !!opts.normal;
  let stage: "sample" | "finish" | "normal" | "idle" = "sample";
  let colourDone = false;
  let normalFilled = false;
  let row = 0;
  let sumA = 0, sumR = 0;
  const isIdle = () => stage === "idle";

  const sample = () => {
    for (let k = 0; k < 4 && row < size; k++, row++) {
      const v = (row + 0.5) / size;
      for (let x = 0; x < size; x++) {
        px((x + 0.5) / size, v, out);
        const i = row * size + x;
        height[i] = out[0];
        a[i] = out[1];
        r[i] = out[2];
        sumA += out[1];
        sumR += out[2];
      }
    }
    if (row >= size) {
      stage = "finish";
      row = 0;
    }
  };
  let ka = 1, kr = 1;
  const finish = () => {
    if (row === 0) {
      ka = ALBEDO_MEAN / (sumA / n);
      kr = ROUGH_MEAN / (sumR / n);
    }
    for (let k = 0; k < 32 && row < size; k++, row++) shadeColourRow(a, r, ka, kr, albedo, rough, row, size);
    if (row < size) return;
    colourDone = true;
    row = 0;
    stage = wantN ? "normal" : "idle";
  };
  const relief = () => {
    const bump = BUMP[kind];
    for (let k = 0; k < 16 && row < size; k++, row++) writeNormalRow(height, normal, row, size, bump);
    if (row >= size) {
      normalFilled = true;
      stage = "idle";
    }
  };

  return {
    size,
    albedo,
    rough,
    normal,
    get done() {
      return colourDone;
    },
    get normalDone() {
      return normalFilled;
    },
    wantNormal() {
      wantN = true;
      if (stage === "idle" && !normalFilled) {
        row = 0;
        stage = "normal";
      }
    },
    run(budgetMs, now) {
      const t0 = now();
      while (!isIdle()) {
        if (stage === "sample") sample();
        else if (stage === "finish") finish();
        else relief();
        if (!isIdle() && now() - t0 >= budgetMs) return true;
      }
      return false;
    },
  };
}
