import { grassClump } from "./vegGrass.ts";
import { KIND, LEVEL_MULT, TILE, add, blob, card, clamp, cross, leafCard, len, lin, mix3, mul, noise3, norm, ribbon, smooth, sphereDirs, sub, tube, type Level, type Mesh } from "./vegBuilder.ts";
import { rngOf, type Rng, type V3 } from "./mathUtil.ts";

/** Builders of one species each. They draw into `m` at natural size (metres, y up, base at y = 0); `q` is the detail factor (1 near, 0.5 far). */
export type Build = (m: Mesh, rng: Rng, q: number, level: Level) => void;

/** Leaf-card size at each foliage level relative to the original: finer leaves as the count grows (coverage still rises, see LEVEL_MULT). */
const CARD_SCALE: Record<Level, number> = { 0: 1, 1: 0.9, 2: 0.74, 3: 0.62 };
/** Conifer spray density and width per level: more, narrower branch sprays. */
const SPRAY_MULT: Record<Level, number> = { 0: 1, 1: 1.7, 2: 2.5, 3: 3.4 };
const SPRAY_W: Record<Level, number> = { 0: 1, 1: 0.8, 2: 0.66, 3: 0.56 };
/** The sprig tile of the denser levels where the species has one, else the original cluster tile. */
const tileAt = (lv: Level, base: number, sprig?: number) => (lv && sprig !== undefined ? sprig : base);
/** A tone scaled by k (k = 1 returns the same values). */
const dim = (t: V3, k: number): V3 => [t[0] * k, t[1] * k, t[2] * k];

const UP: V3 = [0, 1, 0];
const GOLDEN = 2.399963;
const pick = (w: number[], x: number) => {
  let t = x * w.reduce((a, b) => a + b, 0);
  for (let i = 0; i < w.length; i++) if ((t -= w[i]) < 0) return i;
  return w.length - 1;
};
const perp = (d: V3, rng: Rng): V3 => norm(cross(d, [rng() - 0.5, rng() - 0.5, rng() - 0.5]));

// ---------------------------------------------------------------- broadleaf and pad-crowned trees

type Broad = {
  size: V3;
  trunkH: number;
  trunkR: number;
  /** share of the space above the clear trunk that the leader climbs */
  leader: number;
  limbs: number;
  /** radians from vertical of the lowest limb (upper ones are steeper) */
  limbAng: number;
  limbLen: number;
  /** how much shorter the top limbs are than the bottom ones */
  taper: number;
  kids: number;
  droop: number;
  up: number;
  lean: number;
  blobR: number;
  /** blob height / width */
  flat: number;
  spacing: number;
  cards: number;
  card: number;
  tile: number;
  kind: number;
  lt: V3;
  bark: string;
  barkStyle: number;
  slots: number[];
  twist?: number;
  roots?: number;
  /** atlas tile with this species' own leaves, used from foliage level 1 on instead of `tile` */
  sprig?: number;
  blossom?: { n: number; tone: string; size: number };
  fruit?: { n: number; dia: number; tones: string[] };
  strands?: { n: number; len: number; w: number };
};

type Tip = { p: V3; d: V3 };

type Blob = { c: V3; r: V3; fill?: true };
/** What every phase of a broadleaf tree shares: the mesh, both random streams, the detail factor, the species and the bark colour. */
type BroadCtx = { m: Mesh; rng: Rng; drng: Rng; q: number; o: Broad; bark: V3 };
/** The crown's shading and its atlas-slot choice, both drawing from the main stream. */
type CrownLook = { tone: (p: V3) => V3; slotAt: (p: V3) => number };

function broadleaf(m: Mesh, rng: Rng, q: number, o: Broad) {
  const lv = m.level;
  // fine decoration (bark roughness, twigs) draws from its own stream so the branching and the crown's silhouette stay the same at every foliage level
  const drng: Rng = lv ? rngOf(Math.round(o.size[0] * 1013 + o.size[1] * 77 + o.trunkR * 9001)) : rng;
  const [W, H] = o.size;
  m.H = H;
  m.R = W / 2;
  m.flex = 1.1;
  const c: BroadCtx = { m, rng, drng, q, o, bark: lin(o.bark) };
  const { tpts, leaderH } = broadTrunk(c);
  const tips = broadLimbs(c, tpts, leaderH);
  const blobs = broadBlobs(c, tips);
  const cc = blobs.reduce<V3>((s, b) => add(s, mul(b.c, 1 / blobs.length)), [0, 0, 0]);
  const rc = blobs.reduce((s, b) => Math.max(s, len(sub(b.c, cc))), 0) + o.blobR;
  const look: CrownLook = {
    tone: (p) => {
      const d = len(sub(p, cc)) / rc;
      const k = (0.64 + 0.5 * smooth(0.2, 1, d)) * (0.86 + 0.3 * smooth(cc[1] - rc, cc[1] + rc, p[1])) * (0.93 + 0.14 * rng());
      return [o.lt[0] * k, o.lt[1] * k, o.lt[2] * k];
    },
    slotAt: (p) => pick(o.slots, clamp(noise3(p[0] * 0.9, p[1] * 0.9, p[2] * 0.9, 3) * 0.7 + rng() * 0.3)),
  };
  for (const b of blobs) blobFoliage(c, b, look);
  if (o.strands) broadStrands(c, o.strands, tips, cc, look);
}

/** Trunk: slight S curve and lean, flared at the foot, plus the root flares. Returns the trunk's centre line. */
function broadTrunk({ m, rng, drng, q, o, bark }: BroadCtx) {
  const lv = m.level;
  const [, H] = o.size;
  const leaderH = o.trunkH + (H - o.trunkH - o.blobR * o.flat) * o.leader;
  const leanA = rng() * Math.PI * 2;
  const leanV: V3 = [Math.cos(leanA) * o.lean, 0, Math.sin(leanA) * o.lean];
  const ys = [-0.05, 0.1, 0.3, 0.55, 0.8, 1].map((t, i) => (i === 0 ? -0.05 : i === 1 ? 0.18 : t * leaderH));
  const tpts: V3[] = ys.map((y) => {
    const t = clamp(y / leaderH);
    const sx = Math.sin(t * 5 + leanA) * 0.05 * (o.twist ?? 1);
    return [leanV[0] * t * t + sx, y, leanV[2] * t * t + Math.cos(t * 4 + leanA) * 0.04 * (o.twist ?? 1)];
  });
  const trad = ys.map((y, i) => (i === 0 ? o.trunkR * 1.55 : i === 1 ? o.trunkR * 1.12 : o.trunkR * (1 - 0.68 * clamp(y / leaderH)) ));
  const sides = q < 1 ? 5 : lv >= 2 ? 11 : lv ? 9 : 7;
  tube(m, tpts, trad, sides, bark, o.barkStyle, { rng: drng, vScale: 1 / (o.trunkR * 5 + 0.3), rough: lv ? 0.2 : 0.14, sub: lv ? 3 : 1 });
  for (let i = 0; i < (o.roots ?? 4); i++) {
    const a = (i / (o.roots ?? 4)) * Math.PI * 2 + rng();
    const out: V3 = [Math.cos(a), 0, Math.sin(a)];
    tube(m, [add(tpts[0], [0, 0.08, 0]), add(tpts[0], add(mul(out, o.trunkR * 2.2), [0, 0.0, 0])), add(tpts[0], add(mul(out, o.trunkR * 4), [0, -0.05, 0]))], [o.trunkR * 0.7, o.trunkR * 0.42, o.trunkR * 0.2], 4, bark, o.barkStyle, { rng });
  }
  return { tpts, leaderH };
}

