import { KIND, TILE, add, card, frame, mul } from "./vegBuilder.ts";
import { ball, blades, fronds, petioled, vines, type BladeO } from "./vegPlantFamilies.ts";
import { ribbed, spikes, twigs } from "./vegPlantFamilies2.ts";
import { GOLDEN, UP, along, cnt, curve, fresh, init, leafAt, lt, outOf, range, solid, sprig, stem, vary, type Ctx } from "./vegPlantKit.ts";
import { lerp, type V3 } from "./mathUtil.ts";
import { PLANT_TILE as P } from "./vegPlantTiles.ts";

/** The one-off plants of lib/vegPlants.ts: cane heads, succulents, orchid, bonsai, dried and cut stems, wall panels, baskets, terrarium, topiary. */

/** a card lying flat, facing up */
function flat(c: Ctx, p: V3, size: number, yaw: number, tile: number, tone: V3, base = 0.15) {
  card(c.m, p, mul(outOf(yaw), size / 2), mul(outOf(yaw + Math.PI / 2), size / 2), UP, { tile, tone, kind: KIND.house, r: c.rng(), slot: 0, base });
}

/** Woody canes, each topped with a head of blades (yucca, dracaena). */
export function canes(c: Ctx, o: { canes: number; h: [number, number]; r: number; hex: string; head: Omit<BladeO, "spread" | "vary" | "origin" | "tall">; lean: number }) {
  const { rng } = c;
  init(c.m, o.h[1] + o.head.len[1], 0.4);
  for (let k = 0; k < o.canes; k++) {
    const yaw = k * 2.1 + rng();
    const h = lerp(o.h[0], o.h[1], o.canes > 1 ? k / (o.canes - 1) : 1);
    const base = mul(outOf(yaw), 0.03);
    const top = add(base, add(mul(outOf(yaw), o.lean * h), [0, h, 0]));
    stem(c, curve(base, top, mul(outOf(yaw + 1.2), 0.03), 5), o.r, o.r * 0.8, solid(o.hex), 6);
    blades(c, { ...o.head, n: Math.round(o.head.n * (1 - 0.12 * k)), origin: top, spread: 0.012, vary: 0.1, tall: 0.2 });
  }
}

/** One rosette: a flat card at the bottom and three cupped rings of fat leaves. */
function rosetteAt(c: Ctx, p: V3, R: number, hex: string) {
  const { rng } = c;
  const tone = lt(hex);
  flat(c, add(p, [0, 0.003, 0]), R * 2.2, rng() * 6, P.rosette, tone, 0.3);
  const rings: [number, number, number, number][] = [[9, 0.7, 1.1, 0.42], [6, 1.0, 0.85, 0.38], [4, 1.3, 0.6, 0.34]];
  for (const [n, elev, len, wid] of rings) {
    const k = Math.max(3, cnt(c, n));
    for (let i = 0; i < k; i++) {
      leafAt(c, p, { tile: P.fat, tone: fresh(vary(c, tone, 0.08), elev * 0.4), len: R * len, wid: R * len * wid * 1.5, yaw: (i / k) * Math.PI * 2 + rng() * 0.3, elev, droop: 0.3, segs: 2, base: 0.3 });
    }
  }
}

export function succulents(c: Ctx) {
  init(c.m, 0.12, 0.16);
  rosetteAt(c, [-0.1, 0.0, 0], 0.045, "#7aa58a");
  rosetteAt(c, [0.0, 0.0, 0.005], 0.055, "#8fb08a");
  rosetteAt(c, [0.1, 0.0, -0.005], 0.04, "#a89a9a");
}

export function barrel(c: Ctx, o: { H: number; R: number; ribs: number; tone: string; spines: { tile: number; tone: string; size: number } }) {
  const N = 7;
  init(c.m, o.H, o.R);
  const pts = Array.from({ length: N }, (_, i) => [0, (o.H * i) / (N - 1), 0] as V3);
  const radii = pts.map((_, i) => o.R * Math.sqrt(Math.max(0.05, 1 - Math.pow((i / (N - 1) - 0.45) / 0.55, 2))));
  ribbed(c, pts, radii, { ribs: o.ribs, depth: 0.16, tone: o.tone, spines: { ...o.spines, every: 1 } });
}

