// Writes a small OBJ laid out exactly like Vectiler's `--splitMeshes 1 --terrain 1 --roadsHeight 0` output (vectiler.cpp `saveOBJ`): per tile, in x-then-y order, one terrain mesh
// (a `sub` x `sub` grid of unshared quads over [-1, 1]), then one object per building (walls: four vertices per edge; roof) and per road ribbon, every vertex shifted by the
// tile's offset `((x - x0) * 2, -(y - y0) * 2)`. Heights and sizes are given in real metres and converted the way Vectiler does (heights by `invScale`, horizontal by
// `invScale / cos(lat)` because the tile is in Mercator metres). Used by the tests and to write the example model in docs; it is not part of the app.
const HALF_CIRCUMFERENCE = Math.PI * 6378137;

export type FixtureBuilding = {
  /** centre, in OBJ units about the first tile's centre (x east, y north) */
  u: number;
  v: number;
  /** footprint size in real metres, turned by `turn` degrees counter-clockwise */
  w: number;
  d: number;
  turn?: number;
  /** metres from the building's lowest ground to the eaves */
  height: number;
};
export type FixtureRoad = { u: number; v: number; length: number; width: number; turn?: number };
export type FixtureOptions = {
  z: number;
  x0: number;
  y0: number;
  nx: number;
  ny: number;
  /** latitude the area lies at: sets the Mercator stretch of horizontal sizes */
  lat: number;
  /** terrain grid quads per tile side (Vectiler's --terrainSubdivision) */
  sub: number;
  buildings: FixtureBuilding[];
  roads?: FixtureRoad[];
  /** ground height in metres at OBJ position (u, v); default flat 0 */
  relief?: (u: number, v: number) => number;
};

type P = [number, number];

/** Write the OBJ text. */
export function vectilerObj(o: FixtureOptions): string {
  const perMetre = 2 ** o.z / HALF_CIRCUMFERENCE; // OBJ units per real metre of height
  const perMetreHere = perMetre / Math.cos((o.lat * Math.PI) / 180); // ... and per real metre sideways
  const relief = o.relief ?? (() => 0);
  const lines: string[] = ["# exported with vectiler: https://github.com/karimnaaji/vectiler", ""];
  let verts = 0;
  let objects = 0;
  const mesh = (vs: [number, number, number][], tris: [number, number, number][]) => {
    lines.push(`o mesh${objects++}`);
    for (const v of vs) lines.push(`v ${v[0]} ${v[1]} ${v[2]}`);
    for (const t of tris) lines.push(`f ${t[0] + verts + 1} ${t[1] + verts + 1} ${t[2] + verts + 1}`);
    lines.push("");
    verts += vs.length;
  };
  const corners = (cu: number, cv: number, w: number, d: number, turn = 0): P[] => {
    const a = (turn * Math.PI) / 180;
    return ([[-1, -1], [1, -1], [1, 1], [-1, 1]] as P[]).map(([sx, sy]) => {
      const x = (sx * w) / 2;
      const y = (sy * d) / 2;
      return [cu + (x * Math.cos(a) - y * Math.sin(a)) * perMetreHere, cv + (x * Math.sin(a) + y * Math.cos(a)) * perMetreHere];
    });
  };
  for (let tx = 0; tx < o.nx; tx++) {
    for (let ty = 0; ty < o.ny; ty++) {
      const ou = tx * 2;
      const ov = -ty * 2;
      const step = 2 / o.sub;
      // terrain: Vectiler's buildPlane quad order v0 (w, h + oh), v1 (w, h), v2 (w + ow, h), v3 (w + ow, h + oh)
      const tv: [number, number, number][] = [];
      const tt: [number, number, number][] = [];
      for (let a = 0; a < o.sub; a++) {
        for (let b = 0; b < o.sub; b++) {
          const w = -1 + a * step;
          const h = -1 + b * step;
          const base = tv.length;
          for (const [pu, pv] of [[w, h + step], [w, h], [w + step, h], [w + step, h + step]] as P[]) tv.push([ou + pu, ov + pv, relief(ou + pu, ov + pv) * perMetre]);
          tt.push([base, base + 1, base + 2], [base, base + 2, base + 3]);
        }
      }
      mesh(tv, tt);
      const here = (p: P) => p[0] >= ou - 1 && p[0] < ou + 1 && p[1] > ov - 1 && p[1] <= ov + 1;
      for (const b of o.buildings.filter((q) => here([q.u, q.v]))) {
        const ring = corners(b.u, b.v, b.w, b.d, b.turn);
        const ground = ring.map((p) => relief(p[0], p[1]));
        const lowest = Math.min(...ground);
        const top = (b.height + relief(b.u, b.v)) * perMetre;
        const bottom = lowest * perMetre;
        const vs: [number, number, number][] = [];
        const ts: [number, number, number][] = [];
        for (let i = 0; i < 4; i++) {
          const [a, c] = [ring[i], ring[(i + 1) % 4]];
          const k = vs.length;
          vs.push([a[0], a[1], top], [c[0], c[1], top], [a[0], a[1], bottom], [c[0], c[1], bottom]);
          ts.push([k, k + 1, k + 2], [k + 1, k + 3, k + 2]);
        }
        const k = vs.length;
        for (const p of ring) vs.push([p[0], p[1], top]);
        ts.push([k, k + 1, k + 2], [k, k + 2, k + 3]);
        mesh(vs, ts);
      }
      for (const r of (o.roads ?? []).filter((q) => here([q.u, q.v]))) {
        const ring = corners(r.u, r.v, r.length, r.width, r.turn);
        mesh(ring.map((p) => [p[0], p[1], relief(p[0], p[1]) * perMetre]), [[0, 1, 2], [0, 2, 3]]);
      }
    }
  }
  return lines.join("\n") + "\n";
}