/** The point on the trunk's centre line at height y. */
function trunkAt(tpts: V3[], y: number): V3 {
  for (let i = 0; i < tpts.length - 1; i++) if (y <= tpts[i + 1][1]) return mix3(tpts[i], tpts[i + 1], clamp((y - tpts[i][1]) / (tpts[i + 1][1] - tpts[i][1])));
  return tpts[tpts.length - 1];
}

/** One branch of 2-3 bent segments; depth 1 limbs sprout `kids` twigs. Records the end of every branch in `tips`. */
function growBranch(c: BroadCtx, tips: Tip[], p0: V3, d0: V3, length: number, rad: number, depth: number) {
  const { m, rng, drng, q, o, bark } = c;
  const lv = m.level;
  const segs = depth === 1 ? 3 : 2;
  const pts: V3[] = [p0], radii = [rad];
  let p = p0, d = d0;
  for (let s = 1; s <= segs; s++) {
    d = norm(add(d, [(rng() - 0.5) * 0.5, o.up * 0.2 - o.droop * 0.35 * (s / segs) + (rng() - 0.5) * 0.2, (rng() - 0.5) * 0.5]));
    p = add(p, mul(d, length / segs));
    pts.push(p);
    radii.push(rad * (1 - 0.65 * (s / segs)));
  }
  tube(m, pts, radii, depth === 1 ? (q < 1 ? 3 : lv ? 7 : 5) : lv && q >= 1 ? 4 : 3, bark, o.barkStyle, { rng: drng, vScale: 1 / (rad * 5 + 0.2), rough: 0.12, sub: lv && depth === 1 ? 2 : 1 });
  tips.push({ p, d });
  if (depth >= 2) return;
  for (let k = 0; k < o.kids; k++) {
    const t = 0.4 + 0.5 * rng();
    const i = Math.min(segs - 1, Math.floor(t * segs)), f = t * segs - i;
    const start = mix3(pts[i], pts[i + 1], f);
    const ang = 0.55 + 0.5 * rng();
    const nd = norm(add(mul(d, Math.cos(ang)), mul(perp(d, rng), Math.sin(ang))));
    growBranch(c, tips, start, nd, length * (0.5 + 0.22 * rng()), radii[i] * 0.62, depth + 1);
  }
}

/** Limbs spiral up the trunk (golden angle), steeper and shorter towards the top. Returns every branch end plus the leader's top. */
function broadLimbs(c: BroadCtx, tpts: V3[], leaderH: number): Tip[] {
  const { rng, o } = c;
  const tips: Tip[] = [];
  const top = tpts[tpts.length - 1];
  const y0 = o.trunkH * 0.9, y1 = leaderH * 0.92;
  for (let k = 0; k < o.limbs; k++) {
    const f = (k + 0.5) / o.limbs;
    const y = y0 + (y1 - y0) * f;
    const a = k * GOLDEN + rng() * 0.4;
    const ang = o.limbAng * (1 - 0.45 * f) * (0.85 + 0.3 * rng());
    const d: V3 = [Math.sin(ang) * Math.cos(a), Math.cos(ang), Math.sin(ang) * Math.sin(a)];
    growBranch(c, tips, trunkAt(tpts, y), d, o.limbLen * (1 - o.taper * f) * (0.85 + 0.3 * rng()), o.trunkR * (0.62 - 0.25 * f), 1);
  }
  tips.push({ p: top, d: UP });
  return tips;
}

/** Clumps of foliage at the branch ends, then fillers in the gaps between neighbours so the crown reads as one soft mass. */
function broadBlobs({ rng, o }: BroadCtx, tips: Tip[]): Blob[] {
  const blobs: Blob[] = [];
  const j = () => 0.88 + 0.28 * rng();
  const radii = (k = 1): V3 => [o.blobR * k * j(), o.blobR * k * o.flat * j(), o.blobR * k * j()];
  for (const t of [...tips].sort((a, b) => b.p[1] - a.p[1])) {
    const c = add(t.p, mul(t.d, o.blobR * 0.3));
    if (c[1] < o.trunkH * 0.85 || blobs.some((b) => len(sub(b.c, c)) < o.spacing)) continue;
    blobs.push({ c, r: radii() });
  }
  const tipBlobs = blobs.length;
  for (let k = 0; k < tipBlobs; k += 2) {
    const a = blobs[k], b = blobs[(k * 5 + 1 + Math.floor(rng() * 3)) % tipBlobs];
    if (a === b || len(sub(a.c, b.c)) > o.blobR * 3.2) continue;
    blobs.push({ c: add(mix3(a.c, b.c, 0.5), [(rng() - 0.5) * 0.2, 0.05, (rng() - 0.5) * 0.2]), r: radii(0.9), fill: true });
  }
  return blobs;
}

/** Everything that sits in one clump: dark core, leaf cards, then the optional blossom, fruit and (denser levels) fine twigs. */
function blobFoliage(c: BroadCtx, b: Blob, look: CrownLook) {
  const { m, o } = c;
  blobCore(c, b, look);
  blobCards(c, b, look);
  if (o.blossom) blobBlossom(c, b, o.blossom);
  if (o.fruit && !b.fill) blobFruit(c, b, o.fruit);
  if (m.level) blobTwigs(c, b);
}

function blobCore({ m, o }: BroadCtx, b: Blob, { tone, slotAt }: CrownLook) {
  const core = m.level ? 0.4 : 0.55; // the dark mass inside a clump; with the denser levels the leaves hide it, so it can be smaller
  blob(m, b.c, [b.r[0] * core, b.r[1] * core, b.r[2] * core], { detail: 0, bump: 0.18, tone: [o.lt[0] * 0.34, o.lt[1] * 0.34, o.lt[2] * 0.34], kind: o.kind, r: 0.15, slot: slotAt(b.c), seed: 5 }, (p) => {
    const t = tone(p);
    return [t[0] * 0.45, t[1] * 0.45, t[2] * 0.45];
  });
}

function blobCards({ m, rng, q, o }: BroadCtx, b: Blob, { tone, slotAt }: CrownLook) {
  const lv = m.level;
  const cardTile = tileAt(lv, o.tile, o.sprig ?? m.sprig);
  const cs = o.card * CARD_SCALE[lv];
  const n = Math.round(o.cards * q * (b.fill ? 0.6 : 1) * LEVEL_MULT[lv]);
  sphereDirs(n, rng).forEach((d, ci) => {
    if (d[1] < -0.55 && rng() < 0.55) return;
    const inner = !lv && ci % 3 === 2; // a third of the cards sit deeper so the clump has layers
    const j = lv ? 0.55 + 0.65 * Math.pow(rng(), 0.8) : inner ? 0.72 + 0.2 * rng() : 1.0 + 0.2 * rng(); // denser levels fill the clump's volume, not just its skin
    const p: V3 = [b.c[0] + d[0] * b.r[0] * j, b.c[1] + d[1] * b.r[1] * j, b.c[2] + d[2] * b.r[2] * j];
    const nrm = lv ? norm(add(mix3(d, UP, 0.28), [(rng() - 0.5) * 0.8, (rng() - 0.5) * 0.8, (rng() - 0.5) * 0.8])) : norm(mix3(d, UP, 0.28));
    const t = tone(p);
    const dk = lv ? 0.58 + 0.42 * smooth(0.5, 1.1, j) : inner ? 0.7 : 1; // inside the clump it is darker
    leafCard(m, p, nrm, cs * (0.75 + 0.5 * rng()), rng() * Math.PI * 2, { tile: cardTile, tone: [t[0] * dk, t[1] * dk, t[2] * dk], kind: o.kind, r: rng(), slot: slotAt(p) });
  });
}

