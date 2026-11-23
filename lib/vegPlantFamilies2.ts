import { KIND, add, card, cross, dot, frame, mul, norm, sub } from "./vegBuilder.ts";
import { GOLDEN, UP, along, cnt, curve, fresh, init, leafAt, lt, outOf, range, solid, sprig, stem, vary, type Ctx } from "./vegPlantKit.ts";
import { lerp, type V3 } from "./mathUtil.ts";

/** More plant families for lib/vegPlants.ts: ribbed cacti and flat pads, stems with leaf pairs (herbs, jade), sprig bushes and flower spikes, branching twigs. */

// ---------------------------------------------------------------- cacti

/** A ribbed, smoothly tapering body along `pts` (columnar cactus, barrel cactus, arms): ridges light, valleys dark, optional spine tufts on the ridges. */
export function ribbed(c: Ctx, pts: V3[], radii: number[], o: { ribs: number; depth: number; tone: string; spines?: { tile: number; tone: string; size: number; every: number } }) {
  const { m, rng } = c;
  const per = c.level >= 1 ? 3 : 2, rs = o.ribs * per;
  const base = solid(o.tone);
  const rings: number[][] = [];
  let side: V3 = [1, 0, 0];
  const tufts: { p: V3; n: V3 }[] = [];
  for (let i = 0; i < pts.length; i++) {
    const dir = norm(sub(pts[Math.min(pts.length - 1, i + 1)], pts[Math.max(0, i - 1)]));
    side = norm(sub(side, mul(dir, dot(side, dir))));
    const up2 = cross(dir, side);
    const t = i / (pts.length - 1);
    const ring: number[] = [];
    for (let s = 0; s <= rs; s++) {
      const a = (s / rs) * Math.PI * 2;
      const phase = Math.cos(a * o.ribs); // 1 on a ridge, -1 in a valley
      const nrm = add(mul(side, Math.cos(a)), mul(up2, Math.sin(a)));
      const rr = radii[i] * (1 + o.depth * (phase > 0 ? Math.pow(phase, 0.7) : phase * 0.6));
      const k = (0.86 + 0.16 * phase) * (0.85 + 0.15 * t);
      const tone: V3 = [base[0] * k * (1 + 0.1 * t), base[1] * k, base[2] * k];
      const p = add(pts[i], mul(nrm, rr));
      ring.push(m.vert(p, nrm, [0.5, 0.5], tone, KIND.house, 0, 0, pts[i]));
      if (o.spines && s < rs && phase > 0.97 && i > 0 && i < pts.length - 1 && i % o.spines.every === 0) tufts.push({ p: add(pts[i], mul(nrm, rr + 0.002)), n: nrm });
    }
    rings.push(ring);
  }
  for (let i = 0; i < rings.length - 1; i++) {
    for (let s = 0; s < rs; s++) {
      const a = rings[i][s], b = rings[i][s + 1], d = rings[i + 1][s], e = rings[i + 1][s + 1];
      m.tri(a, d, e);
      m.tri(a, e, b);
    }
  }
  const last = pts[pts.length - 1];
  const cap = m.vert(add(last, mul(norm(sub(last, pts[pts.length - 2])), radii[radii.length - 1] * 0.5)), norm(sub(last, pts[pts.length - 2])), [0.5, 0.5], mul(base, 1.1), KIND.house, 0, 0, last);
  const top = rings[rings.length - 1];
  for (let s = 0; s < rs; s++) m.tri(top[s], top[s + 1], cap);
  if (o.spines) {
    const stone = lt(o.spines.tone);
    for (const t of tufts) {
      const [right, up] = frame(t.n, rng() * 6.283);
      const sz = o.spines.size * (0.8 + 0.4 * rng());
      card(m, t.p, mul(right, sz / 2), mul(up, sz / 2), t.n, { tile: o.spines.tile, tone: stone, kind: KIND.house, r: rng(), slot: 0, base: 0 });
    }
  }
}

/** Columnar cactus (saguaro style) with `arms` arms; natural height H and body radius R. */
export function columnar(c: Ctx, o: { H: number; R: number; arms: number; ribs: number; tone: string; spines: { tile: number; tone: string; size: number } }) {
  const { rng } = c;
  init(c.m, o.H, o.R * 5);
  const N = 9;
  const pts = Array.from({ length: N }, (_, i) => [0, (o.H * i) / (N - 1), 0] as V3);
  const radii = pts.map((_, i) => o.R * Math.sqrt(Math.max(0.12, 1 - Math.pow(Math.max(0, (i / (N - 1) - 0.8) / 0.2), 2))));
  const every = c.level >= 2 ? 1 : 2;
  ribbed(c, pts, radii, { ribs: o.ribs, depth: 0.22, tone: o.tone, spines: { ...o.spines, every } });
  for (let a = 0; a < o.arms; a++) {
    const yaw = a * Math.PI + 0.6 + rng() * 0.4;
    const out = outOf(yaw);
    const y0 = o.H * (0.3 + 0.12 * a + 0.05 * rng());
    const reach = o.H * (0.12 + 0.04 * rng()), rise = o.H * (0.22 + 0.1 * rng());
    const b: V3 = [0, y0, 0];
    const tip = add(add(b, mul(out, reach)), [0, rise, 0]);
    const apts = curve(add(b, mul(out, o.R * 0.5)), tip, add(mul(out, reach * 0.35), [0, -rise * 0.2, 0]), 6);
    const arad = apts.map((_, i) => o.R * 0.7 * Math.sqrt(Math.max(0.15, 1 - Math.pow(Math.max(0, (i / 6 - 0.78) / 0.22), 2))));
    ribbed(c, apts, arad, { ribs: Math.max(5, o.ribs - 2), depth: 0.22, tone: o.tone, spines: { ...o.spines, every } });
  }
}

