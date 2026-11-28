// "Look for walls" in a picture of a floor plan. Modest and predictable on purpose, not a CAD import: dark strokes on a light page, straight
// horizontal and vertical lines only (no diagonal or curved walls), found by scanning rows and columns for long dark runs. Pure: pixels in
// (RGBA, as canvas getImageData gives them), segments out in image pixels. The work comes in small `step()`s so the browser can keep drawing.
// The node test runner loads this file directly: .ts import extensions.

/** A straight stroke in image pixels (x right, y down): horizontal (y1 = y2) or vertical (x1 = x2), `t` pixels thick. */
export type Seg = { x1: number; y1: number; x2: number; y2: number; t: number };
export type Sensitivity = "few" | "normal" | "many";

export const MAX_SUGGESTIONS = 120;
/** What each choice means: the shortest line (as a share of the longest image side), the thinnest stroke, and how far the dark/light threshold is moved towards light. */
const LEVELS: Record<Sensitivity, { minLen: number; minThick: number; bias: number }> = {
  few: { minLen: 0.1, minThick: 3, bias: 0 },
  normal: { minLen: 0.06, minThick: 2, bias: 0 },
  many: { minLen: 0.035, minThick: 1, bias: 12 },
};
const MAX_THICK = 12; // a wall stroke is 2..12 px; anything fatter is a filled shape or text block
const MAX_GAP = 2; // light pixels tolerated inside one dark run (JPEG noise, a speck of paper)
const END_TOL = 3; // two neighbouring rows are the same stroke when their run ends differ by no more than this
const LINE_TOL = 3; // two strokes on the same line when their centres differ by no more than this ...
const JOIN_GAP = 4; // ... and the space between them is no more than this (a door gap is far wider)
const DOUBLE_TOL = 14; // two parallel strokes this close and mostly overlapping are the two lines of one drawn wall
const MIN_SPREAD = 50; // a page whose darkest and lightest pixels are closer than this has no drawing on it
const MIN_CONTRAST = 60; // and the dark class must be this much darker than the light one
const MAX_DARK_SHARE = 0.5; // more than half dark is a dark page (or a photo), not ink on paper
const STEP_PIXELS = 1 << 18; // work per `step()`: about a quarter of a million pixels
const MAX_LINES = 400; // merging is quadratic: only the longest strokes are considered

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** Lightness 0..255 of pixel `i` (index into the RGBA bytes); a see-through pixel counts as white paper. */
function grayAt(d: Uint8ClampedArray, i: number): number {
  const g = (d[i] * 77 + d[i + 1] * 150 + d[i + 2] * 29) >> 8;
  const a = d[i + 3];
  return a === 255 ? g : 255 - (((255 - g) * a) / 255) | 0;
}

/** Otsu's threshold between ink and paper (pixels at or below it are dark), or -1 when there is no ink to find. */
function pickThreshold(hist: Uint32Array, n: number, bias: number): number {
  let lo = 0;
  let hi = 255;
  while (lo < 255 && hist[lo] === 0) lo++;
  while (hi > 0 && hist[hi] === 0) hi--;
  if (hi - lo < MIN_SPREAD) return -1;
  let sumAll = 0;
  for (let i = lo; i <= hi; i++) sumAll += i * hist[i];
  let [wB, sumB, best, first, last] = [0, 0, -1, lo, lo];
  for (let t = lo; t < hi; t++) {
    wB += hist[t];
    sumB += t * hist[t];
    const wF = n - wB;
    if (wB === 0 || wF === 0) continue;
    const v = wB * wF * (sumB / wB - (sumAll - sumB) / wF) ** 2;
    if (v > best) [best, first, last] = [v, t, t];
    else if (v === best) last = t; // a flat top (pure black on pure white): the middle of it survives noise best
  }
  const t = Math.round((first + last) / 2);
  let [dark, darkSum] = [0, 0];
  for (let i = lo; i <= t; i++) [dark, darkSum] = [dark + hist[i], darkSum + i * hist[i]];
  if (dark === 0 || dark === n || dark / n > MAX_DARK_SHARE) return -1;
  if ((sumAll - darkSum) / (n - dark) - darkSum / dark < MIN_CONTRAST) return -1;
  return clamp(t + bias, 0, 254);
}

type Band = { c0: number; c1: number; a0: number; a1: number }; // lines c0..c1 (across) share a dark run a0..a1 (along, inclusive)

/** Feeds lines (rows or columns) of the dark mask in order and joins the runs of neighbouring lines that line up into bands: a band's height is the stroke's thickness. */
type Scanner = { feed: (c: number) => void; finish: () => Band[] };

