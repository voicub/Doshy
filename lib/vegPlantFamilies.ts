import { KIND, add, blob, card, cross, dot, frame, mul, norm, sphereDirs, sub, tileRect } from "./vegBuilder.ts";
import { GOLDEN, along, cnt, curve, dirOf, fresh, init, leafAt, lt, outOf, range, solid, stem, vary, type Ctx } from "./vegPlantKit.ts";
import { lerp, type V3 } from "./mathUtil.ts";

/**
 * The plant families the houseplant species are made from (lib/vegPlants.ts only picks parameters): a trunk with leaves along it, a clump of blades, leaves on
 * petioles, pinnate fronds, trailing vines, a leafy ball. Cacti, flower sprays and the odd ones are in lib/vegPlantFamilies2.ts.
 */

// ---------------------------------------------------------------- a trunk with leaves along it (fig, rubber plant, ficus, olive)

type TreeO = {
  H: number;
  R: number;
  trunkR: number;
  bark: string;
  lean: number;
  /** sideways wobble of the trunk (share of the height) */
  wob: number;
  leaf: { tile: number; tone: string; len: [number, number]; ratio: number; vary: number; droop: number; twist: number; fresh: number };
  n: number;
  /** share of the height where the first leaf grows */
  from: number;
  /** elevation of the lowest and of the highest leaves */
  elev: [number, number];
  branches?: { n: number; at: [number, number]; len: number; up: number; rad: number };
  /** leaf clusters (cards of many small leaves) round the branch tips and the top, for plants with tiny leaves */
  crowns?: { tile: number; tone: string; r: V3; size: number; n: number; vary: number };
};

export function tree(c: Ctx, o: TreeO) {
  const { m, rng } = c;
  init(m, o.H, o.R);
  const top: V3 = [(rng() - 0.5) * 2 * o.lean * o.H, o.H * 0.98, (rng() - 0.5) * 2 * o.lean * o.H];
  const wob: V3 = [(rng() - 0.5) * o.wob * o.H, 0, (rng() - 0.5) * o.wob * o.H];
  const trunk = curve([0, 0, 0], top, wob, 7);
  stem(c, trunk, o.trunkR, o.trunkR * 0.4, solid(o.bark));
  const axes: { pts: V3[]; from: number; share: number }[] = [];
  const nb = o.branches?.n ?? 0;
  if (o.branches) {
    for (let i = 0; i < nb; i++) {
      const [p0] = along(trunk, lerp(o.branches.at[0], o.branches.at[1], (i + rng() * 0.5) / nb));
      const yaw = GOLDEN * i + rng();
      const tip = add(p0, mul(dirOf(yaw, o.branches.up), o.branches.len * (0.75 + 0.5 * rng())));
      const pts = curve(p0, tip, [0, o.branches.len * 0.18, 0], 4);
      stem(c, pts, o.branches.rad, o.branches.rad * 0.3, solid(o.bark), 4);
      axes.push({ pts, from: 0.3, share: 1.4 });
    }
  }
  axes.push({ pts: trunk, from: o.from, share: nb ? 2.4 : 1 });
  const total = axes.reduce((s, a) => s + a.share, 0);
  const n = o.n ? cnt(c, o.n) : 0;
  const base = lt(o.leaf.tone);
  axes.forEach((ax, ai) => {
    const k = Math.max(o.n ? 2 : 0, Math.round((n * ax.share) / total));
    for (let j = 0; j < k; j++) {
      const u = ax.from + ((1 - ax.from) * (j + 0.3 + rng() * 0.6)) / k;
      const [p] = along(ax.pts, u);
      const yaw = GOLDEN * (j + ai * 5) + rng() * 0.5;
      const len = range(c, o.leaf.len[0], o.leaf.len[1]) * (1.12 - 0.3 * u);
      const out = outOf(yaw);
      leafAt(c, add(p, mul(out, o.trunkR * 0.6)), {
        tile: o.leaf.tile, tone: fresh(vary(c, base, o.leaf.vary), u * u * o.leaf.fresh), len, wid: len * o.leaf.ratio, yaw,
        elev: lerp(o.elev[0], o.elev[1], u) + (rng() - 0.5) * 0.3, droop: o.leaf.droop * (1.2 - u), twist: (rng() - 0.5) * 2 * o.leaf.twist,
      });
    }
  });
  const { crowns } = o;
  if (crowns) {
    const tips: V3[] = [top, ...axes.slice(0, nb).map((a) => a.pts[a.pts.length - 1])];
    const cb = lt(crowns.tone);
    const per = Math.max(3, Math.round(cnt(c, crowns.n) / tips.length));
    tips.forEach((tip, ti) => {
      const r = ti === 0 ? crowns.r : mul(crowns.r, 0.85);
      for (const d of sphereDirs(per, rng)) {
        const k = 0.5 + 0.5 * rng();
        const p = add(tip, [d[0] * r[0] * k, d[1] * r[1] * k + r[1] * 0.35, d[2] * r[2] * k]);
        const size = crowns.size * (0.8 + 0.4 * rng());
        const [right, up] = frame(d, rng() * 6.283);
        card(m, p, mul(right, size / 2), mul(up, size / 2), norm(add(d, [0, 0.5, 0])), { tile: crowns.tile, tone: fresh(vary(c, cb, crowns.vary), Math.max(0, d[1]) * 0.5), kind: KIND.house, r: rng(), slot: 0, base: 0.3 });
      }
    });
  }
}