function blobBlossom({ m, rng, q }: BroadCtx, b: Blob, blossom: NonNullable<Broad["blossom"]>) {
  const lv = m.level;
  const bt = lin(blossom.tone);
  sphereDirs(Math.round(blossom.n * q * (b.fill ? 0.5 : 1) * (lv ? LEVEL_MULT[lv] * 0.8 : 1)), rng).forEach((d) => {
    if (d[1] < -0.3) return;
    const p: V3 = [b.c[0] + d[0] * b.r[0] * 1.02, b.c[1] + d[1] * b.r[1] * 1.02, b.c[2] + d[2] * b.r[2] * 1.02];
    const k = 0.8 + 0.3 * rng();
    leafCard(m, p, norm(mix3(d, UP, 0.2)), blossom.size * (lv ? 0.75 : 1) * (0.8 + 0.4 * rng()), rng() * 6.3, { tile: TILE.blossom, tone: [bt[0] * k, bt[1] * k, bt[2] * k], kind: KIND.blossom, r: rng(), slot: 0, base: 0.1 });
  });
}

function blobFruit({ m, rng, q }: BroadCtx, b: Blob, fruit: NonNullable<Broad["fruit"]>) {
  sphereDirs(Math.round(fruit.n * q), rng).forEach((d) => {
    if (d[1] > 0.6) return;
    const p: V3 = [b.c[0] + d[0] * b.r[0] * 0.9, b.c[1] + d[1] * b.r[1] * 0.9, b.c[2] + d[2] * b.r[2] * 0.9];
    const ft = lin(fruit.tones[Math.floor(rng() * fruit.tones.length)]);
    blob(m, p, [fruit.dia / 2, fruit.dia / 2, fruit.dia / 2], { detail: 0, bump: 0.05, tone: ft, kind: KIND.fruit, r: rng(), slot: 0, seed: 2 });
  });
}

/** Fine twigs through the clump: they carry the leaves in summer and are all that is left of the crown in winter. */
function blobTwigs({ m, drng, q, o, bark }: BroadCtx, b: Blob) {
  const nT = Math.round((b.fill ? 1 : 2) * m.level * (q < 1 ? 0.5 : 1));
  for (let k = 0; k < nT; k++) {
    const d = norm([drng() - 0.5, 0.2 + 0.5 * drng(), drng() - 0.5]);
    const from = add(b.c, [(drng() - 0.5) * b.r[0] * 0.3, (drng() - 0.5) * b.r[1] * 0.2 - 0.06, (drng() - 0.5) * b.r[2] * 0.3]);
    const lenT = 0.45 + 0.45 * drng();
    const to = add(from, [d[0] * b.r[0] * lenT, d[1] * b.r[1] * lenT - 0.04, d[2] * b.r[2] * lenT]);
    const mid = add(mix3(from, to, 0.5), [(drng() - 0.5) * 0.08, 0.03, (drng() - 0.5) * 0.08]);
    tube(m, [from, mid, to], [0.017, 0.011, 0.004], 3, bark, o.barkStyle, { rng: drng, rough: 0.2, vScale: 4 });
    // two forks from the middle of the twig, each ending in its own fine tip
    for (let f = 0; f < 2; f++) {
      const side = norm([drng() - 0.5, 0.4 * drng(), drng() - 0.5]);
      const tip = add(mid, [side[0] * b.r[0] * 0.55 + (to[0] - mid[0]) * 0.5, side[1] * b.r[1] * 0.3 + (to[1] - mid[1]) * 0.5, side[2] * b.r[2] * 0.55 + (to[2] - mid[2]) * 0.5]);
      tube(m, [mid, mix3(mid, tip, 0.55), tip], [0.009, 0.006, 0.0025], 3, bark, o.barkStyle, { rng: drng, rough: 0.2, vScale: 4 });
    }
  }
}

/** Hanging strands (willow) from the upper branch ends. */
function broadStrands({ m, rng, q, o }: BroadCtx, strands: NonNullable<Broad["strands"]>, tips: Tip[], cc: V3, { slotAt }: CrownLook) {
  const lv = m.level;
  const mult = LEVEL_MULT[lv];
  const { n, len: L, w } = strands;
  for (const t of tips) {
    if (t.p[1] < o.trunkH || t.p[1] > o.size[1] * 0.92) continue;
    for (let s = 0; s < n * q * (lv ? Math.pow(mult, 0.7) : 1); s++) {
      const a = rng() * Math.PI * 2, r0 = o.blobR * (0.3 + 0.5 * rng());
      const p0: V3 = [t.p[0] + Math.cos(a) * r0, t.p[1] + 0.1 - rng() * 0.2, t.p[2] + Math.sin(a) * r0];
      const out = norm([p0[0] - cc[0], 0.001, p0[2] - cc[2]]);
      const l = Math.min(L * (0.6 + 0.5 * rng()), p0[1] - 0.2);
      const pts: V3[] = [0, 1, 2, 3].map((i) => add(p0, [out[0] * 0.18 * i * (i + 1) * 0.15, -(i / 3) * l, out[2] * 0.18 * i * (i + 1) * 0.15]));
      const k = 0.7 + 0.35 * rng();
      ribbon(m, pts, [w, w * 1.1, w, w * 0.5], norm(cross(UP, out)), norm(add(out, [0, 0.3, 0])), { tile: lv ? TILE.strand2 : TILE.strand, tone: [o.lt[0] * k, o.lt[1] * k, o.lt[2] * k], kind: o.kind, r: rng(), slot: slotAt(p0), base: 0.35, flip: true, swT: (t2) => 0.8 + 1.4 * t2 });
    }
  }
}

// ---------------------------------------------------------------- columns (poplar, cypress)

function column(m: Mesh, rng: Rng, q: number, size: V3, o: { blobs: number; card: number; cards: number; tile: number; kind: number; lt: V3; slots: number[]; bark: string; trunkH: number; bulge: number; sprig?: number }) {
  const lv = m.level;
  const [W, H] = size;
  m.H = H;
  m.R = W / 2;
  m.flex = 1.0;
  const bark = lin(o.bark);
  tube(m, [[0, -0.05, 0], [0.02, o.trunkH * 0.5, 0], [0, o.trunkH + 0.3, 0.02]], [0.09, 0.065, 0.045], lv ? 9 : 5, bark, 0, { rng, sub: lv ? 3 : 1 });
  for (let i = 0; i < o.blobs; i++) {
    const t = i / (o.blobs - 1);
    const ry = (H / o.blobs) * 0.95;
    const y = Math.max(o.trunkH * 0.7 + (H - o.trunkH * 0.7 - 0.3) * t, ry * 0.95);
    const prof = Math.sin(Math.PI * Math.min(1, 0.2 + 0.85 * t)) * (1 - o.bulge) + o.bulge * (1 - Math.abs(t - 0.4) * 1.1);
    const rr = (W / 2) * clamp(prof, 0.3, 1) * (0.95 + 0.1 * rng());
    const c: V3 = [(rng() - 0.5) * 0.12, y, (rng() - 0.5) * 0.12];
    const tone = (p: V3): V3 => {
      const k = (0.5 + 0.55 * smooth(0.1, 1, Math.hypot(p[0], p[2]) / (W / 2))) * (0.8 + 0.32 * (p[1] / H));
      return [o.lt[0] * k, o.lt[1] * k, o.lt[2] * k];
    };
    blob(m, c, [rr * 0.7, ry * 0.8, rr * 0.7], { detail: 0, bump: 0.08, tone: [0.2, 0.2, 0.2], kind: o.kind, r: 0.15, slot: 0, seed: 7 }, (p) => tone(p).map((v) => v * 0.55) as V3);
    sphereDirs(Math.round(o.cards * q * LEVEL_MULT[lv]), rng).forEach((d) => {
      const jr = lv ? 0.55 + 0.6 * Math.pow(rng(), 0.8) : 1; // denser levels fill the column's volume, not just its skin
      const p: V3 = [c[0] + d[0] * rr * jr, c[1] + d[1] * ry * jr, c[2] + d[2] * rr * jr];
      const dk = lv ? 0.6 + 0.4 * smooth(0.55, 1.1, jr) : 1;
      const t = tone(p);
      leafCard(m, p, norm(mix3(d, UP, 0.2)), o.card * CARD_SCALE[lv] * (0.8 + 0.6 * rng()), rng() * 6.3, { tile: tileAt(lv, o.tile, o.sprig ?? m.sprig), tone: [t[0] * dk, t[1] * dk, t[2] * dk], kind: o.kind, r: rng(), slot: pick(o.slots, rng()) });
    });
  }
}