export function orchid(c: Ctx) {
  const { rng } = c;
  init(c.m, 0.55, 0.18);
  const leaf = lt("#3a7a38");
  for (let i = 0; i < 5; i++) {
    leafAt(c, [0, 0.03, 0], { tile: P.ficus, tone: vary(c, leaf, 0.1), len: 0.2, wid: 0.09, yaw: i * 1.26 + rng() * 0.3 + 0.4, elev: 0.55, droop: 0.9, twist: (rng() - 0.5) * 0.4, base: 0.3 });
  }
  const pts = curve([0, 0.05, 0], [0.07, 0.46, 0], [-0.04, 0.05, 0], 6);
  stem(c, pts, 0.003, 0.0018, solid("#6a7a4a"), 4);
  const bloom = lt("#f2d6e6", 0.75);
  const [p0] = along(pts, 0.35);
  for (const yaw of [0, Math.PI / 2]) sprig(c, p0, { tile: P.orchid, tone: bloom, w: 0.22, h: 0.3, yaw, lean: 0.12, base: 0.05 });
  const [p1] = along(pts, 0.5);
  sprig(c, add(p1, [0.02, 0, 0]), { tile: P.orchid, tone: bloom, w: 0.16, h: 0.22, yaw: Math.PI / 4, lean: 0.2, base: 0.05 });
}

export function bonsai(c: Ctx) {
  const { rng } = c;
  init(c.m, 0.35, 0.2);
  flat(c, [0, 0.004, 0], 0.32, 0.3, P.moss, lt("#4f7a38"), 0.2);
  const trunk: V3[] = [[0, 0, 0], [0.025, 0.04, 0], [-0.02, 0.09, 0.01], [0.02, 0.145, 0], [0.0, 0.2, 0.005]];
  stem(c, trunk, 0.022, 0.009, solid("#5a4636"), 6);
  const centres: V3[] = [[-0.11, 0.22, 0.01], [0.11, 0.25, 0.03], [0.0, 0.31, -0.02], [0.04, 0.2, 0.1]];
  centres.forEach((p, i) => {
    twigs(c, { base: trunk[2 + (i % 3)], len: 0.1, r: 0.005, hex: "#5a4636", depth: 0, yaw: Math.atan2(p[2], p[0]), elev: 0.7, kids: 0 });
    const tone = lt("#3f7a3a");
    const size = 0.17 - 0.01 * i;
    flat(c, p, size, rng() * 6, P.bonsai, vary(c, tone, 0.1), 0.25);
    flat(c, add(p, [0, -0.022, 0]), size * 0.85, rng() * 6, P.bonsai, vary(c, tone, 0.1), 0.3);
    for (const yaw of [0.3, 1.9]) sprig(c, add(p, [0, -0.04, 0]), { tile: P.bonsai, tone: fresh(tone, 0.3), w: size * 0.9, h: size * 0.6, yaw, lean: 0, base: 0.3 });
    if (c.level >= 2) flat(c, add(p, [0, 0.02, 0]), size * 0.6, rng() * 6, P.bonsai, fresh(tone, 0.6), 0.1);
  });
}

export function pampas(c: Ctx) {
  init(c.m, 1.0, 0.22);
  blades(c, { n: 12, tile: TILE.blade, tone: "#c0b080", len: [0.35, 0.6], wid: [0.025, 0.03], spread: 0.03, elev: [1.1, 1.45], droop: 0.5, vary: 0.1, tall: 0 });
  spikes(c, { n: 6, tile: P.pampas, tone: "#ecdcc0", w: 0.2, len: 0.4, h: [0.5, 0.62], spread: 0.1, stem: "#c8b890", stemR: 0.003, cross: true, vary: 0.06 });
}

export function dried(c: Ctx) {
  const { rng } = c;
  init(c.m, 1.1, 0.25);
  for (let k = 0; k < 5; k++) {
    twigs(c, { base: [0, 0, 0], len: 0.4 + 0.1 * rng(), r: 0.0055, hex: "#8a7556", depth: 2, yaw: k * GOLDEN + rng() * 0.4, elev: 1.3 - 0.1 * (k % 3), kids: 2, tipCard: { tile: P.dry, tone: "#d8c8a0", size: 0.13 } });
  }
}

export function eucalyptus(c: Ctx) {
  const { rng } = c;
  init(c.m, 0.8, 0.2);
  const tone = lt("#9ab8a6", 1.25);
  for (let k = 0; k < 6; k++) {
    const yaw = k * GOLDEN + 0.5, h = range(c, 0.5, 0.78);
    const tip = add(mul(outOf(yaw), 0.05 + 0.13 * rng()), [0, h, 0]);
    const pts = curve([0, 0, 0], tip, mul(outOf(yaw), 0.03), 4);
    stem(c, pts, 0.003, 0.0018, solid("#8a7a5a"), 3);
    const n = cnt(c, 5);
    for (let j = 0; j < n; j++) {
      const u = 0.35 + (0.65 * (j + rng() * 0.5)) / n;
      const [p] = along(pts, u);
      sprig(c, p, { tile: P.eucalyptus, tone: fresh(vary(c, tone, 0.1), u * 0.3), w: 0.06, h: 0.17 - 0.05 * u, yaw: yaw + (j % 2 ? 1 : -1) * (0.8 + rng() * 0.5), lean: 0.5 + 0.4 * rng(), base: 0.15 });
    }
    sprig(c, tip, { tile: P.eucalyptus, tone, w: 0.05, h: 0.12, yaw, lean: 0.1, base: 0.1 });
  }
}

