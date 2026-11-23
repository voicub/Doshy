import { Mesh, roundPolyline, type MeshData } from "./carBuilder.ts";
import { frontEnd, rearEnd } from "./carEnds.ts";
import { designFor } from "./carDesign.ts";
import { makeFrame, type Frame } from "./carFrame.ts";
import type { V3 } from "./mathUtil.ts";
import { LAYERS, Surf, mirrored, type Ctx, type Layer, type PlateMount } from "./carSurf.ts";
import { glasshouse, mirrorsAndWipers, openBody, roofFittings, sideTrim } from "./carTrim.ts";
import { archLiner, spokeCount, wheel } from "./carWheels.ts";
import type { CarSpec } from "./cars.ts";

// A car as merged procedural geometry: one mesh per material (paint, glass, chrome, black plastic and rubber, lamps, tail lamps).
// The body is a loft of cross-sections along the length (lib/carFrame.ts), with the wheel arches cut into it; glass, lights and trim
// are patches laid on that surface (lib/carTrim.ts, lib/carEnds.ts); wheels are lathes (lib/carWheels.ts). Pure data, no three.js.

export type Box = { min: V3; max: V3 };
type CarGeo = {
  layers: Record<Layer, MeshData>;
  tris: number;
  body: Box; // the lofted shell alone: its box is the spec footprint and height
  bounds: Box; // everything, including mirrors and wheels
  plates: PlateMount[];
  chargePort?: "l" | "r" | "f";
  exhausts: number;
  spokes: number;
};

const RING_SILL_R = 0.04;
const RING_ROUND = [4, 4, 5, 5];
const RING_ROUND_LOW = [2, 2, 3, 3];

function loft(f: Frame, q: 0 | 1, paint: Mesh): { surf: Surf; body: Box } {
  const zs = f.stations(q);
  const K = q ? RING_ROUND_LOW : RING_ROUND;
  const rows: V3[][] = [];
  let Hn = 0;
  for (const z of zs) {
    const s = f.sec(z);
    const half = roundPolyline(
      [[0, s.yb], [s.xi, s.yb], [s.xi, s.yb + s.n], [s.wb, s.yb + s.n], [s.wm, s.ym], [s.xs, s.ysh], [s.wt, s.yt - s.crown], [s.wt * 0.46, s.yt - s.crown * 0.05], [0, s.yt - s.dip]],
      [0, 0, 0, RING_SILL_R, 0.5, s.rsh, s.rt, 0.2, 0],
      [1, 1, 1, K[0], K[1], K[2], K[3], q ? 2 : 3, 1],
    );
    Hn = half.length;
    const row: V3[] = [];
    for (let j = 0; j < 2 * Hn - 2; j++) {
      const left = j < Hn;
      const [x, y] = half[left ? j : 2 * Hn - 2 - j];
      row.push([(left ? 1 : -1) * x * s.cw, y, z - f.lean(z, y)]);
    }
    rows.push(row);
  }
  const yc = (f.gc + f.roofTop) / 2;
  const base = paint.grid(rows, (p) => [p[0], p[1] - yc, 0], { wrap: true });
  const nor = paint.normals();
  const M = 2 * Hn - 2;
  const N = rows.map((_, i) => rows[0].map((__, j): V3 => [nor[(base + i * M + j) * 3], nor[(base + i * M + j) * 3 + 1], nor[(base + i * M + j) * 3 + 2]]));
  const min: V3 = [Infinity, Infinity, Infinity];
  const max: V3 = [-Infinity, -Infinity, -Infinity];
  for (const r of rows) for (const p of r) for (let k = 0; k < 3; k++) (min[k] = Math.min(min[k], p[k])), (max[k] = Math.max(max[k], p[k]));
  return { surf: new Surf(zs, rows, N, Hn), body: { min, max } };
}

const cache = new Map<string, CarGeo>();

/** Build (or fetch) the geometry of one car. lod 0 is the normal mesh; lod 1 is a decimated one for far-away cars. */
export function buildCar(spec: CarSpec, lod: 0 | 1 = 0): CarGeo {
  const key = `${JSON.stringify(spec)}|${lod}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const f = makeFrame(designFor(spec));
  const m = Object.fromEntries(LAYERS.map((l) => [l, new Mesh()])) as Record<Layer, Mesh>;
  const { surf, body } = loft(f, lod, m.paint);
  const c: Ctx = { f, q: lod, surf, ...m, plates: [], info: { exhausts: 0, spokes: spokeCount(f) } };
  glasshouse(c);
  roofFittings(c);
  mirrorsAndWipers(c);
  sideTrim(c);
  openBody(c);
  frontEnd(c);
  rearEnd(c);
  mirrored(c, () => {
    for (const axle of [f.axleF, f.axleR]) {
      wheel(f, lod, m.black, m.chrome, axle);
      archLiner(f, lod, m.black, axle);
    }
  });
  const layers = Object.fromEntries(LAYERS.map((l) => [l, m[l].data()])) as Record<Layer, MeshData>;
  const min: V3 = [Infinity, Infinity, Infinity];
  const max: V3 = [-Infinity, -Infinity, -Infinity];
  let tris = 0;
  for (const l of LAYERS) {
    const { pos, idx } = layers[l];
    tris += idx.length / 3;
    for (let i = 0; i < pos.length; i += 3) for (let k = 0; k < 3; k++) (min[k] = Math.min(min[k], pos[i + k])), (max[k] = Math.max(max[k], pos[i + k]));
  }
  const geo: CarGeo = { layers, tris, body, bounds: { min, max }, plates: c.plates, chargePort: c.info.chargePort, exhausts: c.info.exhausts, spokes: c.info.spokes };
  cache.set(key, geo);
  return geo;
}

type TopView = { outline: [number, number][]; cabin: [number, number][]; wheels: [number, number, number, number][] };
const topCache = new Map<string, TopView>();

/** The car seen from above (x, z in metres, front = +z): body outline, glasshouse and the four wheels. For the plan and the catalog thumbnails. */
export function carTopView(spec: CarSpec): TopView {
  const key = JSON.stringify(spec);
  const hit = topCache.get(key);
  if (hit) return hit;
  const f = makeFrame(designFor(spec));
  const zs = f.stations(0);
  const half = (z: number) => {
    const s = f.sec(z);
    return s.wm * s.cw;
  };
  const right = zs.map((z): [number, number] => [half(z), z]);
  const outline = [...right, ...[...right].reverse().map(([x, z]): [number, number] => [-x, z])];
  const cab = zs.filter((z) => f.sec(z).k > 0.05 && z > f.zRb && z < f.zWb).map((z): [number, number] => [f.sec(z).wt * f.sec(z).cw * 0.95, z]);
  const open = cab.length < 2;
  const base: [number, number][] = open ? [[f.W / 2 - 0.2, f.zWb], [f.W / 2 - 0.25, f.zWb - 0.2]] : cab;
  const cabin = [...base, ...[...base].reverse().map(([x, z]): [number, number] => [-x, z])];
  const wx = f.W / 2 - 0.03 - f.tw / 2;
  const wheels: [number, number, number, number][] = [];
  for (const z of [f.axleF, f.axleR]) for (const sx of [-1, 1]) wheels.push([sx * wx, z, f.tw, f.D]);
  const out = { outline, cabin, wheels };
  topCache.set(key, out);
  return out;
}