function scanner(mask: Uint8Array, alongLen: number, strideAlong: number, strideAcross: number, minRun: number): Scanner {
  let active: Band[] = [];
  const closed: Band[] = [];
  return {
    feed(c: number) {
      const next: Band[] = [];
      const used = new Set<Band>();
      const take = (a0: number, a1: number) => {
        const b = active.find((x) => !used.has(x) && Math.abs(x.a0 - a0) <= END_TOL && Math.abs(x.a1 - a1) <= END_TOL);
        if (!b) {
          next.push({ c0: c, c1: c, a0, a1 });
          return;
        }
        used.add(b);
        [b.c1, b.a0, b.a1] = [c, Math.min(b.a0, a0), Math.max(b.a1, a1)];
        next.push(b);
      };
      let [start, last] = [-1, -1];
      for (let a = 0, i = c * strideAcross; a < alongLen; a++, i += strideAlong) {
        if (mask[i]) {
          if (start < 0) start = a;
          last = a;
        } else if (start >= 0 && a - last > MAX_GAP) {
          if (last - start + 1 >= minRun) take(start, last);
          start = -1;
        }
      }
      if (start >= 0 && last - start + 1 >= minRun) take(start, last);
      for (const b of active) if (!used.has(b)) closed.push(b);
      active = next;
    },
    finish(): Band[] {
      closed.push(...active);
      active = [];
      return closed;
    },
  };
}

/** A stroke on one axis: its centre `pos` across, running `a0`..`a1` along (a1 exclusive), `t` thick. */
type Line = { pos: number; a0: number; a1: number; t: number };
const len = (l: Line) => l.a1 - l.a0;

const linesOf = (bands: Band[], minThick: number, minRun: number): Line[] =>
  bands.flatMap((b) => {
    const t = b.c1 - b.c0 + 1;
    const a1 = b.a1 + 1;
    return t >= minThick && t <= MAX_THICK && a1 - b.a0 >= minRun ? [{ pos: (b.c0 + b.c1 + 1) / 2, a0: b.a0, a1, t }] : [];
  });

/** The one stroke that two make, or null when they are not the same wall. `double`: the two lines of a hollow wall, not two pieces of one line. */
function joined(p: Line, q: Line, double: boolean): Line | null {
  const overlap = Math.min(p.a1, q.a1) - Math.max(p.a0, q.a0); // negative: a gap
  const apart = Math.abs(p.pos - q.pos);
  const same = double ? apart <= DOUBLE_TOL && overlap >= 0.8 * Math.min(len(p), len(q)) : apart <= LINE_TOL && overlap >= -JOIN_GAP;
  if (!same) return null;
  return {
    pos: double ? (p.pos + q.pos) / 2 : (p.pos * len(p) + q.pos * len(q)) / (len(p) + len(q)),
    a0: Math.min(p.a0, q.a0),
    a1: Math.max(p.a1, q.a1),
    t: double ? Math.max(p.t, q.t, apart + Math.min(p.t, q.t)) : Math.max(p.t, q.t),
  };
}

/** Pieces of one line become one stroke, then the two lines of a hollow wall become one. The longest strokes are looked at first. */
function mergeLines(lines: Line[], minLen: number): Line[] {
  const list = [...lines].sort((p, q) => len(q) - len(p)).slice(0, MAX_LINES);
  for (const double of [false, true]) {
    for (let changed = true; changed; ) {
      changed = false;
      for (let i = 0; i < list.length; i++) {
        for (let j = i + 1; j < list.length; ) {
          const m = joined(list[i], list[j], double);
          if (!m) {
            j++;
            continue;
          }
          list[i] = m;
          list.splice(j, 1);
          changed = true;
          j = i + 1; // the grown stroke may now meet one it passed before
        }
      }
    }
  }
  return list.filter((l) => len(l) >= minLen);
}

/** Corners join: a stroke end that stops within a stroke width of a crossing stroke is moved onto that stroke's line, so walls meet in one point. */
function joinCorners(own: Line[], other: Line[]): Line[] {
  return own.map((l) => {
    const end = (at: number) => {
      let [best, bd] = [at, Infinity];
      for (const o of other) {
        const reach = Math.max(l.t, o.t) + 2;
        const d = Math.abs(at - o.pos);
        if (d <= reach && d < bd && l.pos >= o.a0 - reach && l.pos <= o.a1 + reach) [best, bd] = [o.pos, d];
      }
      return best;
    };
    return { ...l, a0: end(l.a0), a1: end(l.a1) };
  });
}

export type DetectJob = {
  readonly done: boolean;
  /** 0..1, roughly. */
  readonly progress: number;
  /** Do a small piece of the work. */
  step: () => void;
  /** The walls found, strongest (longest) first; only once `done`. */
  result: () => Seg[];
};

