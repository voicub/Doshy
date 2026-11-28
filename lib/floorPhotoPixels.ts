// Turning a photo of a floor into a texture a 3D floor can repeat: crop a square patch, even out the lighting, blend the edges so the repeat shows no seams, and
// read off the average colour, a rough roughness and a normal map. Plain RGBA bytes in and out (what a canvas gives and takes), no browser objects. Pure.
// The node test runner loads this file directly: .ts import extensions.

/** RGBA bytes, row by row from the top. `ImageData.data` is one of these. */
export type Pixels = { data: Uint8ClampedArray<ArrayBuffer>; w: number; h: number };

/** The sizes a stored texture may have (the tiers draw it at 256, 512 or 1024). */
export const TEXTURE_SIZES = [256, 512, 1024] as const;

const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);
const smoothstep = (t: number) => {
  const c = clamp(t, 0, 1);
  return c * c * (3 - 2 * c);
};

/** The biggest stored size not above `side` (a small crop is not pretended to hold more detail), never below 256. */
export const textureSizeFor = (side: number): number => [...TEXTURE_SIZES].reverse().find((s) => s <= side) ?? TEXTURE_SIZES[0];

// ---- crop and resize --------------------------------------------------------------------------------------------------------

/** The `side` x `side` square whose top-left corner is (`x`, `y`) (both pulled inside the picture), as new pixels. */
export function cropSquare(src: Pixels, x: number, y: number, side: number): Pixels {
  const s = clamp(Math.round(side), 1, Math.min(src.w, src.h));
  const x0 = clamp(Math.round(x), 0, src.w - s);
  const y0 = clamp(Math.round(y), 0, src.h - s);
  const data = new Uint8ClampedArray(s * s * 4);
  for (let r = 0; r < s; r++) data.set(src.data.subarray(((y0 + r) * src.w + x0) * 4, ((y0 + r) * src.w + x0 + s) * 4), r * s * 4);
  return { data, w: s, h: s };
}

type Taps = { from: number[]; weights: number[][] };

/** For each of `dst` output positions along one axis, the first source index and the weights of the source pixels it blends: a box average when shrinking, bilinear when growing. */
function taps(src: number, dst: number): Taps {
  const from: number[] = [];
  const weights: number[][] = [];
  const step = src / dst;
  for (let i = 0; i < dst; i++) {
    if (step <= 1) {
      const p = clamp((i + 0.5) * step - 0.5, 0, src - 1);
      const a = Math.floor(p);
      const t = p - a;
      from.push(a);
      weights.push(a + 1 < src ? [1 - t, t] : [1]);
    } else {
      const lo = i * step;
      const hi = (i + 1) * step;
      const a = Math.floor(lo);
      const w: number[] = [];
      for (let k = a; k < Math.min(src, Math.ceil(hi)); k++) w.push((Math.min(hi, k + 1) - Math.max(lo, k)) / step);
      from.push(a);
      weights.push(w);
    }
  }
  return { from, weights };
}

/** The picture at `w` x `h` (opaque: the alpha channel is dropped). Shrinking averages every source pixel, so a big photo does not alias into a noisy texture. */
export function resize(src: Pixels, w: number, h: number): Pixels {
  if (src.w === w && src.h === h) return { data: Uint8ClampedArray.from(src.data), w, h };
  const tx = taps(src.w, w);
  const ty = taps(src.h, h);
  const mid = new Float32Array(w * src.h * 3);
  for (let y = 0; y < src.h; y++) {
    for (let x = 0; x < w; x++) {
      let r = 0, g = 0, b = 0;
      const ws = tx.weights[x];
      for (let k = 0; k < ws.length; k++) {
        const i = (y * src.w + tx.from[x] + k) * 4;
        r += src.data[i] * ws[k];
        g += src.data[i + 1] * ws[k];
        b += src.data[i + 2] * ws[k];
      }
      const o = (y * w + x) * 3;
      mid[o] = r; mid[o + 1] = g; mid[o + 2] = b;
    }
  }
  const out = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    const ws = ty.weights[y];
    for (let x = 0; x < w; x++) {
      let r = 0, g = 0, b = 0;
      for (let k = 0; k < ws.length; k++) {
        const o = ((ty.from[y] + k) * w + x) * 3;
        r += mid[o] * ws[k];
        g += mid[o + 1] * ws[k];
        b += mid[o + 2] * ws[k];
      }
      const i = (y * w + x) * 4;
      out[i] = r; out[i + 1] = g; out[i + 2] = b; out[i + 3] = 255;
    }
  }
  return { data: out, w, h };
}