// ---------------------------------------------------------------- conifers

type Spruce = { size: V3; tiers: number; card: number; lt: V3; skirt: number; bark: string };

function spruce(m: Mesh, rng: Rng, q: number, o: Spruce) {
  const lv = m.level;
  const [W, H] = o.size;
  m.H = H;
  m.R = W / 2;
  m.flex = 0.8;
  const bark = lin(o.bark);
  tube(m, [[0, -0.05, 0], [0.02, H * 0.3, 0.01], [0, H * 0.65, -0.01], [0, H * 0.98, 0]], [0.1, 0.075, 0.045, 0.012], q < 1 ? 4 : lv ? 9 : 6, bark, 0, { rng, vScale: 1.5, sub: lv ? 3 : 1 });
  const K = Math.max(5, Math.round(o.tiers * (q < 1 ? 0.7 : 1)));
  for (let i = 0; i < K; i++) {
    const tf = i / (K - 1);
    const y = H * (0.1 + 0.86 * tf);
    const R = (W / 2) * Math.pow(1 - tf * 0.96, 0.95) * (0.9 + 0.2 * rng());
    const nb = Math.max(7, Math.round((11 - tf * 3) * (q < 1 ? 0.7 : 1) * (lv ? SPRAY_MULT[lv] : 1)));
    const a0 = rng() * 6.3;
    // dark cone behind the needles so the tier reads as one soft mass
    const cone = 7;
    const ids: number[] = [];
    const apex = m.vert([0, y + R * 0.5, 0], UP, [0.5, 0.5], mul(o.lt, 0.3), KIND.conifer, 0.1, 0, [0, y, 0]);
    for (let s = 0; s < cone; s++) {
      const a = (s / cone) * Math.PI * 2 + a0;
      const rr = R * 0.74 * (0.85 + 0.3 * rng());
      const p: V3 = [Math.cos(a) * rr, y - R * (0.18 + o.skirt * 0.25), Math.sin(a) * rr];
      ids.push(m.vert(p, norm([Math.cos(a), 0.55, Math.sin(a)]), [0.5, 0.5], mul(o.lt, 0.34), KIND.conifer, 0.1, 0, [0, y, 0]));
    }
    for (let s = 0; s < cone; s++) m.tri(apex, ids[(s + 1) % cone], ids[s]);
    for (let j = 0; j < nb; j++) {
      const upper = j % 2 === 1; // every other branch rides higher and shorter, so the tier has two layers
      const a = a0 + (j / nb) * Math.PI * 2 + (i % 2) * 0.35 + (rng() - 0.5) * 0.3;
      const out: V3 = [Math.cos(a), 0, Math.sin(a)];
      const side = norm(cross(UP, out));
      const L = R * (upper ? 0.7 : 0.95) * (0.9 + 0.2 * rng());
      const droop = (0.22 + o.skirt * 0.3) * (upper ? 0.6 : 1);
      const base: V3 = [0, y + (upper ? R * 0.1 : -R * 0.04), 0];
      const mid = add(base, add(mul(out, L * 0.55), [0, -L * droop * 0.25, 0]));
      const end = add(base, add(mul(out, L), [0, -L * droop, 0]));
      const nrm = norm(add(mul(out, 0.35), [0, 1, 0]));
      const k = (upper ? 0.95 : 0.78) + 0.3 * rng();
      const tone: V3 = [o.lt[0] * k, o.lt[1] * k, o.lt[2] * k];
      const w = Math.min(1.1, 0.3 + L * 0.55) * (o.card / 0.5) * (lv ? SPRAY_W[lv] : 1);
      ribbon(m, [base, mid, end], [w * 0.6, w, w * 0.7], side, nrm, { tile: lv ? TILE.spruce : TILE.needle, tone, kind: KIND.conifer, r: rng(), slot: Math.floor(rng() * 3), base: 0.3 });
    }
  }
  // leader tip
  leafCard(m, [0, H * 0.96, 0], UP, 0.3, rng() * 6, { tile: lv ? TILE.spruce : TILE.needle, tone: mul(o.lt, 0.9), kind: KIND.conifer, r: 0.1, slot: 1 });
}

// ---------------------------------------------------------------- palm

function palm(m: Mesh, rng: Rng, q: number) {
  const lv = m.level;
  m.H = 4.4;
  m.R = 1.6;
  m.flex = 1.3;
  const bark = lin("#7a6648");
  const n = 12;
  const lean = (rng() - 0.5) * 0.7;
  const pts: V3[] = [], rad: number[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    pts.push([lean * t * t * 1.3 + Math.sin(t * 3) * 0.07, -0.04 + t * 3.55, 0.12 * Math.sin(t * 2.2 + 1) * t]);
    rad.push((0.11 - 0.03 * t) * (i % 2 ? 0.92 : 1.05) * (i === 0 ? 1.3 : 1));
  }
  tube(m, pts, rad, q < 1 ? 5 : lv ? 11 : 7, bark, 2, { rng, vScale: 2, sub: lv ? 2 : 1 });
  const crown = pts[n];
  const nf = Math.round(15 * (q < 1 ? 0.75 : 1) * (lv ? SPRAY_MULT[lv] : 1));
  for (let f = 0; f < nf; f++) {
    const a = (f / nf) * Math.PI * 2 + rng() * 0.3;
    const out: V3 = [Math.cos(a), 0, Math.sin(a)];
    const L = (1.9 + 0.3 * rng()) * (lv ? 1 - 0.12 * (f % 3) : 1), lift = f % 2 ? 0.6 : 1.0 + 0.3 * rng();
    const p: V3[] = [0, 1, 2, 3, 4, 5].map((i) => {
      const t = i / 5;
      return add(crown, add(mul(out, L * t), [0, lift * L * t * (1 - t * 1.05) * 0.9 + 0.12 * (1 - t), 0]));
    });
    const k = 0.8 + 0.25 * rng();
    ribbon(m, p, [0.12, 0.8, 1.0, 0.9, 0.6, 0.12], norm(cross(UP, out)), norm(add(UP, mul(out, 0.2))), { tile: TILE.frond, tone: [k, k, k], kind: KIND.conifer, r: rng(), slot: Math.floor(rng() * 3), base: 0.2, swT: (t) => 0.5 + 1.6 * t });
  }
  // a small cluster of dates under the crown
  for (let i = 0; i < 6; i++) {
    const a = i * 1.05;
    blob(m, add(crown, [Math.cos(a) * 0.14, -0.14 - (i % 2) * 0.08, Math.sin(a) * 0.14]), [0.06, 0.08, 0.06], { detail: 0, bump: 0.05, tone: lin("#a0642a"), kind: KIND.fruit, r: 0.4 + 0.1 * i, slot: 0, seed: 4 });
  }
}

// ---------------------------------------------------------------- shrubs and hedges