// ---------------------------------------------------------------- a clump of blades (snake plant, yucca, aloe, spider plant, dracaena)

export type BladeO = {
  n: number;
  tile: number;
  tone: string;
  origin?: V3;
  len: [number, number];
  wid: [number, number];
  /** radius the blades start at */
  spread: number;
  /** elevation of the outer and of the inner blades */
  elev: [number, number];
  droop: number;
  vary: number;
  twist?: number;
  /** inner blades are taller (aloe, yucca) rather than random */
  tall?: number;
};

export function blades(c: Ctx, o: BladeO) {
  const { rng } = c;
  const o0 = o.origin ?? [0, 0, 0];
  const n = cnt(c, o.n);
  const base = lt(o.tone);
  for (let i = 0; i < n; i++) {
    const f = n > 1 ? i / (n - 1) : 0.5;
    const yaw = GOLDEN * i + rng() * 0.3;
    const tallness = (o.tall ?? 0) * f + (1 - (o.tall ?? 0)) * rng();
    const len = lerp(o.len[0], o.len[1], tallness);
    const r = o.spread * (1 - 0.7 * f) * (0.5 + 0.5 * rng());
    leafAt(c, add(o0, mul(outOf(yaw), r)), {
      tile: o.tile, tone: fresh(vary(c, base, o.vary), f * 0.5), len, wid: lerp(o.wid[0], o.wid[1], rng()), yaw,
      elev: lerp(o.elev[0], o.elev[1], f) + (rng() - 0.5) * 0.18, droop: o.droop * (1.3 - f), twist: (rng() - 0.5) * (o.twist ?? 0.4), base: 0.3,
    });
  }
}

// ---------------------------------------------------------------- leaves on petioles (monstera, philodendron, calathea, pilea, fan palm)

type PetioleO = {
  n: number;
  tile: number;
  tone: string;
  origin?: V3;
  stem: string;
  stemR: number;
  /** height of the leaf attachment: outer / inner leaves */
  rise: [number, number];
  /** horizontal reach of the petiole: outer / inner */
  reach: [number, number];
  len: [number, number];
  ratio: number;
  /** elevation of the leaf blade */
  elev: [number, number];
  droop: number;
  vary: number;
  twist: number;
};

export function petioled(c: Ctx, o: PetioleO) {
  const { rng } = c;
  const o0 = o.origin ?? [0, 0, 0];
  const n = cnt(c, o.n);
  const base = lt(o.tone);
  const stemTone = solid(o.stem);
  for (let i = 0; i < n; i++) {
    const f = n > 1 ? i / (n - 1) : 0.5;
    const yaw = GOLDEN * i + rng() * 0.4;
    const out = outOf(yaw);
    const reach = lerp(o.reach[0], o.reach[1], f) * (0.75 + 0.5 * rng());
    const rise = lerp(o.rise[0], o.rise[1], f) * (0.8 + 0.4 * rng());
    const b0 = add(o0, mul(out, 0.02));
    const tip = add(add(b0, mul(out, reach)), [0, rise, 0]);
    const pts = curve(b0, tip, add(mul(out, -reach * 0.12), [0, rise * 0.14, 0]), 3);
    stem(c, pts, o.stemR, o.stemR * 0.7, stemTone, 4);
    const len = lerp(o.len[0], o.len[1], (1 - 0.45 * f) * (0.65 + 0.35 * rng()));
    leafAt(c, tip, {
      tile: o.tile, tone: fresh(vary(c, base, o.vary), f * f), len, wid: len * o.ratio, yaw: yaw + (rng() - 0.5) * 0.5,
      elev: lerp(o.elev[0], o.elev[1], f) + (rng() - 0.5) * 0.25, droop: o.droop, twist: (rng() - 0.5) * 2 * o.twist,
    });
  }
}

