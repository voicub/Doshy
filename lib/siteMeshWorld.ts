// Flat ground cover in plan axes: road and river ribbons, water polygons, and the ground with ponds dug in.
import { pointInShape, polygonCentroid } from "./siteGeom.ts";
import { hexOr, type RGB } from "./siteMeshBase.ts";
import { NO_UV, UP, newBuf, push, clean, triangulate, type Buf } from "./siteMeshBuf.ts";
import type { V3 } from "./mathUtil.ts";
import { insideAny, type GroundFn } from "./siteMeshGround.ts";
import type { RoadKind, SiteArea, SiteRoad, XY } from "./siteTypes.ts";

const ASPHALT: RGB = hexOr("#4b4e53");
const ROAD_STYLE: Record<RoadKind, { color: RGB; width: number }> = {
  motorway: { color: ASPHALT, width: 10 },
  primary: { color: ASPHALT, width: 8 },
  secondary: { color: hexOr("#505358"), width: 7 },
  residential: { color: hexOr("#55585d"), width: 5.5 },
  service: { color: hexOr("#60636a"), width: 3.5 },
  footway: { color: hexOr("#b8b2a4"), width: 1.6 },
  track: { color: hexOr("#8b7355"), width: 3 },
  railway: { color: hexOr("#3c3a3a"), width: 2.8 },
  river: { color: hexOr("#3f7191"), width: 8 },
};
const WATER_RGB: RGB = hexOr("#3d7596");
const MAX_SEGMENT_M = 8; // roads are cut into pieces this long so they follow the ground

/** Points along the polyline no further than MAX_SEGMENT_M apart. */
function resample(pts: readonly XY[]): XY[] {
  const out: XY[] = [];
  for (let i = 0; i < pts.length; i++) {
    out.push(pts[i]);
    const q = pts[i + 1];
    if (!q) break;
    const n = Math.ceil(Math.hypot(q[0] - pts[i][0], q[1] - pts[i][1]) / MAX_SEGMENT_M);
    for (let k = 1; k < n; k++) out.push([pts[i][0] + ((q[0] - pts[i][0]) * k) / n, pts[i][1] + ((q[1] - pts[i][1]) * k) / n]);
  }
  return out;
}

/** A flat ribbon of `width` metres along the polyline (mitred at bends), lying `lift` above the ground. Triangles face up. */
export function addRibbon(out: Buf, pts: readonly XY[], width: number, ground: GroundFn, lift: (x: number, z: number) => number, col: RGB): void {
  const line = resample(dedupeLine(pts));
  if (line.length < 2) return;
  const half = width / 2;
  const sides: [V3, V3][] = line.map((p, i) => {
    const a = line[Math.max(0, i - 1)];
    const b = line[Math.min(line.length - 1, i + 1)];
    let tx = b[0] - a[0];
    let tz = b[1] - a[1];
    const tl = Math.hypot(tx, tz) || 1;
    tx /= tl; tz /= tl;
    const nx = -tz;
    const nz = tx;
    // widen at bends so the edges stay parallel (capped)
    const prev = i > 0 ? line[i - 1] : null;
    const next = line[i + 1] ?? null;
    let miter = 1;
    if (prev && next) {
      const d1 = [p[0] - prev[0], p[1] - prev[1]];
      const d2 = [next[0] - p[0], next[1] - p[1]];
      const l1 = Math.hypot(d1[0], d1[1]) || 1;
      const l2 = Math.hypot(d2[0], d2[1]) || 1;
      const dot = (d1[0] / l1) * (d2[0] / l2) + (d1[1] / l1) * (d2[1] / l2);
      miter = 1 / Math.max(0.5, Math.sqrt((1 + dot) / 2));
    }
    const w = half * miter;
    const y = ground(p[0], p[1]) + lift(p[0], p[1]);
    return [[p[0] + nx * w, y, p[1] + nz * w], [p[0] - nx * w, y, p[1] - nz * w]];
  });
  for (let i = 0; i + 1 < sides.length; i++) {
    const [l0, r0] = sides[i];
    const [l1, r1] = sides[i + 1];
    push(out, l0, r0, r1, UP, col, NO_UV, NO_UV, NO_UV);
    push(out, l0, r1, l1, UP, col, NO_UV, NO_UV, NO_UV);
  }
}