type Shrub = {
  size: V3;
  blobs: number;
  cards: number;
  card: number;
  tile: number;
  kind: number;
  lt: V3;
  slots?: number[];
  flowers?: { n: number; size: number; kind: number; tones: string[]; tile?: number };
  box?: boolean;
  /** atlas tile with this plant's own leaves, used from foliage level 1 on instead of `tile` */
  sprig?: number;
};

function shrub(m: Mesh, rng: Rng, q: number, o: Shrub) {
  const lv = m.level;
  const [W, H, D] = o.size;
  m.H = H;
  m.R = Math.max(W, D) / 2;
  m.flex = 0.9;
  const tone = (p: V3): V3 => {
    const d = Math.hypot(p[0] / (W / 2), (p[1] - H * 0.45) / (H * 0.6), p[2] / (D / 2));
    const k = (0.5 + 0.55 * smooth(0.2, 1.1, d)) * (0.8 + 0.35 * smooth(0, H, p[1])) * (0.93 + 0.14 * rng());
    return [o.lt[0] * k, o.lt[1] * k, o.lt[2] * k];
  };
  const slots = o.slots ?? [1, 1, 1];
  const places: { c: V3; r: V3 }[] = [];
  for (let i = 0; i < o.blobs; i++) {
    const a = i * GOLDEN + rng(), rr = i ? 0.28 + 0.12 * rng() : 0;
    const rx = (W / 2) * (i ? 0.62 : 0.8), rz = (D / 2) * (i ? 0.62 : 0.8), ry = H * (i ? 0.38 : 0.46);
    places.push({ c: [Math.cos(a) * rr * W, ry * 0.95 + (i ? 0.02 * H : 0), Math.sin(a) * rr * D], r: [rx, ry, rz] });
  }
  for (const b of places) {
    blob(m, b.c, [b.r[0] * 0.85, b.r[1] * 0.85, b.r[2] * 0.85], { detail: lv ? 1 : 0, bump: 0.16, tone: [0.2, 0.2, 0.2], kind: o.kind, r: 0.15, slot: 1, seed: 11 }, (p) => tone(p).map((v) => v * 0.5) as V3);
    sphereDirs(Math.round(o.cards * q * LEVEL_MULT[lv]), rng).forEach((d) => {
      if (d[1] < (lv ? -0.8 : -0.35)) return;
      const jr = lv ? 0.6 + 0.5 * Math.pow(rng(), 0.8) : 1;
      const p: V3 = [b.c[0] + d[0] * b.r[0] * jr, b.c[1] + d[1] * b.r[1] * jr, b.c[2] + d[2] * b.r[2] * jr];
      const dk = lv ? 0.62 + 0.38 * smooth(0.6, 1.1, jr) : 1;
      leafCard(m, p, norm(mix3(d, UP, 0.25)), o.card * CARD_SCALE[lv] * (0.75 + 0.5 * rng()), rng() * 6.3, { tile: tileAt(lv, o.tile, o.sprig ?? m.sprig), tone: dim(tone(p), dk), kind: o.kind, r: rng(), slot: pick(slots, rng()) });
    });
    if (lv) {
      // woody stems from the ground up into the clump: the bush has a skeleton, not just a leafy bag
      for (let k = 0; k < 2 + lv; k++) {
        const a = rng() * 6.3, r0 = 0.05 * W;
        const top = add(b.c, [Math.cos(a) * b.r[0] * 0.5, b.r[1] * (0.2 + 0.5 * rng()), Math.sin(a) * b.r[2] * 0.5]);
        tube(m, [[Math.cos(a) * r0, -0.02, Math.sin(a) * r0], mix3([Math.cos(a) * r0, 0, Math.sin(a) * r0], top, 0.5), top], [0.016, 0.011, 0.006], 4, lin("#5a4838"), 0, { rng, rough: 0.2, vScale: 4 });
      }
    }
    if (o.flowers) {
      const f = o.flowers;
      sphereDirs(Math.round(f.n * q * (lv ? Math.pow(LEVEL_MULT[lv], 0.65) : 1)), rng).forEach((d) => {
        if (d[1] < 0) return;
        const p: V3 = [b.c[0] + d[0] * b.r[0] * 1.03, b.c[1] + d[1] * b.r[1] * 1.03, b.c[2] + d[2] * b.r[2] * 1.03];
        const c = lin(f.tones[Math.floor(rng() * f.tones.length)]);
        const k = 0.85 + 0.3 * rng();
        leafCard(m, p, norm(mix3(d, UP, 0.5)), f.size * (lv ? 0.8 : 1) * (0.8 + 0.4 * rng()), rng() * 6.3, { tile: f.tile ?? TILE.flower, tone: [c[0] * k, c[1] * k, c[2] * k], kind: f.kind, r: rng(), slot: Math.floor(rng() * 4), base: 0.1 });
      });
    }
  }
}

/** A clipped hedge: a rounded-box mass with a fringe of leaf cards. Natural size [length, height, depth]. */
function hedge(m: Mesh, rng: Rng, q: number, size: V3) {
  const [L, H] = size;
  m.H = H;
  m.R = L / 2;
  m.flex = 0.7;
  const tone: HedgeTone = (p) => {
    const k = (0.6 + 0.4 * smooth(0, H, p[1])) * (0.92 + 0.16 * rng());
    return [k, k, k];
  };
  hedgeShell(m, size, tone);
  hedgeFringe(m, rng, q, size, tone);
  if (m.level) hedgeEnds(m, rng, q, size, tone);
}

type HedgeTone = (p: V3) => V3;

/** The clipped body: six faces of a box with its edges rolled by a radius. */
function hedgeShell(m: Mesh, size: V3, tone: HedgeTone) {
  const [L, H, D] = size;
  const rad = Math.min(H, D) * 0.3;
  const half: V3 = [L / 2 - rad, H / 2 - rad, D / 2 - rad];
  const divs = 3;
  const faces: [number, V3, V3][] = [[0, [0, 1, 0], [0, 0, 1]], [1, [0, 0, 1], [1, 0, 0]], [2, [1, 0, 0], [0, 1, 0]]];
  const cy = H / 2;
  for (const [axis, u, v] of faces) {
    for (const sgn of [-1, 1]) {
      const ids: number[][] = [];
      for (let i = 0; i <= divs; i++) {
        const row: number[] = [];
        for (let j = 0; j <= divs; j++) {
          const a = (i / divs) * 2 - 1, b = (j / divs) * 2 - 1;
          const nv: V3 = [0, 0, 0];
          nv[axis] = sgn;
          const raw: V3 = add(add(mul(u, a), mul(v, b)), nv);
          const P: V3 = [raw[0] * (L / 2), raw[1] * (H / 2), raw[2] * (D / 2)];
          const inner: V3 = [clamp(P[0], -half[0], half[0]), clamp(P[1], -half[1], half[1]), clamp(P[2], -half[2], half[2])];
          const dir = norm(sub(P, inner));
          const k = 1 + 0.07 * (noise3(raw[0] * 2.2 + L, raw[1] * 2.2, raw[2] * 2.2, 9) - 0.5) * 2;
          const p: V3 = [inner[0] + dir[0] * rad * k, cy + inner[1] + dir[1] * rad * k, inner[2] + dir[2] * rad * k];
          const t = tone(p);
          row.push(m.vert(p, dir, [0.5, 0.5], [t[0] * 0.55, t[1] * 0.55, t[2] * 0.55], KIND.hedge, 0.1, 1, [0, cy, 0]));
        }
        ids.push(row);
      }
      for (let i = 0; i < divs; i++) {
        for (let j = 0; j < divs; j++) {
          const [a, b, c, d] = [ids[i][j], ids[i + 1][j], ids[i + 1][j + 1], ids[i][j + 1]];
          if (sgn > 0) {
            m.tri(a, b, c);
            m.tri(a, c, d);
          } else {
            m.tri(a, c, b);
            m.tri(a, d, c);
          }
        }
      }
    }
  }
}