// ---- lighting ---------------------------------------------------------------------------------------------------------------

const TERM_COUNT = 7;
/** The terms of the smooth light surface at x, y in -1..1 across the picture: a tilt, a bowl, and a flatter-then-steeper bowl (the shape of a lens vignette). */
function lightTerms(x: number, y: number, t: Float64Array): void {
  const r2 = x * x + y * y;
  t[0] = 1; t[1] = x; t[2] = y; t[3] = x * x; t[4] = x * y; t[5] = y * y; t[6] = r2 * r2;
}

/** Solves the square system `a` x = `b` in place (Gaussian elimination, partial pivoting); null when it has no single answer (a picture too small to fit). */
function solve(a: number[][], b: number[]): number[] | null {
  const n = b.length;
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(a[r][c]) > Math.abs(a[p][c])) p = r;
    if (Math.abs(a[p][c]) < 1e-12) return null;
    [a[c], a[p]] = [a[p], a[c]];
    [b[c], b[p]] = [b[p], b[c]];
    for (let r = c + 1; r < n; r++) {
      const f = a[r][c] / a[c][c];
      for (let k = c; k < n; k++) a[r][k] -= f * a[c][k];
      b[r] -= f * b[c];
    }
  }
  const x = new Array<number>(n).fill(0);
  for (let r = n - 1; r >= 0; r--) {
    let s = b[r];
    for (let k = r + 1; k < n; k++) s -= a[r][k] * x[k];
    x[r] = s / a[r][r];
  }
  return x;
}

/**
 * Takes the large, slow light changes out of a photo (the vignette of a phone lens, a window's gradient, a shadow across one side): a smooth surface (a tilt plus a
 * lens-shaped bowl, fitted to the picture by least squares) is subtracted from each colour channel, and its mean is put back so the average colour stays. A surface
 * this smooth cannot follow boards, tiles, grout or grain, so the floor's own pattern and its plank-to-plank tones are untouched (a blur wide enough to leave those
 * alone would also leave the vignette). `strength` 0 leaves the picture as it is, 1 flattens it fully.
 */
export function flattenLighting(src: Pixels, strength = 1): Pixels {
  const { w, h } = src;
  const out = new Uint8ClampedArray(src.data);
  const step = Math.max(1, Math.floor(Math.min(w, h) / 64)); // about 64 x 64 samples are plenty for seven numbers
  const ux = (x: number) => ((x + 0.5) / w) * 2 - 1;
  const uy = (y: number) => ((y + 0.5) / h) * 2 - 1;
  const t = new Float64Array(TERM_COUNT);
  for (let c = 0; c < 3; c++) {
    const ata = Array.from({ length: TERM_COUNT }, () => new Array<number>(TERM_COUNT).fill(0));
    const atb = new Array<number>(TERM_COUNT).fill(0);
    let mean = 0;
    let count = 0;
    for (let y = 0; y < h; y += step) {
      for (let x = 0; x < w; x += step) {
        lightTerms(ux(x), uy(y), t);
        const v = src.data[(y * w + x) * 4 + c];
        mean += v;
        count++;
        for (let i = 0; i < TERM_COUNT; i++) {
          atb[i] += t[i] * v;
          for (let j = 0; j < TERM_COUNT; j++) ata[i][j] += t[i] * t[j];
        }
      }
    }
    mean /= count; // a least-squares fit with a constant term has the data's mean as its own, so subtracting (fit - mean) keeps the channel's average
    const k = solve(ata, atb);
    if (!k) continue; // too small a picture for a surface: this channel is left as photographed
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        lightTerms(ux(x), uy(y), t);
        let fit = 0;
        for (let i = 0; i < TERM_COUNT; i++) fit += k[i] * t[i];
        const o = (y * w + x) * 4 + c;
        out[o] = src.data[o] - strength * (fit - mean);
      }
    }
  }
  return { data: out, w, h };
}

// ---- seamless edges ---------------------------------------------------------------------------------------------------------