/** Flat paddle pads (prickly pear): a base pad and children growing from the top edge, each two cards a hair apart so the pad has a thickness. */
export function pads(c: Ctx, o: { tile: number; tone: string; size: [number, number]; n: number; spread: number }) {
  const { rng } = c;
  init(c.m, o.size[1] * 2.4, o.spread);
  const base = lt(o.tone);
  const n = Math.max(3, cnt(c, o.n));
  const queue: { p: V3; yaw: number; lean: number; scale: number }[] = [{ p: [0, 0, 0], yaw: rng() * 6.283, lean: 0.1, scale: 1 }];
  for (let i = 0; i < n && i < queue.length + 40; i++) {
    const q = queue[i];
    if (!q) break;
    const w = o.size[0] * q.scale, h = o.size[1] * q.scale;
    const tone = fresh(vary(c, base, 0.12), q.scale < 0.8 ? 0.5 : 0);
    for (const off of [-0.006, 0.006]) {
      sprig(c, add(q.p, mul(outOf(q.yaw + Math.PI / 2), off)), { tile: o.tile, tone, w, h, yaw: q.yaw + Math.PI / 2, lean: q.lean, base: 0.12 });
    }
    const up = norm(add(mul(UP, Math.cos(q.lean)), mul(outOf(q.yaw + Math.PI / 2), Math.sin(q.lean))));
    const top = add(q.p, mul(up, h * 0.88));
    const kids = q.scale > 0.75 ? 2 : 1;
    for (let k = 0; k < kids && queue.length < n; k++) {
      const yaw = q.yaw + (k ? -1 : 1) * (0.7 + 0.5 * rng());
      queue.push({ p: add(top, mul(outOf(yaw), 0.03)), yaw, lean: 0.35 + 0.35 * rng() * (k ? -1 : 1), scale: q.scale * (0.72 + 0.1 * rng()) });
    }
  }
}

// ---------------------------------------------------------------- stems with leaf pairs (basil, mint, jade, pilea)

type NodeO = {
  stems: number;
  h: [number, number];
  /** how far a stem leans out, as a share of its height */
  lean: number;
  r: number;
  stem: string;
  /** leaf pairs per stem at level 0 */
  nodes: number;
  tile: number;
  tone: string;
  len: [number, number];
  ratio: number;
  elev: number;
  droop: number;
  vary: number;
  /** the first node starts this high up the stem (share) */
  from: number;
  /** bare woody stems at the base (jade): extra width of the lowest stem part */
  woody?: number;
};

export function nodes(c: Ctx, o: NodeO) {
  const { rng } = c;
  init(c.m, o.h[1], o.h[1] * o.lean + o.len[1]);
  const base = lt(o.tone), stoneTone = solid(o.stem);
  const per = cnt(c, o.nodes);
  for (let k = 0; k < o.stems; k++) {
    const yaw = GOLDEN * k + 0.4;
    const h = range(c, o.h[0], o.h[1]);
    const b: V3 = add([0, 0, 0], mul(outOf(yaw), 0.015 * rng()));
    const top = add(b, add(mul(outOf(yaw), h * o.lean * (0.5 + rng())), [0, h, 0]));
    const pts = curve(b, top, mul(outOf(yaw + 1), h * 0.05), 5);
    stem(c, pts, o.r * (o.woody ? 1.4 : 1), o.r * 0.6, stoneTone, 4);
    for (let j = 0; j < per; j++) {
      const u = o.from + ((1 - o.from) * (j + 0.4)) / per;
      const [p] = along(pts, u);
      const len = lerp(o.len[1], o.len[0], u * 0.8) * (0.85 + 0.3 * rng());
      const ny = yaw + j * (Math.PI / 2) + rng() * 0.3;
      for (const side of [0, 1]) {
        leafAt(c, p, {
          tile: o.tile, tone: fresh(vary(c, base, o.vary), u * 0.8), len, wid: len * o.ratio, yaw: ny + side * Math.PI,
          elev: o.elev + (rng() - 0.5) * 0.3 + 0.35 * u, droop: o.droop, twist: (rng() - 0.5) * 0.5,
        });
      }
    }
    // the growing tip: an upright pair of small leaves
    for (const side of [0, 1]) {
      leafAt(c, top, { tile: o.tile, tone: fresh(base, 1), len: o.len[0] * 0.6, wid: o.len[0] * 0.6 * o.ratio, yaw: yaw + side * Math.PI, elev: 1.0, droop: 0.2 });
    }
  }
}

