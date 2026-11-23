// Finds trees in an aerial photo, from pixels alone. A HEURISTIC, not a model: it says "something dark, green and speckled is about here, about this wide",
// which is what the 3D scene needs to put a believable tree there. It does not know species, will miss single trees under 3 m crowns, merges very tight
// groves, and calls a dark green hedge, a bush or a green car-park roof a tree now and then. Typical aerial summer images in a leafy neighbourhood: most
// crowns found within about a crown width of their real place, counts within roughly +-30 %. Winter or leafless images find little.
//
// Steps: (1) per pixel, "vegetation" = green-dominant (excess green) and not a bright smooth lawn (lawns are light and even, crowns darker and speckled);
// (2) smooth the mask; (3) distance from each canopy pixel to the nearest non-canopy pixel; (4) crown tops = local maxima of the lit brightness (crowns are lit
// on top, dark between neighbours) plus that distance; (5) crown width from the distance to the canopy edge and to the next crown top. Deterministic.
// Pure (no DOM): `node --test` runs it on synthetic images. Imports carry a .ts extension or are type-only.
import type { SiteTree, XY } from "./siteTypes.ts";

export type Rgba = { data: Uint8ClampedArray | Uint8Array; width: number; height: number };
type CanopyOptions = {
  metresPerPixel: number;
  /** Pixel (column, row; the pixel's centre is +0.5) to site metres. */
  toSite: (px: number, py: number) => XY;
  maxTrees?: number;
};

const MAX_PHOTO_TREES = 2500;
const CROWN_MIN = 2;
const CROWN_MAX = 16;
const MIN_SEP_M = 6.5; // two crown tops closer than this are one crown
const MIN_WIDTH_M = 4; // a canopy blob narrower than this at its widest is a bush, a hedge or noise
const MIN_AREA_M2 = 4; // a canopy blob smaller than this is a bush or noise
const EXG_MIN = 18; // excess green 2g-r-b
const SHADOW_V = 28; // darker than this is shadow or black, not leaf
const LAWN_V = 48; // brighter AND smoother than this is lawn (shaded crowns are darker, lit ones rougher)
const LAWN_STD = 6;
const TOP_WEIGHT = 12; // grey levels of "tallness" per metre of canopy depth

type Pause = () => Promise<void>;

/** Sum over a (2r+1)^2 window, edges clamped, from separable running sums: the whole image in O(w*h). */
function boxSum(src: Float32Array, w: number, h: number, r: number): Float32Array {
  const tmp = new Float32Array(w * h);
  const out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    const row = y * w;
    let s = 0;
    for (let x = -r; x <= r; x++) s += src[row + Math.min(w - 1, Math.max(0, x))];
    for (let x = 0; x < w; x++) {
      tmp[row + x] = s;
      s += src[row + Math.min(w - 1, x + r + 1)] - src[row + Math.max(0, x - r)];
    }
  }
  for (let x = 0; x < w; x++) {
    let s = 0;
    for (let y = -r; y <= r; y++) s += tmp[Math.min(h - 1, Math.max(0, y)) * w + x];
    for (let y = 0; y < h; y++) {
      out[y * w + x] = s;
      s += tmp[Math.min(h - 1, y + r + 1) * w + x] - tmp[Math.max(0, y - r) * w + x];
    }
  }
  return out;
}

/** Distance (in pixels, 3-4 chamfer) from each canopy pixel to the nearest pixel that is not canopy. */
function distanceToEdge(mask: Uint8Array, w: number, h: number): Float32Array {
  const INF = 1e9;
  const d = new Float32Array(w * h);
  for (let i = 0; i < d.length; i++) d[i] = mask[i] ? INF : 0;
  const A = 1;
  const B = Math.SQRT2;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (!d[i]) continue;
      let v = d[i];
      // the border counts as an edge only for blobs that really end there: treat outside as canopy (a tree cut by the image edge keeps its size)
      if (x > 0) v = Math.min(v, d[i - 1] + A);
      if (y > 0) {
        v = Math.min(v, d[i - w] + A);
        if (x > 0) v = Math.min(v, d[i - w - 1] + B);
        if (x < w - 1) v = Math.min(v, d[i - w + 1] + B);
      }
      d[i] = v;
    }
  }
  for (let y = h - 1; y >= 0; y--) {
    for (let x = w - 1; x >= 0; x--) {
      const i = y * w + x;
      if (!d[i]) continue;
      let v = d[i];
      if (x < w - 1) v = Math.min(v, d[i + 1] + A);
      if (y < h - 1) {
        v = Math.min(v, d[i + w] + A);
        if (x < w - 1) v = Math.min(v, d[i + w + 1] + B);
        if (x > 0) v = Math.min(v, d[i + w - 1] + B);
      }
      d[i] = v;
    }
  }
  return d;
}

