// Fitting a prepared city (lib/siteCityBuild.ts, site metres) to the plan: each building is lifted onto the ground where it stands, the plan's own building is left
// out (the plan draws the flat), the Cut-away data is filled in, and the road ribbons are draped. Plan axes come from `env.toPlan` (lib/geo.ts siteToPlan); the
// result is in SITE axes, because the scene turns and moves the whole city with one group transform (rotation = bearing, position = the plan axes of the site's centre).
// Pure; the node test runner loads this file directly: imports carry a .ts extension or are type-only.
import { polygonBounds, type Rect } from "./siteGeom.ts";
import type { CityBuilding, CityPrepared } from "./siteCityBuild.ts";
import { CUT_STRIDE, bearingOf, cutKeep, rectCentre, ringRectDistance } from "./siteMeshCut.ts";
import { rectDistance, terrainBlend, type GroundFn } from "./siteMeshGround.ts";
import { HOST_MARGIN_M } from "./siteMeshPlan.ts";
import type { XY } from "./siteTypes.ts";

/** Roads lie this far above the ground at the plan, and this far above it at distance (the sloping ground there needs more room): the OpenStreetMap roads' values (SiteFlat). */
export const ROAD_LIFT = 0.008;
export const ROAD_LIFT_FAR = 0.04;
/** Buildings this close to the plan cast sun shadows (the garden's shadow frustum is ~32 m wide); farther ones only receive them (SiteBuildings SHADOW_M). */
export const SHADOW_M = 46;
const ROOF_Y = 0.5;
const SAMPLE_MAX = 40;

export type PlaceEnv = {
  toPlan: (p: XY) => XY;
  ground: GroundFn;
  /** everything the plan occupies, plan axes (lib/siteMesh.ts planFootprint) */
  footprint: Rect | null;
  /** points no drawn building may hold: the plan's home point(s), plan axes */
  homes: readonly XY[];
  /** the point the shadow range is measured from, plan axes */
  at: XY;
};

export type PlacedBuildings = {
  /** `CityPrepared.pos` with every building's heights lifted onto the ground */
  pos: Float32Array;
  /** Cut-away data per vertex (CUT_STRIDE floats): height scale at full cut, ground height, 0, bearing from the plan's centre (radians) */
  cut: Float32Array;
  /** triangles of the buildings near the plan (they cast shadows) and of the rest; the plan's own building is in neither */
  near: Uint32Array;
  far: Uint32Array;
  /** buildings left out because the plan stands on them */
  hosts: number;
};

const inTriangle = (p: XY, a: XY, b: XY, c: XY): boolean => {
  const s = (o: XY, q: XY, r: XY) => (q[0] - o[0]) * (r[1] - o[1]) - (q[1] - o[1]) * (r[0] - o[0]);
  const d1 = s(p, a, b);
  const d2 = s(p, b, c);
  const d3 = s(p, c, a);
  return !((d1 < 0 || d2 < 0 || d3 < 0) && (d1 > 0 || d2 > 0 || d3 > 0));
};

/** The building's roof triangles in plan axes: its footprint, however it is shaped. */
function roofOf(c: CityPrepared, b: CityBuilding, toPlan: (p: XY) => XY): [XY, XY, XY][] {
  const out: [XY, XY, XY][] = [];
  for (let t = b.i0; t < b.i1; t += 3) {
    const [a, q, r] = [c.idx[t], c.idx[t + 1], c.idx[t + 2]];
    if (c.nrm[a * 3 + 1] < ROOF_Y) continue;
    out.push([toPlan([c.pos[a * 3], c.pos[a * 3 + 2]]), toPlan([c.pos[q * 3], c.pos[q * 3 + 2]]), toPlan([c.pos[r * 3], c.pos[r * 3 + 2]])]);
  }
  return out;
}