// ---------------------------------------------------------------- sprig bushes and flower spikes (rosemary, lavender, eucalyptus)

export function bush(c: Ctx, o: { n: number; tile: number; tone: string; w: number; h: [number, number]; lean: [number, number]; spread: number; woody: string; woodyR: number; vary: number }) {
  const { rng } = c;
  init(c.m, o.h[1], o.spread * 2);
  const base = lt(o.tone);
  const wood = solid(o.woody);
  for (let i = 0; i < 4; i++) {
    const yaw = i * 1.7 + rng();
    const tip = add(mul(outOf(yaw), o.spread * 0.5), [0, o.h[1] * 0.5, 0]);
    stem(c, curve([0, 0, 0], tip, [0, 0.02, 0], 3), o.woodyR, o.woodyR * 0.5, wood, 4);
  }
  const n = cnt(c, o.n);
  for (let i = 0; i < n; i++) {
    const f = i / n;
    const yaw = GOLDEN * i + rng() * 0.3;
    const r = o.spread * (0.15 + 0.85 * Math.sqrt(f)) * (0.6 + 0.4 * rng());
    const h = range(c, o.h[0], o.h[1]) * (1 - 0.3 * (r / o.spread));
    sprig(c, add(mul(outOf(yaw), r * 0.7), [0, o.h[1] * 0.12 * rng(), 0]), {
      tile: o.tile, tone: fresh(vary(c, base, o.vary), (1 - f) * 0.4), w: o.w * (0.8 + 0.4 * rng()), h, yaw: yaw + 1.2, lean: lerp(o.lean[0], o.lean[1], r / o.spread) * (0.7 + 0.6 * rng()), base: 0.3,
    });
  }
}

/** Slim stems fanning out of one point, each ending in a card (a flower spike, a plume): `top` of the stem is the card's base. */
export function spikes(c: Ctx, o: { n: number; tile: number; tone: string; w: number; len: number; h: [number, number]; spread: number; stem: string; stemR: number; cross?: boolean; vary: number }) {
  const { rng } = c;
  const n = cnt(c, o.n);
  const base = lt(o.tone), st = solid(o.stem);
  for (let i = 0; i < n; i++) {
    const yaw = GOLDEN * i + rng() * 0.4;
    const f = i / n;
    const h = range(c, o.h[0], o.h[1]);
    const lean = o.spread * (0.3 + 0.9 * rng()) * (1 - 0.5 * f);
    const bottom: V3 = [0, 0, 0];
    const topPt = add(mul(outOf(yaw), lean), [0, h, 0]);
    const pts = curve(bottom, topPt, mul(outOf(yaw), lean * 0.15), 4);
    stem(c, pts, o.stemR, o.stemR * 0.6, st, 3);
    const tilt = Math.atan2(lean, h) * 1.2;
    const tone = vary(c, base, o.vary);
    sprig(c, topPt, { tile: o.tile, tone, w: o.w, h: o.len, yaw, lean: tilt, base: 0.12 });
    if (o.cross) sprig(c, topPt, { tile: o.tile, tone, w: o.w, h: o.len, yaw: yaw + Math.PI / 2, lean: tilt, base: 0.12 });
  }
}

/** Branching twigs (dried branches, bare bonsai limbs): recursive, tapering, leaning away. */
export function twigs(c: Ctx, o: { base: V3; len: number; r: number; hex: string; depth: number; yaw: number; elev: number; kids: number; tipCard?: { tile: number; tone: string; size: number } }) {
  const { rng } = c;
  const tone = solid(o.hex);
  const grow = (p: V3, yaw: number, elev: number, len: number, r: number, depth: number) => {
    const dir: V3 = [Math.cos(elev) * Math.cos(yaw), Math.sin(elev), Math.cos(elev) * Math.sin(yaw)];
    const end = add(p, mul(dir, len));
    const mid = add(add(mul(add(p, end), 0.5), mul(outOf(yaw + 1.6), len * 0.08 * (rng() - 0.5))), [0, len * 0.04, 0]);
    stem(c, [p, mid, end], r, r * 0.55, tone, 3);
    if (depth <= 0) {
      if (o.tipCard) sprig(c, end, { tile: o.tipCard.tile, tone: lt(o.tipCard.tone), w: o.tipCard.size * 0.4, h: o.tipCard.size, yaw: yaw + 1.5, lean: 0.5, base: 0.1 });
      return;
    }
    const kids = o.kids + (c.level >= 2 ? 1 : 0);
    for (let k = 0; k < kids; k++) {
      const [q] = along([p, mid, end], 0.55 + 0.4 * (k / kids));
      grow(q, yaw + (k % 2 ? -1 : 1) * (0.5 + 0.8 * rng()), Math.max(0.2, elev + (rng() - 0.5) * 0.7), len * (0.62 + 0.15 * rng()), r * 0.55, depth - 1);
    }
  };
  grow(o.base, o.yaw, o.elev, o.len, o.r, o.depth);
}
