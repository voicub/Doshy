import { add, cross, mul, norm, ribbon, TILE, KIND, type Mesh } from "./vegBuilder.ts";
import type { Rng, V3 } from "./mathUtil.ts";

/**
 * A clump of grass for the denser foliage levels (lawn tufts, ornamental grass, reeds): many thin curved blades fanning out of one crown,
 * each its own tapered ribbon (a solid tile, the point is geometry, not alpha). Upright blades stand taller in the middle, leaning ones arch
 * out and over, so the clump is a filled fountain, never a ring. Per blade: height, lean, twist, palette slot (the season colours),
 * a darker base and lighter tip, now and then a dead straw blade; a few stalks carry a seed head.
 */
type GrassClump = { n: number; h: number; spread: number; w: number; arch: number; tone: V3 };

const UP: V3 = [0, 1, 0];
const GOLDEN = 2.399963;
const STRAW = 0.07; // share of blades that are dead
const BASE_DARK = 0.32; // how much darker the root of a blade is than its tip
const SLOT_SHARE = [0.4, 0.35, 0.25]; // palette slots 0, 1, 2 (the season grass colours)

/** Seed stalks of a clump (average 0.8): a thin arching stalk with an ear of two crossed spindles. */
function seedHeads(m: Mesh, rng: Rng, o: GrassClump) {
  const count = rng() < 0.55 ? (rng() < 0.4 ? 2 : 1) : 0;
  for (let s = 0; s < count; s++) {
    const a = rng() * Math.PI * 2, out: V3 = [Math.cos(a), 0, Math.sin(a)];
    const h = o.h * (1.12 + 0.18 * rng()), reach = o.spread * (0.15 + 0.35 * rng());
    const root = mul(out, o.spread * 0.06);
    const pts: V3[] = [0, 1, 2, 3].map((i) => {
      const t = i / 3;
      return add(root, add(mul(out, reach * t * t), [0, h * (t - 0.12 * t * t * t), 0]));
    });
    const side = norm(cross(UP, out));
    const tone: V3 = [o.tone[0] * 1.35, o.tone[1] * 1.15, o.tone[2] * 0.6];
    const sw = (t: number) => 0.3 + 1.7 * t * t;
    const r = rng();
    ribbon(m, pts, [o.w * 0.36, o.w * 0.3, o.w * 0.25, o.w * 0.2], side, norm(add(mul(out, 0.3), UP)), { tile: TILE.white, tone: dim(tone, 0.8), kind: KIND.grass, r, slot: 1, base: 0.3, swT: sw });
    const top = pts[3], len = o.h * 0.22, ear = o.w * 0.75;
    const dir = norm([out[0] * 0.3, 1, out[2] * 0.3]);
    const earPts: V3[] = [0, 1, 2, 3].map((i) => add(top, mul(dir, (len * i) / 3)));
    for (const turn of [0, Math.PI / 2]) {
      const w2: V3 = [Math.cos(a + turn), 0, Math.sin(a + turn)];
      ribbon(m, earPts, [ear * 0.3, ear, ear * 0.85, ear * 0.05], w2, norm(add(w2, UP)), { tile: TILE.white, tone, kind: KIND.grass, r, slot: 1, base: 0, swT: sw });
    }
  }
}

const dim = (t: V3, k: number): V3 => [t[0] * k, t[1] * k, t[2] * k];

export function grassClump(m: Mesh, rng: Rng, o: GrassClump) {
  for (let i = 0; i < o.n; i++) {
    const a = i * GOLDEN + rng() * 0.4;
    const out: V3 = [Math.cos(a), 0, Math.sin(a)];
    const lean = Math.pow(rng(), 0.65); // 0 stands upright, 1 arches out to the full spread
    const h = o.h * (0.5 + 0.5 * Math.pow(rng(), 0.8)) * (1 - 0.3 * lean);
    const reach = o.spread * (0.12 + 0.88 * lean);
    const droop = 0.1 + 0.6 * lean * o.arch;
    const root = mul(out, o.spread * 0.2 * Math.sqrt(rng()));
    const segs = h > o.h * 0.6 ? 3 : 2;
    const pts: V3[] = Array.from({ length: segs + 1 }, (_, s) => {
      const t = s / segs;
      return add(root, add(mul(out, reach * Math.pow(t, 1.7)), [0, h * (t - droop * t * t * t), 0]));
    });
    const twist = (rng() - 0.5) * 1.4; // each blade faces its own way, so some show their width to the camera and some their edge
    const side0 = norm(cross(UP, out));
    const side = norm(add(mul(side0, Math.cos(twist)), mul(out, Math.sin(twist))));
    const w = o.w * 0.5 * (0.75 + 0.5 * rng());
    const straw = rng() < STRAW;
    const k = straw ? 1.2 : 1 + 0.45 * rng();
    const tone: V3 = straw ? [o.tone[0] * 1.5 * k, o.tone[1] * 1.2 * k, o.tone[2] * 0.7 * k] : dim(o.tone, k);
    const pickSlot = rng();
    const slot = straw ? 1 : pickSlot < SLOT_SHARE[0] ? 0 : pickSlot < SLOT_SHARE[0] + SLOT_SHARE[1] ? 1 : 2;
    const stiff = 0.7 + 0.6 * rng();
    ribbon(m, pts, pts.map((_, s) => w * (1 - 0.92 * Math.pow(s / segs, 1.3))), side, norm(add(mul(out, 0.35), UP)), { tile: TILE.white, tone, kind: KIND.grass, r: rng(), slot, base: BASE_DARK, swT: (t) => (0.25 + 2.2 * t * t) * stiff });
  }
  seedHeads(m, rng, o);
}