/** Does this building hold a home point or touch the plan's footprint (plus HOST_MARGIN_M)? Same rule as the OpenStreetMap layer (lib/siteMeshPlan.ts isHostBuilding), on triangles. */
function isHost(c: CityPrepared, b: CityBuilding, env: PlaceEnv): boolean {
  const m = HOST_MARGIN_M;
  const near = env.footprint && { x0: env.footprint.x0 - m, y0: env.footprint.y0 - m, x1: env.footprint.x1 + m, y1: env.footprint.y1 + m };
  const box = polygonBounds([env.toPlan([b.x0, b.y0]), env.toPlan([b.x1, b.y0]), env.toPlan([b.x1, b.y1]), env.toPlan([b.x0, b.y1])]);
  const touches = near && box.x1 >= near.x0 && box.x0 <= near.x1 && box.y1 >= near.y0 && box.y0 <= near.y1;
  const homes = env.homes.filter((h) => h[0] >= box.x0 && h[0] <= box.x1 && h[1] >= box.y0 && h[1] <= box.y1);
  if (!touches && !homes.length) return false;
  const roof = roofOf(c, b, env.toPlan);
  const holds = (p: XY) => roof.some(([a, q, r]) => inTriangle(p, a, q, r));
  if (homes.some(holds)) return true;
  if (!near || !touches) return false;
  if (roof.some((tri) => tri.some((p) => p[0] >= near.x0 && p[0] <= near.x1 && p[1] >= near.y0 && p[1] <= near.y1))) return true;
  // a roof that swallows the rectangle without a corner inside it: look at a grid of points over the rectangle
  const sx = Math.max(1, (near.x1 - near.x0) / SAMPLE_MAX);
  const sy = Math.max(1, (near.y1 - near.y0) / SAMPLE_MAX);
  for (let x = near.x0; x <= near.x1; x += sx) for (let y = near.y0; y <= near.y1; y += sy) if (holds([x, y])) return true;
  return false;
}

/** Lift the buildings onto the ground, leave out the plan's own, and fill in the Cut-away attribute. */
export function placeBuildings(c: CityPrepared, env: PlaceEnv): PlacedBuildings {
  const pos = c.pos.slice();
  const cut = new Float32Array((c.pos.length / 3) * CUT_STRIDE);
  const near: number[] = [];
  const far: number[] = [];
  let hosts = 0;
  for (const b of c.buildings) {
    if (isHost(c, b, env)) {
      hosts++;
      continue;
    }
    const [px, pz] = env.toPlan([(b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2]);
    const lift = env.ground(px, pz);
    const distance = env.footprint ? ringRectDistance([env.toPlan([b.x0, b.y0]), env.toPlan([b.x1, b.y0]), env.toPlan([b.x1, b.y1]), env.toPlan([b.x0, b.y1])], env.footprint) : Infinity;
    const keep = cutKeep(distance, b.h);
    const bearing = env.footprint ? bearingOf(rectCentre(env.footprint), [px, pz]) : 0;
    for (let v = b.v0; v < b.v1; v++) {
      pos[v * 3 + 1] += lift;
      cut[v * CUT_STRIDE] = keep;
      cut[v * CUT_STRIDE + 1] = lift;
      cut[v * CUT_STRIDE + 3] = bearing;
    }
    const list = Math.hypot(px - env.at[0], pz - env.at[1]) <= SHADOW_M ? near : far;
    for (let t = b.i0; t < b.i1; t++) list.push(c.idx[t]);
  }
  return { pos, cut, near: Uint32Array.from(near), far: Uint32Array.from(far), hosts };
}

/** The road ribbons with every vertex on the ground (plus a lift that keeps them under the garden's own paths near the plan, clear of the sloping ground far from it). */
export function placeRoads(c: CityPrepared, env: PlaceEnv, home: Rect): Float32Array {
  const pos = c.roads.pos.slice();
  for (let v = 0; v < pos.length; v += 3) {
    const [px, pz] = env.toPlan([pos[v], pos[v + 2]]);
    pos[v + 1] = env.ground(px, pz) + ROAD_LIFT + (ROAD_LIFT_FAR - ROAD_LIFT) * terrainBlend(rectDistance(px, pz, home));
  }
  return pos;
}