function dedupeLine(pts: readonly XY[]): XY[] {
  const out: XY[] = [];
  for (const p of pts) {
    const q = out[out.length - 1];
    if (!q || Math.hypot(p[0] - q[0], p[1] - q[1]) > 0.05) out.push(p);
  }
  return out;
}

/** The road ribbons (not rivers) in plan axes. `lift` keeps them just above the ground (and below the garden's own paths near the plan). */
export function buildRoads(roads: readonly SiteRoad[], toPlan: (p: XY) => XY, ground: GroundFn, lift: (x: number, z: number) => number): Buf {
  const out = newBuf();
  for (const r of roads) {
    if (r.kind === "river") continue;
    addRibbon(out, r.pts.map(toPlan), r.width > 0 ? r.width : ROAD_STYLE[r.kind]?.width ?? 4, ground, lift, ROAD_STYLE[r.kind]?.color ?? ASPHALT);
  }
  return out;
}

/** How far below its surface the ground lies under a pond (m). */
const WATER_BED_M = 0.3;
const WATER_LIFT = 0.015;

type Pond = { ring: XY[]; holes: XY[][]; level: number };

/** Every water area in plan axes with its surface height: the lowest ground under its outline, so the pond never hangs over a slope. */
function pondsOf(areas: readonly SiteArea[], toPlan: (p: XY) => XY, ground: GroundFn): Pond[] {
  const out: Pond[] = [];
  for (const a of areas) {
    const ring = a.kind === "water" ? clean(a.ring.map(toPlan)) : null;
    if (!ring) continue;
    const c = polygonCentroid(ring);
    out.push({ ring, holes: (a.holes ?? []).map((h) => h.map(toPlan)), level: Math.min(ground(c[0], c[1]), ...ring.map((p) => ground(p[0], p[1]))) + WATER_LIFT });
  }
  return out;
}

/** The ground with every pond and lake dug in: inside its outline the ground lies WATER_BED_M below the water, however the real ground slopes there. */
export function carveWater(ground: GroundFn, areas: readonly SiteArea[], toPlan: (p: XY) => XY): GroundFn {
  const ponds = pondsOf(areas, toPlan, ground);
  if (!ponds.length) return ground;
  const inPond = insideAny(ponds);
  return (x, z) => {
    const h = ground(x, z);
    if (!inPond(x, z)) return h;
    const level = ponds.find((p) => pointInShape([x, z], p.ring, p.holes))?.level ?? h;
    return Math.min(h, level - WATER_BED_M);
  };
}

/** Water: flat polygons plus river ribbons, in plan axes. `ground` is the ground before the ponds were dug in (see carveWater). */
export function buildWater(areas: readonly SiteArea[], rivers: readonly SiteRoad[], toPlan: (p: XY) => XY, ground: GroundFn): Buf {
  const out = newBuf();
  for (const p of pondsOf(areas, toPlan, ground)) {
    const { pts, tris } = triangulate(p.ring, p.holes);
    for (const t of tris) push(out, [pts[t[0]][0], p.level, pts[t[0]][1]], [pts[t[1]][0], p.level, pts[t[1]][1]], [pts[t[2]][0], p.level, pts[t[2]][1]], UP, WATER_RGB, NO_UV, NO_UV, NO_UV);
  }
  for (const r of rivers) if (r.kind === "river") addRibbon(out, r.pts.map(toPlan), r.width > 0 ? r.width : 6, ground, () => WATER_LIFT, WATER_RGB);
  return out;
}