// ---------------------------------------------------------------- pinnate fronds (palms, ferns, ZZ plant)

type FrondO = {
  n: number;
  tile: number;
  tone: string;
  origin?: V3;
  len: [number, number];
  wid: number;
  /** elevation at the base of the outermost and of the innermost fronds */
  elev: [number, number];
  /** radians of bend over the length of a frond */
  arch: number;
  /** share of the length that is a bare stalk */
  bare: number;
  stem: string;
  stemR: number;
  vary: number;
  /** the crown stands on a cane of this height (palms): fronds start at the top of it */
  cane?: { h: number; r: number; lean: number; hex: string };
};

export function fronds(c: Ctx, o: FrondO) {
  const { m, rng } = c;
  let o0 = o.origin ?? [0, 0, 0];
  if (o.cane) {
    const top: V3 = add(o0, [o.cane.lean * (rng() - 0.5) * 2, o.cane.h, o.cane.lean * (rng() - 0.5) * 2]);
    stem(c, curve(o0, top, [o.cane.lean * 0.3, 0, 0], 5), o.cane.r, o.cane.r * 0.8, solid(o.cane.hex), 6);
    o0 = top;
  }
  m.flex = 0;
  const n = cnt(c, o.n);
  const base = lt(o.tone);
  const stemTone = solid(o.stem);
  const N = c.level >= 2 ? 7 : 5;
  const nb = Math.max(1, Math.round(o.bare * N));
  for (let i = 0; i < n; i++) {
    const f = n > 1 ? i / (n - 1) : 0.5;
    const yaw = GOLDEN * i + rng() * 0.3;
    const out = outOf(yaw);
    const len = lerp(o.len[0], o.len[1], 0.4 + 0.6 * (1 - f)) * (0.85 + 0.3 * rng());
    let e = lerp(o.elev[0], o.elev[1], f) + (rng() - 0.5) * 0.2;
    const pts: V3[] = [add(o0, mul(out, 0.015))];
    for (let s = 0; s < N; s++) {
      e = lerp(o.elev[0], o.elev[1], f) - o.arch * ((s + 0.5) / N) + (rng() - 0.5) * 0.02;
      pts.push(add(pts[s], mul(dirOf(yaw, e), len / N)));
    }
    if (o.bare > 0) stem(c, pts.slice(0, nb + 1), o.stemR, o.stemR * 0.7, stemTone, 4);
    const leafPts = pts.slice(o.bare > 0 ? nb : 0);
    const side: V3 = [Math.sin(yaw), 0, -Math.cos(yaw)];
    const dir = norm(sub(leafPts[leafPts.length - 1], leafPts[0]));
    let nrm = norm(cross(side, dir));
    if (nrm[1] < 0) nrm = mul(nrm, -1);
    const tone = fresh(vary(c, base, o.vary), f * 0.6);
    const [u0, v0, u1, v1] = tileRect(o.tile);
    // a curved frond: a ribbon whose width tapers softly at both ends so the card edges never show as a rectangle
    const rows = leafPts.map((p, k) => {
      const t = k / (leafPts.length - 1);
      const w = o.wid * (0.55 + 0.45 * Math.sin(Math.PI * Math.min(1, 0.12 + 0.88 * t)));
      const shade = 1 - 0.22 * (1 - t);
      const tn: V3 = [tone[0] * shade, tone[1] * shade, tone[2] * shade];
      const a = m.vert(sub(p, mul(side, w / 2)), nrm, [u0, v0 + (v1 - v0) * t], tn, KIND.house, rng(), 0, leafPts[0], 0);
      const b = m.vert(add(p, mul(side, w / 2)), nrm, [u1, v0 + (v1 - v0) * t], tn, KIND.house, rng(), 0, leafPts[0], 0);
      return [a, b];
    });
    for (let k = 0; k < rows.length - 1; k++) {
      m.tri(rows[k][0], rows[k][1], rows[k + 1][1]);
      m.tri(rows[k][0], rows[k + 1][1], rows[k + 1][0]);
    }
  }
}

// ---------------------------------------------------------------- trailing vines (pothos, ivy, hanging baskets)