/** Max over a (2r+1)^2 window. */
function maxFilter(src: Float32Array, w: number, h: number, r: number): Float32Array {
  const tmp = new Float32Array(w * h);
  const out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let m = -Infinity;
      for (let k = Math.max(0, x - r); k <= Math.min(w - 1, x + r); k++) m = Math.max(m, src[y * w + k]);
      tmp[y * w + x] = m;
    }
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let m = -Infinity;
      for (let k = Math.max(0, y - r); k <= Math.min(h - 1, y + r); k++) m = Math.max(m, tmp[k * w + x]);
      out[y * w + x] = m;
    }
  }
  return out;
}

/** Stage 1 and 2: the smoothed canopy mask and the brightness of each pixel. */
function canopyMask(img: Rgba): { mask: Uint8Array; lum: Float32Array } {
  const { data, width: w, height: h } = img;
  const n = w * h;
  const lum = new Float32Array(n);
  const lum2 = new Float32Array(n);
  const green = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    const r = data[i * 4];
    const g = data[i * 4 + 1];
    const b = data[i * 4 + 2];
    const v = 0.299 * r + 0.587 * g + 0.114 * b;
    lum[i] = v;
    lum2[i] = v * v;
    green[i] = g > r && g >= b && 2 * g - r - b > EXG_MIN && v > SHADOW_V ? 1 : 0;
  }
  // texture: standard deviation of brightness over 3x3 pixels (it grows a crown by one pixel into a lawn: the price of seeing the speckle)
  const s1 = boxSum(lum, w, h, 1);
  const s2 = boxSum(lum2, w, h, 1);
  const raw = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const std = Math.sqrt(Math.max(0, s2[i] / 9 - (s1[i] / 9) ** 2));
    raw[i] = green[i] && !(lum[i] > LAWN_V && std < LAWN_STD) ? 1 : 0;
  }
  // close: fill the 1-2 pixel gaps inside a crown (smooth lit patches look like lawn), by growing then shrinking one pixel
  const grown = boxSum(raw, w, h, 1);
  for (let i = 0; i < n; i++) grown[i] = grown[i] > 0 ? 1 : 0;
  const closing = boxSum(grown, w, h, 1);
  for (let i = 0; i < n; i++) raw[i] = closing[i] >= 9 ? 1 : 0;
  // smooth: a pixel is canopy when most of its 3x3 neighbourhood is (drops single pixels)
  const sm = boxSum(raw, w, h, 1);
  const mask = new Uint8Array(n);
  for (let i = 0; i < n; i++) mask[i] = sm[i] >= 5 ? 1 : 0;
  return { mask, lum };
}

/** Drops canopy blobs smaller than `minPixels` (connected components, 4-neighbourhood). */
function dropSmallBlobs(mask: Uint8Array, w: number, h: number, minPixels: number): void {
  const seen = new Uint8Array(w * h);
  const stack: number[] = [];
  for (let s = 0; s < mask.length; s++) {
    if (!mask[s] || seen[s]) continue;
    const blob: number[] = [];
    seen[s] = 1;
    stack.push(s);
    while (stack.length) {
      const i = stack.pop() as number;
      blob.push(i);
      const x = i % w;
      for (const j of [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, i >= w ? i - w : -1, i < w * h - w ? i + w : -1]) {
        if (j >= 0 && mask[j] && !seen[j]) {
          seen[j] = 1;
          stack.push(j);
        }
      }
    }
    if (blob.length < minPixels) for (const i of blob) mask[i] = 0;
  }
}

type Peak = { x: number; y: number; d: number; s: number };
/** Peaks bucketed in cells of `sepPx` (key = row * GRID_KEY + column) so "too close to a taken peak" only looks at the 3x3 cells around. */
type PeakGrid = Map<number, Peak[]>;
const GRID_KEY = 100003;

/** Crown-top score per canopy pixel: mean lit brightness of the canopy around (normalised convolution) plus depth inside the canopy; -Infinity off the canopy. */
function crownScore(mask: Uint8Array, lum: Float32Array, dist: Float32Array, w: number, h: number, mpp: number): Float32Array {
  const sr = Math.max(1, Math.round(2.4 / mpp));
  const lm = new Float32Array(w * h);
  for (let i = 0; i < lm.length; i++) lm[i] = mask[i] ? lum[i] : 0;
  const mf = new Float32Array(mask);
  const sl = boxSum(lm, w, h, sr);
  const sm = boxSum(mf, w, h, sr);
  const score = new Float32Array(w * h);
  const tallness = TOP_WEIGHT / mpp; // per pixel of distance
  for (let i = 0; i < score.length; i++) score[i] = mask[i] ? sl[i] / Math.max(1, sm[i]) + dist[i] * tallness + (i % 7) * 1e-4 : -Infinity;
  return score;
}