/**
 * Makes a picture repeat without seams. It is cross-faded with a copy of itself shifted by half its size (wrapping round): near an edge the shifted copy takes over
 * completely, and the shifted copy's own seam runs through the middle, where the original is untouched. So pixel 0 and pixel w-1 come from neighbours in the original
 * and meet smoothly. `margin` (a fraction of the size, 0.05..0.5) is how wide the cross-fade zone is: wider hides more, but shows more of a ghost where two parts of
 * the floor are mixed. The middle (1 - 2 x margin) of each side stays exactly as photographed.
 */
export function makeTileable(src: Pixels, margin = 0.2): Pixels {
  const { w, h } = src;
  const m = clamp(margin, 0.05, 0.5);
  const wx = Float32Array.from({ length: w }, (_, x) => smoothstep(Math.min(x + 0.5, w - x - 0.5) / (m * w)));
  const wy = Float32Array.from({ length: h }, (_, y) => smoothstep(Math.min(y + 0.5, h - y - 0.5) / (m * h)));
  const [sx, sy] = [Math.floor(w / 2), Math.floor(h / 2)];
  const out = new Uint8ClampedArray(src.data.length);
  for (let y = 0; y < h; y++) {
    const y2 = (y + sy) % h;
    for (let x = 0; x < w; x++) {
      const k = wx[x] * wy[y];
      const a = (y * w + x) * 4;
      const b = (y2 * w + ((x + sx) % w)) * 4;
      for (let c = 0; c < 3; c++) out[a + c] = src.data[a + c] * k + src.data[b + c] * (1 - k);
      out[a + 3] = 255;
    }
  }
  return { data: out, w, h };
}

/**
 * How visible the seam of a repeat would be: the mean absolute difference (0..255) between the pixels on opposite edges that touch when the picture repeats (left
 * column against right, top row against bottom), over the three colour channels. Near the difference between ordinary neighbouring pixels once `makeTileable` has run.
 */
export function seamMismatch(p: Pixels): number {
  let total = 0;
  for (let y = 0; y < p.h; y++) for (let c = 0; c < 3; c++) total += Math.abs(p.data[(y * p.w + p.w - 1) * 4 + c] - p.data[y * p.w * 4 + c]);
  for (let x = 0; x < p.w; x++) for (let c = 0; c < 3; c++) total += Math.abs(p.data[((p.h - 1) * p.w + x) * 4 + c] - p.data[x * 4 + c]);
  return total / ((p.h + p.w) * 3);
}

// ---- colour and surface -----------------------------------------------------------------------------------------------------

const TO_LINEAR = Float32Array.from({ length: 256 }, (_, i) => {
  const c = i / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
});
const toSrgb = (l: number) => clamp(Math.round((l <= 0.0031308 ? l * 12.92 : 1.055 * l ** (1 / 2.4) - 0.055) * 255), 0, 255);

/** The average colour as "#rrggbb". Averaged in linear light, like the eye (and the screen) mixes it: half black and half white pixels give mid grey, not dark grey. */
export function averageColour(p: Pixels): string {
  const sum = [0, 0, 0];
  const n = p.w * p.h;
  for (let i = 0; i < n; i++) for (let c = 0; c < 3; c++) sum[c] += TO_LINEAR[p.data[i * 4 + c]];
  return `#${sum.map((s) => toSrgb(s / n).toString(16).padStart(2, "0")).join("")}`;
}

/** Brightness 0..1 of every pixel (Rec. 709 weights on the stored values: a height map, not a measurement of light). */
export function lumaPlane(p: Pixels): Float32Array {
  const out = new Float32Array(p.w * p.h);
  for (let i = 0; i < out.length; i++) out[i] = (0.2126 * p.data[i * 4] + 0.7152 * p.data[i * 4 + 1] + 0.0722 * p.data[i * 4 + 2]) / 255;
  return out;
}

export const ROUGHNESS_RANGE = { min: 0.45, max: 0.9 } as const;
const BUSY = 25; // mean brightness step (0..255) between neighbours past which a surface counts as fully rough

/**
 * A rough guess at how matt the floor is, from how busy its fine detail is: smooth glazed tile or varnished boards change little from pixel to pixel (shiny), carpet,
 * stone and worn wood change a lot (matt). 0.45 .. 0.9, in the range the app's own floors use. It cannot see a reflection, so it is only a starting guess.
 * Looks at every second pixel.
 */