type VineO = {
  n: number;
  /** where the vines come from: the pot rim */
  origin: V3;
  spread: number;
  /** horizontal sag away from the pot and the length hanging down */
  reach: [number, number];
  drop: [number, number];
  arc: number;
  vine: { tile: number; tone: string; w: number };
  leaf: { tile: number; tone: string; len: [number, number]; n: number; vary: number };
  stem: string;
};

export function vines(c: Ctx, o: VineO) {
  const { m, rng } = c;
  const nv = cnt(c, o.n);
  const vtone = lt(o.vine.tone), ltone = lt(o.leaf.tone);
  const stemTone = solid(o.stem);
  const leaves = cnt(c, o.leaf.n);
  const [u0, v0, u1, v1] = tileRect(o.vine.tile);
  for (let i = 0; i < nv; i++) {
    const yaw = GOLDEN * i + rng() * 0.4;
    const out = outOf(yaw);
    const start = add(o.origin, mul(out, o.spread * rng()));
    const reach = range(c, o.reach[0], o.reach[1]), drop = range(c, o.drop[0], o.drop[1]);
    const end = add(add(start, mul(out, reach)), [0, -drop, 0]);
    const pts = curve(start, end, [0, o.arc, 0], 7);
    stem(c, pts, 0.0035, 0.0018, stemTone, 3);
    const side: V3 = [Math.sin(yaw), 0, -Math.cos(yaw)];
    const tone = vary(c, vtone, 0.15);
    const rows = pts.map((p, k) => {
      const t = k / (pts.length - 1);
      const dir = norm(sub(pts[Math.min(pts.length - 1, k + 1)], pts[Math.max(0, k - 1)]));
      let nrm = norm(cross(side, dir));
      if (dot(nrm, out) < 0) nrm = mul(nrm, -1);
      const w = o.vine.w * (1 - 0.35 * t);
      const tn = fresh(tone, t * 0.5);
      const v = v0 + (v1 - v0) * t; // the tile has the leaf bases at the bottom, so a hanging vine runs from its pot end up the tile and the leaves point down
      return [
        m.vert(sub(p, mul(side, w / 2)), nrm, [u0, v], tn, KIND.house, rng(), 0, pts[0], 0),
        m.vert(add(p, mul(side, w / 2)), nrm, [u1, v], tn, KIND.house, rng(), 0, pts[0], 0),
      ];
    });
    for (let k = 0; k < rows.length - 1; k++) {
      m.tri(rows[k][0], rows[k][1], rows[k + 1][1]);
      m.tri(rows[k][0], rows[k + 1][1], rows[k + 1][0]);
    }
    for (let j = 0; j < Math.round(leaves / nv); j++) {
      const u = (j + 0.5 + rng() * 0.4) / Math.round(leaves / nv);
      const [p] = along(pts, 0.1 + 0.88 * u);
      const len = range(c, o.leaf.len[0], o.leaf.len[1]) * (1 - 0.3 * u);
      leafAt(c, p, {
        tile: o.leaf.tile, tone: fresh(vary(c, ltone, o.leaf.vary), (1 - u) * 0.4), len, wid: len * 0.95, yaw: yaw + (rng() - 0.5) * 2.4,
        elev: -0.9 + (rng() - 0.5) * 0.9, droop: 0.5, twist: (rng() - 0.5) * 0.8, segs: 1,
      });
    }
  }
}



// ---------------------------------------------------------------- a leafy ball (boxwood, topiary)

export function ball(c: Ctx, o: { centre: V3; radius: number; n: number; tile: number; tone: string; size: number; vary: number; core?: string }) {
  const { m, rng } = c;
  const core = mul(solid(o.core ?? o.tone), 0.45);
  blob(m, o.centre, [o.radius * 0.82, o.radius * 0.8, o.radius * 0.82], { detail: 1, bump: 0.05, tone: core, kind: KIND.house, r: 0, slot: 0, seed: 3 });
  const base = lt(o.tone);
  const n = cnt(c, o.n);
  for (const d of sphereDirs(n, rng)) {
    const tone = fresh(vary(c, base, o.vary), Math.max(0, d[1]) * 0.5);
    const r = o.radius * (0.9 + 0.12 * rng());
    const size = o.size * (0.8 + 0.4 * rng());
    const [right, up] = frame(d, rng() * 6.283);
    card(m, add(o.centre, mul(d, r)), mul(right, size / 2), mul(up, size / 2), d, { tile: o.tile, tone, kind: KIND.house, r: rng(), slot: 0, base: 0.35 });
  }
}