/** Leaf fringe over the whole surface. */
function hedgeFringe(m: Mesh, rng: Rng, q: number, size: V3, tone: HedgeTone) {
  const lv = m.level;
  const [L, H, D] = size;
  const n = Math.round(L * 62 * q * LEVEL_MULT[lv]);
  for (let i = 0; i < n; i++) {
    const x = (rng() - 0.5) * L, z = (rng() - 0.5) * D;
    const topside = rng() < 0.4;
    let p: V3, nrm: V3;
    let dk = 1; // leaves set a little into the clipped surface are darker
    if (topside) {
      p = [x, H * (lv ? 0.9 + 0.17 * rng() : 0.97 + 0.05 * rng()), z * 0.8];
      nrm = norm([(rng() - 0.5) * 0.5, 1, (rng() - 0.5) * 0.5]);
    } else {
      const s = rng() < 0.5 ? -1 : 1;
      const dp = lv ? rng() : 1;
      dk = lv ? 0.65 + 0.35 * dp : 1;
      p = [x, H * (0.1 + 0.85 * rng()), s * D * 0.5 * (lv ? 0.9 + 0.14 * dp : 1.02)];
      nrm = norm([(rng() - 0.5) * 0.3, 0.15, s]);
    }
    leafCard(m, p, nrm, 0.32 * CARD_SCALE[lv] * (0.75 + 0.5 * rng()), rng() * 6.3, { tile: lv ? TILE.boxwood : TILE.small, tone: dim(tone(p), dk), kind: KIND.hedge, r: rng(), slot: Math.floor(rng() * 3) });
  }
}

/** The two short ends of the hedge are clipped leaf walls as well (denser levels only). */
function hedgeEnds(m: Mesh, rng: Rng, q: number, size: V3, tone: HedgeTone) {
  const lv = m.level;
  const [L, H, D] = size;
  const ends = Math.round(D * H * 2 * 28 * LEVEL_MULT[lv] * q);
  for (let i = 0; i < ends; i++) {
    const s = i % 2 ? -1 : 1, dp = rng();
    const p: V3 = [s * L * 0.5 * (0.9 + 0.14 * dp), H * (0.1 + 0.88 * rng()), (rng() - 0.5) * D * 0.8];
    const t = tone(p), dk = 0.65 + 0.35 * dp;
    leafCard(m, p, norm([s, 0.15, (rng() - 0.5) * 0.3]), 0.32 * CARD_SCALE[lv] * (0.75 + 0.5 * rng()), rng() * 6.3, { tile: TILE.boxwood, tone: [t[0] * dk, t[1] * dk, t[2] * dk], kind: KIND.hedge, r: rng(), slot: Math.floor(rng() * 3) });
  }
}

// ---------------------------------------------------------------- ground layer

/** Arching blades from one point: ornamental grass, lawn tufts, reeds. */
function blades(m: Mesh, rng: Rng, o: { n: number; h: number; spread: number; w: number; kind: number; segs: number; arch: number; tone: V3; cat?: boolean; plume?: boolean }) {
  m.H = o.h;
  m.R = o.spread;
  m.flex = 1.4;
  const lv = m.level;
  if (lv) {
    grassClump(m, rng, { n: Math.round(o.n * (1 + lv)), h: o.h, spread: o.spread, w: o.w, arch: o.arch, tone: o.tone }); // fans of fine tapered blades: no hollow centre
  } else {
    for (let i = 0; i < o.n; i++) {
      const a = (i / o.n) * Math.PI * 2 * 2.3 + rng() * 0.5;
      const out: V3 = [Math.cos(a), 0, Math.sin(a)];
      const h = o.h * (0.55 + 0.45 * rng()), sp = o.spread * (0.2 + 0.8 * rng()) * (1 - 0.2 * (h / o.h));
      const base: V3 = [out[0] * 0.03, 0, out[2] * 0.03];
      const pts: V3[] = Array.from({ length: o.segs + 1 }, (_, s) => {
        const t = s / o.segs;
        return add(base, add(mul(out, sp * Math.pow(t, 1 + o.arch)), [0, h * (t - 0.35 * Math.pow(t, 3) * o.arch), 0]));
      });
      const k = 0.75 + 0.3 * rng();
      const w = o.w * (0.8 + 0.4 * rng());
      ribbon(m, pts, pts.map((_, s) => w * (1 - 0.8 * Math.pow(s / o.segs, 1.5))), norm(cross(UP, out)), norm(add(mul(out, 0.3), UP)), { tile: TILE.blade, tone: [o.tone[0] * k, o.tone[1] * k, o.tone[2] * k], kind: o.kind, r: rng(), slot: Math.floor(rng() * 3), base: 0.35, swT: (t) => 0.2 + 1.6 * t * t });
    }
  }
  if (o.cat) {
    for (let i = 0; i < 4; i++) {
      const a = i * 1.7 + rng();
      const x = Math.cos(a) * 0.1, z = Math.sin(a) * 0.1, h = o.h * (0.75 + 0.2 * rng());
      tube(m, [[x, 0, z], [x, h * 0.78, z], [x, h * 0.8, z]], [0.006, 0.006, 0.005], 3, lin("#4a3a26"), 2, { rng });
      tube(m, [[x, h * 0.74, z], [x, h * 0.84, z], [x, h * 0.95, z]], [0.022, 0.026, 0.01], 5, lin("#5a3a22"), 2, { rng });
    }
  }
}

function fern(m: Mesh, rng: Rng, q: number) {
  m.H = 0.55;
  m.R = 0.4;
  m.flex = 1.2;
  const n = Math.round(10 * q * (1 + 0.7 * m.level));
  for (let i = 0; i < n; i++) {
    const a = i * GOLDEN + rng() * 0.2;
    const out: V3 = [Math.cos(a), 0, Math.sin(a)];
    const L = 0.38 + 0.2 * rng(), lift = 0.6 + 0.5 * rng();
    const pts: V3[] = [0, 1, 2, 3, 4].map((s) => {
      const t = s / 4;
      return add([0, 0.02, 0], add(mul(out, L * t), [0, lift * L * t * (1 - t * 0.9) + 0.05, 0]));
    });
    const k = 0.75 + 0.3 * rng();
    ribbon(m, pts, [0.05, 0.2, 0.24, 0.18, 0.05], norm(cross(UP, out)), norm(add(UP, mul(out, 0.3))), { tile: TILE.fern, tone: [k, k, k], kind: KIND.bush, r: rng(), slot: 1, base: 0.3, swT: (t) => 0.4 + 1.4 * t });
  }
}