export function estimateRoughness(p: Pixels): number {
  const l = lumaPlane(p);
  let sum = 0;
  let n = 0;
  for (let y = 0; y + 2 < p.h; y += 2) {
    for (let x = 0; x + 2 < p.w; x += 2) {
      const i = y * p.w + x;
      sum += Math.abs(l[i + 1] - l[i]) + Math.abs(l[i + p.w] - l[i]);
      n += 2;
    }
  }
  const step = n ? (sum / n) * 255 : 0;
  return ROUGHNESS_RANGE.min + (ROUGHNESS_RANGE.max - ROUGHNESS_RANGE.min) * clamp(step / BUSY, 0, 1);
}

export type NormalJob = {
  /** RGBA bytes of a tangent-space normal map (rows from the bottom up when the input was), filled as `run` goes. */
  readonly data: Uint8Array;
  readonly done: boolean;
  /** Works for at most `budgetMs` (checked every few rows); true while there is more to do. */
  run(budgetMs: number, now: () => number): boolean;
};

const ROWS_PER_CHECK = 8;

/**
 * A normal map made from the picture's brightness (brighter = higher): Sobel slopes, the picture wrapping round so the map repeats like the colour does. `strength`
 * is how steep the relief is (1 = soft, 3 = deep). Rows are in the order of the input; a texture's rows run from v = 0 up, which is the order of an image's rows too.
 */
export function createNormalJob(p: Pixels, strength = 2): NormalJob {
  const { w, h } = p;
  const l = lumaPlane(p);
  const data = new Uint8Array(w * h * 4);
  const k = strength * 2; // luma spans 0..1 and a Sobel sum spans about 8: this keeps `strength` 1 gentle
  let row = 0;
  const at = (x: number, y: number) => l[((y + h) % h) * w + ((x + w) % w)];
  const doRow = (y: number) => {
    for (let x = 0; x < w; x++) {
      const dx = at(x + 1, y - 1) + 2 * at(x + 1, y) + at(x + 1, y + 1) - at(x - 1, y - 1) - 2 * at(x - 1, y) - at(x - 1, y + 1);
      const dy = at(x - 1, y + 1) + 2 * at(x, y + 1) + at(x + 1, y + 1) - at(x - 1, y - 1) - 2 * at(x, y - 1) - at(x + 1, y - 1);
      const nx = -dx * k;
      const ny = -dy * k;
      const inv = 1 / Math.hypot(nx, ny, 1);
      const o = (y * w + x) * 4;
      data[o] = (nx * inv * 0.5 + 0.5) * 255 + 0.5; // + 0.5: a typed array truncates, and a flat surface must come out as exactly (128, 128, 255)
      data[o + 1] = (ny * inv * 0.5 + 0.5) * 255 + 0.5;
      data[o + 2] = (inv * 0.5 + 0.5) * 255 + 0.5;
      data[o + 3] = 255;
    }
  };
  return {
    data,
    get done() {
      return row >= h;
    },
    run(budgetMs, now) {
      const start = now();
      while (row < h) {
        for (let i = 0; i < ROWS_PER_CHECK && row < h; i++) doRow(row++);
        if (now() - start >= budgetMs) break;
      }
      return row < h;
    },
  };
}

/** The whole normal map at once (tests, and small textures). */
export function normalMap(p: Pixels, strength = 2): Uint8Array {
  const job = createNormalJob(p, strength);
  job.run(Infinity, () => 0);
  return job.data;
}

// ---- the whole recipe -------------------------------------------------------------------------------------------------------

export type BuildOptions = { flatten: boolean; seamless: boolean };
export type Built = { pixels: Pixels; avg: string };

/**
 * A cropped patch as the stored texture: resized to a stored size, its lighting evened out and its edges blended, plus its average colour. `pause` is awaited between
 * the stages, so the browser can draw (a progress message) and answer touches while a big photo is processed.
 */
export async function buildFloorTexture(crop: Pixels, opts: BuildOptions, pause: () => Promise<void> = () => Promise.resolve()): Promise<Built> {
  const size = textureSizeFor(Math.min(crop.w, crop.h));
  let p = resize(crop, size, size);
  await pause();
  if (opts.flatten) p = flattenLighting(p);
  await pause();
  if (opts.seamless) p = makeTileable(p);
  return { pixels: p, avg: averageColour(p) };
}