/** Starts looking for walls in `rgba` (w x h pixels). Call `step()` until `done`, then take `result()`. */
export function detectJob(rgba: Uint8ClampedArray, w: number, h: number, sensitivity: Sensitivity = "normal"): DetectJob {
  const cfg = LEVELS[sensitivity];
  const minRun = Math.max(8, Math.round(Math.max(w, h) * cfg.minLen));
  const hist = new Uint32Array(256);
  const rows = Math.max(1, Math.floor(STEP_PIXELS / w));
  const cols = Math.max(1, Math.floor(STEP_PIXELS / h));
  let mask: Uint8Array = new Uint8Array(0);
  let threshold = -1;
  let stage = 0; // 0 lightness histogram, 1 dark mask, 2 rows, 3 columns, 4 merge, 5 finished
  let pos = 0;
  let rowScan: Scanner | null = null;
  let colScan: Scanner | null = null;
  let found: Seg[] = [];
  let horizontal: Line[] = [];

  const advance = (size: number, count: number, to: number) => {
    pos += count;
    if (pos >= size) [stage, pos] = [to, 0];
  };
  const stepHistogram = () => {
    for (let y = pos; y < Math.min(h, pos + rows); y++) for (let x = 0, i = y * w * 4; x < w; x++, i += 4) hist[grayAt(rgba, i)]++;
    pos += rows;
    if (pos < h) return;
    threshold = pickThreshold(hist, w * h, cfg.bias);
    [stage, pos] = [threshold < 0 ? 5 : 1, 0];
    if (threshold >= 0) mask = new Uint8Array(w * h);
  };
  const stepMask = () => {
    for (let y = pos; y < Math.min(h, pos + rows); y++) for (let x = 0, i = y * w * 4, m = y * w; x < w; x++, i += 4, m++) mask[m] = grayAt(rgba, i) <= threshold ? 1 : 0;
    advance(h, rows, 2);
    if (stage === 2) rowScan = scanner(mask, w, 1, w, minRun);
  };
  const stepRows = () => {
    for (let y = pos; y < Math.min(h, pos + rows); y++) rowScan?.feed(y);
    advance(h, rows, 3);
    if (stage === 3) {
      horizontal = linesOf(rowScan?.finish() ?? [], cfg.minThick, minRun);
      colScan = scanner(mask, h, w, 1, minRun);
    }
  };
  const stepColumns = () => {
    for (let x = pos; x < Math.min(w, pos + cols); x++) colScan?.feed(x);
    advance(w, cols, 4);
  };
  const stepMerge = () => {
    const horiz = mergeLines(horizontal, minRun);
    const vert = mergeLines(linesOf(colScan?.finish() ?? [], cfg.minThick, minRun), minRun);
    const all = [...horiz.map((l) => ({ l, h: true })), ...vert.map((l) => ({ l, h: false }))].sort((p, q) => len(q.l) - len(p.l)).slice(0, MAX_SUGGESTIONS);
    const hs = joinCorners(all.filter((e) => e.h).map((e) => e.l), all.filter((e) => !e.h).map((e) => e.l));
    const vs = joinCorners(all.filter((e) => !e.h).map((e) => e.l), all.filter((e) => e.h).map((e) => e.l));
    found = [
      ...hs.map((l) => ({ x1: l.a0, y1: l.pos, x2: l.a1, y2: l.pos, t: l.t })),
      ...vs.map((l) => ({ x1: l.pos, y1: l.a0, x2: l.pos, y2: l.a1, t: l.t })),
    ];
    found.sort((p, q) => Math.hypot(q.x2 - q.x1, q.y2 - q.y1) - Math.hypot(p.x2 - p.x1, p.y2 - p.y1));
    [stage, mask, horizontal] = [5, new Uint8Array(0), []]; // the mask is megabytes: let it go
  };

  const stages = [stepHistogram, stepMask, stepRows, stepColumns, stepMerge];
  return {
    get done() {
      return stage >= 5;
    },
    get progress() {
      const size = stage === 3 ? w : h;
      return stage >= 5 ? 1 : Math.min(0.99, (stage + pos / size) / 5);
    },
    step: () => stages[stage]?.(),
    result: () => found,
  };
}

/** All of `detectJob` at once, for tests and small pictures. */
export function detectWalls(rgba: Uint8ClampedArray, w: number, h: number, sensitivity: Sensitivity = "normal"): Seg[] {
  const job = detectJob(rgba, w, h, sensitivity);
  while (!job.done) job.step();
  return job.result();
}