function bamboo(m: Mesh, rng: Rng, q: number) {
  m.H = 3.6;
  m.R = 0.6;
  m.flex = 1.2;
  const bark = lin("#8a9a4a");
  const n = Math.round(7 * (q < 1 ? 0.7 : 1));
  for (let i = 0; i < n; i++) {
    const a = i * GOLDEN, r0 = 0.1 + 0.25 * rng();
    const h = 2.6 + 1.0 * rng(), lean = 0.15 + 0.25 * rng();
    const out: V3 = [Math.cos(a), 0, Math.sin(a)];
    const pts: V3[] = [0, 1, 2, 3, 4].map((s) => {
      const t = s / 4;
      return add([out[0] * r0, -0.03 + h * t, out[2] * r0], mul(out, lean * t * t));
    });
    tube(m, pts, [0.028, 0.026, 0.024, 0.021, 0.015], 4, bark, 2, { rng, vScale: 4 });
    for (let c = 0; c < 6 * q; c++) {
      const t = 0.45 + 0.55 * (c / 6);
      const base = mix3(pts[Math.floor(t * 4)], pts[Math.min(4, Math.floor(t * 4) + 1)], (t * 4) % 1);
      const d = norm(add(mul([Math.cos(a + c * 2.1), 0, Math.sin(a + c * 2.1)], 1), [0, -0.1, 0]));
      const nrm = norm(add(d, [0, 0.7, 0]));
      const k = 0.8 + 0.3 * rng();
      ribbon(m, [base, add(base, mul(d, 0.28)), add(add(base, mul(d, 0.52)), [0, -0.12, 0])], [0.03, 0.2, 0.03], norm(cross(UP, d)), nrm, { tile: TILE.narrow, tone: [k, k, k], kind: KIND.conifer, r: rng(), slot: Math.floor(rng() * 3), base: 0.2, swT: (s) => 0.8 + s });
    }
  }
}

/** A single flowering plant: stems with heads, and a few leaf blades. */
function flowerPlant(m: Mesh, rng: Rng, o: { n: number; h: number; spread: number; head: number; tile: number; tones: string[]; rise: boolean; spike?: boolean }) {
  m.H = o.h;
  m.R = o.spread;
  m.flex = 1.3;
  const stem = lin("#4f8a3a");
  for (let i = 0; i < o.n; i++) {
    const a = i * GOLDEN + rng(), r0 = o.spread * 0.7 * Math.sqrt((i + 0.5) / o.n);
    const x = Math.cos(a) * r0, z = Math.sin(a) * r0;
    const h = o.h * (0.65 + 0.35 * rng());
    const bend: V3 = [Math.cos(a) * 0.05 * h, 0, Math.sin(a) * 0.05 * h];
    const top = add([x, h, z], mul(bend, 2));
    tube(m, [[x, 0, z], add([x, h * 0.55, z], bend), top], [0.008, 0.006, 0.005], 3, stem, 2, { rng, r: rng() });
    const c = lin(o.tones[Math.floor(rng() * o.tones.length)]);
    const k = 0.85 + 0.3 * rng();
    const tone: V3 = [c[0] * k, c[1] * k, c[2] * k];
    if (o.spike) {
      card(m, add(top, [0, o.head * 0.4, 0]), [o.head * 0.28, 0, 0], [0, o.head * 0.6, 0], [0.2, 0.2, 1], { tile: TILE.spike, tone, kind: KIND.bloom, r: rng(), slot: 0, base: 0.1 });
      card(m, add(top, [0, o.head * 0.4, 0]), [0, 0, o.head * 0.28], [0, o.head * 0.6, 0], [1, 0.2, 0.2], { tile: TILE.spike, tone, kind: KIND.bloom, r: rng(), slot: 0, base: 0.1 });
    } else {
      const tilt = norm([Math.cos(a) * 0.35, 1, Math.sin(a) * 0.35]);
      leafCard(m, add(top, mul(tilt, o.head * 0.15)), tilt, o.head, rng() * 6.3, { tile: o.tile, tone, kind: KIND.bloom, r: rng(), slot: 0, base: 0.05 });
    }
    if (i % 2 === 0) {
      const d: V3 = [Math.cos(a), 0, Math.sin(a)];
      const kk = 0.8 + 0.3 * rng();
      ribbon(m, [[x, 0.02, z], add([x, h * 0.28, z], mul(d, h * 0.22)), add([x, h * 0.4, z], mul(d, h * 0.45))], [0.01, 0.07, 0.02], norm(cross(UP, d)), norm(add(UP, d)), { tile: TILE.blade, tone: [kk, kk, kk], kind: KIND.stem, r: rng(), slot: 0, base: 0.3, swT: (t) => 0.3 + t });
    }
  }
}

/** A raised bed of mixed flowers. Natural size [1.2, 0.4, 0.5]. */
function bed(m: Mesh, rng: Rng, q: number, mixKind: number) {
  m.H = 0.4;
  m.R = 0.6;
  m.flex = 1.2;
  const soil = lin(m.level ? "#85684c" : "#3a2c22"); // the denser tiers show a lighter, mulched soil: a black slab reads as a hole in the lawn
  blob(m, [0, 0.03, 0], [0.58, 0.07, 0.24], { detail: 1, bump: 0.08, tone: soil, kind: KIND.rock, r: 0, slot: 0, seed: 13 });
  const n = Math.round(20 * q * (1 + 0.6 * m.level));
  for (let i = 0; i < n; i++) {
    const x = (rng() - 0.5) * 1.05, z = (rng() - 0.5) * 0.42, h = 0.2 + 0.2 * rng();
    const k = (mixKind + i) % 4;
    const base: V3 = [x, 0.08, z];
    const stem = lin("#4f8a3a");
    tube(m, [base, add(base, [0.01, h * 0.5, 0]), add(base, [0.02, h, 0.01])], [0.006, 0.005, 0.004], 3, stem, 2, { rng, r: rng() });
    // colour comes from the palette's four flower slots (spring pink, summer yellow ...) so the bed follows the season
    const tint = 0.85 + 0.3 * rng();
    const head: V3 = add(base, [0.02, h, 0.01]);
    if (k === 2) {
      card(m, add(head, [0, 0.06, 0]), [0.025, 0, 0], [0, 0.07, 0], [0.2, 0.2, 1], { tile: TILE.spike, tone: [tint, tint, tint], kind: KIND.flower, r: rng(), slot: k, base: 0.1 });
      card(m, add(head, [0, 0.06, 0]), [0, 0, 0.025], [0, 0.07, 0], [1, 0.2, 0.2], { tile: TILE.spike, tone: [tint, tint, tint], kind: KIND.flower, r: rng(), slot: k, base: 0.1 });
    } else {
      leafCard(m, add(head, [0, 0.02, 0]), norm([(rng() - 0.5) * 0.4, 1, (rng() - 0.5) * 0.4]), 0.17 + 0.07 * rng(), rng() * 6.3, { tile: k === 1 ? TILE.tulip : TILE.flower, tone: [tint, tint, tint], kind: KIND.flower, r: rng(), slot: rng() < 0.5 ? k : Math.floor(rng() * 4), base: 0.05 });
    }
  }
  // leaf rosettes
  for (let i = 0; i < 16 * q * (1 + 0.6 * m.level); i++) {
    const x = (rng() - 0.5) * 1.05, z = (rng() - 0.5) * 0.42;
    const a = rng() * 6.3, d: V3 = [Math.cos(a), 0, Math.sin(a)];
    const base: V3 = [x, 0.05, z];
    const k = 0.8 + 0.3 * rng();
    ribbon(m, [base, add(add(base, mul(d, 0.14)), [0, 0.12, 0]), add(add(base, mul(d, 0.3)), [0, 0.07, 0])], [0.04, 0.2, 0.04], norm(cross(UP, d)), norm(add(UP, d)), m.level ? { tile: TILE.blade, tone: [k, k, k], kind: KIND.grass, r: rng(), slot: Math.floor(rng() * 3), base: 0.3, swT: (t) => 0.3 + t } : { tile: TILE.blade, tone: [k, k, k], kind: KIND.stem, r: rng(), slot: 0, base: 0.3, swT: (t) => 0.3 + t }); // foliage of the denser tiers stays through autumn and winter (straw, then snow), the bed is never bare soil
  }
}