/** A flat wall panel of leaves on a dark mat: jittered grid, each card a little proud of the mat. */
export function panel(c: Ctx, o: { w: number; h: number; depth: number; n: number; tile: number; tone: string; back: string; size: number; vary: number }) {
  const { m, rng } = c;
  init(m, o.h, o.w / 2);
  card(m, [0, o.h / 2, -o.depth * 0.45], [o.w / 2, 0, 0], [0, o.h / 2, 0], [0, 0, 1], { tile: TILE.white, tone: solid(o.back), kind: KIND.house, r: 0, slot: 0, base: 0 });
  const base = lt(o.tone);
  const n = cnt(c, o.n);
  const cols = Math.max(2, Math.round(Math.sqrt((n * o.w) / o.h))), rows = Math.max(2, Math.ceil(n / cols));
  for (let i = 0; i < cols * rows; i++) {
    const x = ((i % cols) + 0.1 + 0.8 * rng()) / cols, y = (Math.floor(i / cols) + 0.1 + 0.8 * rng()) / rows;
    const nrm = [(rng() - 0.5) * 0.5, (rng() - 0.5) * 0.5, 1] as V3;
    const nn = mul(nrm, 1 / Math.hypot(...nrm));
    const [right, up] = frame(nn, rng() * 6.283);
    const size = o.size * (0.85 + 0.5 * rng());
    const p: V3 = [(x - 0.5) * (o.w - size * 0.7), size * 0.35 + y * (o.h - size * 0.7), -o.depth * 0.3 + rng() * o.depth];
    card(m, p, mul(right, size / 2), mul(up, size / 2), nn, { tile: o.tile, tone: fresh(vary(c, base, o.vary), rng() * 0.5), kind: KIND.house, r: rng(), slot: 0, base: 0.3 });
  }
}

export function hangingBasket(c: Ctx) {
  init(c.m, 0.55, 0.22);
  fronds(c, { n: 8, tile: P.fern, tone: "#3f8a3a", origin: [0, 0.28, 0], len: [0.2, 0.28], wid: 0.14, elev: [0.7, 1.2], arch: 0.7, bare: 0, stem: "#5a7a3a", stemR: 0.002, vary: 0.12 });
  vines(c, { n: 7, origin: [0, 0.3, 0], spread: 0.09, reach: [0.04, 0.12], drop: [0.22, 0.3], arc: 0.03, vine: { tile: P.vine, tone: "#3a7a3a", w: 0.12 }, leaf: { tile: P.heart, tone: "#3f8040", len: [0.06, 0.09], n: 20, vary: 0.14 }, stem: "#5a7a3a" });
}

export function terrarium(c: Ctx) {
  const { rng } = c;
  init(c.m, 0.22, 0.1);
  flat(c, [0, 0.004, 0], 0.2, rng() * 6, P.moss, lt("#4f7a38"), 0.2);
  for (const [x, z] of [[-0.05, 0.02], [0.04, -0.04], [0.05, 0.05]]) {
    fronds(c, { n: 3, tile: P.fern, tone: "#3f8a3a", origin: [x, 0.008, z], len: [0.1, 0.16], wid: 0.06, elev: [1.0, 1.4], arch: 0.6, bare: 0, stem: "#5a7a3a", stemR: 0.0012, vary: 0.12 });
  }
  rosetteAt(c, [-0.03, 0.006, -0.05], 0.03, "#7aa58a");
  petioled(c, { n: 4, tile: P.pilea, tone: "#4f8f3f", origin: [0.0, 0.006, 0.0], stem: "#7a9a5a", stemR: 0.0012, rise: [0.03, 0.08], reach: [0.04, 0.02], len: [0.03, 0.05], ratio: 1, elev: [0.5, 1.0], droop: 0.2, vary: 0.1, twist: 0.3 });
}

export function topiary(c: Ctx) {
  init(c.m, 0.85, 0.2);
  stem(c, curve([0, 0, 0], [0.01, 0.5, 0], [0.012, 0, 0], 4), 0.013, 0.011, solid("#6a5a45"), 5);
  ball(c, { centre: [0, 0.65, 0], radius: 0.2, n: 80, tile: P.boxwood, tone: "#3d7a38", size: 0.1, vary: 0.12 });
}