/** Local maxima of the score, strongest first, kept unless a stronger one is closer than MIN_SEP_M; at most `cap`. */
function pickPeaks(mask: Uint8Array, dist: Float32Array, score: Float32Array, top: Float32Array, w: number, h: number, mpp: number, cap: number): { peaks: Peak[]; grid: PeakGrid } {
  const cands: Peak[] = [];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (mask[i] && score[i] === top[i]) cands.push({ x, y, d: dist[i], s: score[i] });
    }
  }
  cands.sort((a, b) => b.s - a.s || a.y - b.y || a.x - b.x);
  const sepPx = MIN_SEP_M / mpp;
  const peaks: Peak[] = [];
  const grid: PeakGrid = new Map();
  const cell = (v: number) => Math.floor(v / sepPx);
  for (const c of cands) {
    const cx = cell(c.x);
    const cy = cell(c.y);
    let near = false;
    for (let gy = cy - 1; gy <= cy + 1 && !near; gy++) {
      for (let gx = cx - 1; gx <= cx + 1 && !near; gx++) {
        near = (grid.get(gy * GRID_KEY + gx) ?? []).some((p) => Math.hypot(p.x - c.x, p.y - c.y) < sepPx);
      }
    }
    if (near) continue;
    peaks.push(c);
    const k = cy * GRID_KEY + cx;
    grid.set(k, [...(grid.get(k) ?? []), c]);
    if (peaks.length >= cap) break;
  }
  return { peaks, grid };
}

/** Crown width of one peak from its depth in the canopy and the gap to the nearest other crown top; null for a speckle of green. */
function crownWidth(p: Peak, grid: PeakGrid, mpp: number): number | null {
  const cell = (v: number) => Math.floor(v / (MIN_SEP_M / mpp));
  let nn = Infinity; // nearest other crown top: touching crowns share the gap
  const cx = cell(p.x);
  const cy = cell(p.y);
  for (let gy = cy - 3; gy <= cy + 3; gy++) {
    for (let gx = cx - 3; gx <= cx + 3; gx++) {
      for (const q of grid.get(gy * GRID_KEY + gx) ?? []) if (q !== p) nn = Math.min(nn, Math.hypot(q.x - p.x, q.y - p.y));
    }
  }
  const byEdge = 2 * (p.d - 0.5) * mpp; // chamfer distance to the first non-canopy pixel is the radius + half a pixel
  if (byEdge < MIN_WIDTH_M) return null; // a speckle of green, not a crown
  return Math.min(CROWN_MAX, Math.max(CROWN_MIN, Math.min(byEdge, Number.isFinite(nn) ? nn * mpp : Infinity)));
}

/** Trees found in `img`, strongest first. `pause` (optional) is awaited between the heavy steps so a browser can paint. */
export async function detectTrees(img: Rgba, opts: CanopyOptions, pause?: Pause): Promise<SiteTree[]> {
  const { width: w, height: h } = img;
  const mpp = opts.metresPerPixel;
  const cap = Math.min(opts.maxTrees ?? MAX_PHOTO_TREES, MAX_PHOTO_TREES);
  if (w < 3 || h < 3 || !(mpp > 0) || img.data.length < w * h * 4) return [];

  const { mask, lum } = canopyMask(img);
  await pause?.();
  dropSmallBlobs(mask, w, h, Math.max(3, Math.round(MIN_AREA_M2 / (mpp * mpp))));
  const dist = distanceToEdge(mask, w, h);
  await pause?.();
  const score = crownScore(mask, lum, dist, w, h, mpp);
  await pause?.();
  const top = maxFilter(score, w, h, Math.max(1, Math.round(MIN_SEP_M / 2 / mpp)));
  await pause?.();

  const { peaks, grid } = pickPeaks(mask, dist, score, top, w, h, mpp, cap);
  const trees: SiteTree[] = [];
  for (const p of peaks) {
    const crown = crownWidth(p, grid, mpp);
    if (crown === null) continue;
    const [x, y] = opts.toSite(p.x + 0.5, p.y + 0.5);
    trees.push({ x, y, height: Math.min(22, Math.max(3, 4 + 0.9 * crown)), crown, leaf: "broad", source: "photo" });
  }
  return trees;
}