function tuft(m: Mesh, rng: Rng, q: number) {
  blades(m, rng, { n: Math.round(9 * q), h: 0.3, spread: m.level ? 0.19 : 0.12, w: 0.05, kind: KIND.grass, segs: 2, arch: 0.8, tone: [1, 1, 1] }); // the fans of the denser levels are drawn at the full footprint: fit() then leaves their width alone
}

function clover(m: Mesh, rng: Rng, q: number) {
  m.H = 0.06;
  m.R = 0.3;
  m.flex = 0.5;
  for (let i = 0; i < Math.round(7 * q * (1 + m.level)); i++) {
    const a = rng() * 6.3, r = Math.sqrt(rng()) * 0.26;
    const k = 0.75 + 0.3 * rng();
    leafCard(m, [Math.cos(a) * r, 0.022 + 0.01 * rng(), Math.sin(a) * r], norm([(rng() - 0.5) * 0.4, 1, (rng() - 0.5) * 0.4]), 0.15 + 0.06 * rng(), rng() * 6.3, { tile: TILE.clover, tone: [k, k, k], kind: KIND.grass, r: rng(), slot: Math.floor(rng() * 3), base: 0.1 });
  }
  for (let i = 0; i < 3; i++) {
    const a = rng() * 6.3, r = Math.sqrt(rng()) * 0.24;
    leafCard(m, [Math.cos(a) * r, 0.05, Math.sin(a) * r], UP, 0.045, rng() * 6.3, { tile: TILE.flower, tone: [1.1, 1.1, 1.1], kind: KIND.flower, r: rng(), slot: 2, base: 0 });
  }
}

function groundcover(m: Mesh, rng: Rng, q: number) {
  m.H = 0.18;
  m.R = 0.45;
  m.flex = 0.6;
  for (let i = 0; i < Math.round(26 * q * (1 + m.level)); i++) {
    const a = rng() * 6.3, r = Math.sqrt(rng()) * 0.42;
    const h = 0.03 + 0.1 * (1 - r / 0.42) * rng();
    const k = 0.7 + 0.35 * rng();
    leafCard(m, [Math.cos(a) * r, h, Math.sin(a) * r], norm([(rng() - 0.5) * 0.5, 1, (rng() - 0.5) * 0.5]), 0.17 + 0.08 * rng(), rng() * 6.3, { tile: TILE.small, tone: [k, k, k], kind: KIND.bush, r: rng(), slot: 1, base: 0.2 });
  }
}

function rock(m: Mesh, rng: Rng, size: V3, moss: number) {
  m.H = size[1];
  m.R = size[0] / 2;
  m.flex = 0;
  const grey = lin(["#7d7f80", "#9a9a94", "#6a6c70"][Math.floor(rng() * 3)]);
  const mossC = lin("#3f6a2c");
  blob(m, [0, size[1] * 0.36, 0], [size[0] * 0.5, size[1] * 0.46, size[2] * 0.5], { detail: 1, bump: 0.22, tone: grey, kind: KIND.rock, r: 0, slot: 0, seed: Math.floor(rng() * 90) }, (p) => {
    const up = smooth(0.35, 0.8, p[1] / size[1]) * moss * (0.5 + noise3(p[0] * 5, p[1] * 5, p[2] * 5, 4));
    const k = 0.85 + 0.3 * noise3(p[0] * 7, p[1] * 7, p[2] * 7, 8);
    return mix3([grey[0] * k, grey[1] * k, grey[2] * k], mossC, clamp(up));
  });
}

function mushroom(m: Mesh, rng: Rng) {
  m.H = 0.12;
  m.R = 0.07;
  m.flex = 0;
  const stem = lin("#ece6d6"), capC = lin(rng() < 0.5 ? "#b8452f" : "#a85a34");
  tube(m, [[0, 0, 0], [0.004, 0.05, 0], [0, 0.085, 0]], [0.016, 0.012, 0.013], 5, stem, 2, { rng });
  for (let i = 0; i < 3; i++) {
    const rr = [0.07, 0.062, 0.03][i], y = [0.085, 0.108, 0.12][i];
    for (let s = 0; s < 6; s++) {
      const a0 = (s / 6) * Math.PI * 2, a1 = ((s + 1) / 6) * Math.PI * 2;
      if (i === 2) continue;
      const r2 = [0.062, 0.03][i];
      const y2 = [0.108, 0.12][i];
      const p = (r: number, a: number, y: number): V3 => [Math.cos(a) * r, y, Math.sin(a) * r];
      const nrm = (a: number, k: number): V3 => norm([Math.cos(a) * (1 - k), k, Math.sin(a) * (1 - k)]);
      const v = [m.vert(p(rr, a0, y), nrm(a0, 0.3), [0.5, 0.5], capC, KIND.mushroom, rng(), 0, [0, y, 0]), m.vert(p(rr, a1, y), nrm(a1, 0.3), [0.5, 0.5], capC, KIND.mushroom, rng(), 0, [0, y, 0]), m.vert(p(r2, a1, y2), nrm(a1, 0.7), [0.5, 0.5], capC, KIND.mushroom, rng(), 0, [0, y, 0]), m.vert(p(r2, a0, y2), nrm(a0, 0.7), [0.5, 0.5], capC, KIND.mushroom, rng(), 0, [0, y, 0])];
      m.tri(v[0], v[2], v[1]);
      m.tri(v[0], v[3], v[2]);
    }
  }
  const top = m.vert([0, 0.125, 0], UP, [0.5, 0.5], capC, KIND.mushroom, 0.5, 0, [0, 0.1, 0]);
  const ring = Array.from({ length: 6 }, (_, s) => m.vert([Math.cos((s / 6) * 6.2832) * 0.03, 0.12, Math.sin((s / 6) * 6.2832) * 0.03], UP, [0.5, 0.5], capC, KIND.mushroom, 0.5, 0, [0, 0.1, 0]));
  for (let s = 0; s < 6; s++) m.tri(top, ring[s + 1 === 6 ? 0 : s + 1], ring[s]);
}

function patch(m: Mesh, rng: Rng) {
  m.H = 0.02;
  m.R = 0.5;
  m.flex = 0;
  const c = m.vert([0, 0.012, 0], UP, [0.5, 0.5], lin("#8c7440"), KIND.patch, 0.5, 0, [0, 0, 0]);
  const n = 9;
  const ids = Array.from({ length: n }, (_, i) => {
    const a = (i / n) * Math.PI * 2;
    const r = 0.5 * (0.7 + 0.5 * rng());
    return m.vert([Math.cos(a) * r, 0.012, Math.sin(a) * r * 0.8], UP, [0.5, 0.5], lin("#7a6636"), KIND.patch, 0.5, 0, [0, 0, 0]);
  });
  for (let i = 0; i < n; i++) m.tri(c, ids[i], ids[(i + 1) % n]);
}

function litter(m: Mesh, rng: Rng) {
  m.H = 0.03;
  m.R = 0.2;
  m.flex = 0.3;
  for (let i = 0; i < 4; i++) {
    const a = rng() * 6.3, r = Math.sqrt(rng()) * 0.16;
    const k = 0.8 + 0.3 * rng();
    leafCard(m, [Math.cos(a) * r, 0.012 + 0.008 * i, Math.sin(a) * r], norm([(rng() - 0.5) * 0.3, 1, (rng() - 0.5) * 0.3]), 0.1 + 0.04 * rng(), rng() * 6.3, { tile: TILE.leaf, tone: [k, k, k], kind: KIND.litter, r: (i + rng()) / 4, slot: Math.floor(rng() * 3), base: 0 });
  }
}

export const BUILDERS = { broadleaf, column, spruce, palm, shrub, hedge, blades, fern, bamboo, flowerPlant, bed, tuft, clover, groundcover, rock, mushroom, patch, litter };
export type { Broad, Spruce, Shrub };
