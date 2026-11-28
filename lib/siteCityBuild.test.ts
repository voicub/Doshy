import assert from "node:assert/strict";
import { test } from "node:test";
import { latLonToSite, tileBoundsSite, tileCorner, tileOf } from "./geo.ts";
import { prepareCity } from "./siteCityBuild.ts";
import { centredFrame, cityFrame } from "./siteCityFrame.ts";
import { vectilerObj, type FixtureOptions } from "./siteCityFixture.ts";
import { parseObj } from "./siteCityObj.ts";
import { placeBuildings, placeRoads } from "./siteCityPlace.ts";
import type { XY } from "./siteTypes.ts";

const centre = { lat: 51.4779, lon: -0.0015 };
const Z = 16;
const home = tileOf(centre.lat, centre.lon, Z);
const first = { x: home.x - 1, y: home.y - 1 };
const frame = cityFrame(centre, Z, first);
const toUnits = ([sx, sy]: XY) => ({ u: (sx - frame.ox) / frame.kx, v: (frame.oy - sy) / frame.ky });
const at = (sx: number, sy: number) => toUnits([sx, sy]);

const base: Omit<FixtureOptions, "buildings"> = { z: Z, x0: first.x, y0: first.y, nx: 3, ny: 3, lat: centre.lat, sub: 4 };
const parse = (o: FixtureOptions) => parseObj(new TextEncoder().encode(vectilerObj(o)), () => Promise.resolve());
const options = { radius: 250, share: 1, roads: true, terrain: false };
const identity = (p: XY): XY => p;

test("the middle of the first tile lands where lib/geo.ts puts that tile's middle, and tile edges match tileBoundsSite", () => {
  const corner = tileCorner(Z, first.x + 0.5, first.y + 0.5);
  const [x, y] = latLonToSite(centre, corner.lat, corner.lon);
  assert.ok(Math.abs(frame.ox - x) < 1e-6 && Math.abs(frame.oy - y) < 1e-6);
  const b = tileBoundsSite(centre, Z, first.x, first.y);
  assert.ok(Math.abs(frame.ox + frame.kx - b.x1) < 0.2, "east edge");
  assert.ok(Math.abs(frame.oy - frame.ky - b.y0) < 0.5, "north edge (y is south)");
  assert.ok(Math.abs(frame.ox - frame.kx - b.x0) < 0.2, "west edge");
  assert.ok(Math.abs(frame.oy + frame.ky - b.y1) < 0.5, "south edge");
});

test("heights come out in true metres and widths are corrected for the Mercator stretch", async () => {
  const model = await parse({ ...base, buildings: [{ ...at(0, 0), w: 10, d: 8, height: 12 }] });
  const c = prepareCity(model, frame, options);
  assert.equal(c.buildings.length, 1);
  const b = c.buildings[0];
  assert.ok(Math.abs(b.h - 12) < 0.01, `height ${b.h}`);
  assert.ok(Math.abs(b.x1 - b.x0 - 10) < 0.05 && Math.abs(b.y1 - b.y0 - 8) < 0.05, `size ${b.x1 - b.x0} x ${b.y1 - b.y0}`);
  assert.ok(Math.abs((b.x0 + b.x1) / 2) < 0.05 && Math.abs((b.y0 + b.y1) / 2) < 0.05, "centred on the site centre");
});

test("terrain tiles are set aside, flat ribbons become roads, objects with walls become buildings", async () => {
  const model = await parse({ ...base, buildings: [{ ...at(0, 0), w: 10, d: 8, height: 9 }, { ...at(40, 30), w: 6, d: 6, height: 5 }], roads: [{ ...at(0, 20), length: 80, width: 6 }] });
  const c = prepareCity(model, frame, options);
  assert.deepEqual([c.stats.buildings, c.roads.idx.length / 3], [2, 2]);
  const none = prepareCity(model, frame, { ...options, roads: false });
  assert.equal(none.roads.idx.length, 0);
});

test("buildings past the edge, and small far ones, are left out; the triangle budget keeps the nearest", async () => {
  const model = await parse({ ...base, buildings: [{ ...at(0, 0), w: 10, d: 8, height: 9 }, { ...at(300, 0), w: 10, d: 8, height: 9 }, { ...at(120, 0), w: 3, d: 3, height: 3 }, { ...at(100, 0), w: 12, d: 9, height: 9 }] });
  const c = prepareCity(model, frame, options);
  assert.equal(c.buildings.length, 2);
  assert.equal(c.stats.leftOut, 2);
  const lite = prepareCity(model, frame, { ...options, share: 0.00002 }); // a handful of triangles
  assert.equal(lite.buildings.length, 0);
});

test("every wall faces away from its building and every roof faces up, whichever way the file wound its triangles", async () => {
  const text = vectilerObj({ ...base, buildings: [{ ...at(0, 0), w: 10, d: 8, turn: 30, height: 9 }, { ...at(50, 0), w: 7, d: 12, height: 6 }] });
  const reversed = text.replace(/^f (\d+) (\d+) (\d+)$/gm, "f $1 $3 $2");
  for (const obj of [text, reversed]) {
    const c = prepareCity(await parseObj(new TextEncoder().encode(obj), () => Promise.resolve()), frame, options);
    for (const b of c.buildings) {
      const cx = (b.x0 + b.x1) / 2;
      const cz = (b.y0 + b.y1) / 2;
      for (let v = b.v0; v < b.v1; v++) {
        const ny = c.nrm[v * 3 + 1];
        if (ny > 0.5) continue;
        assert.ok(Math.abs(ny) < 1e-6, "walls are vertical");
        assert.ok(c.nrm[v * 3] * (c.pos[v * 3] - cx) + c.nrm[v * 3 + 2] * (c.pos[v * 3 + 2] - cz) > 0, "outward");
      }
      // the triangle order itself (what back-face culling reads) agrees with the stored normals
      for (let t = b.i0; t < b.i1; t += 3) {
        const [a, q, r] = [c.idx[t], c.idx[t + 1], c.idx[t + 2]];
        const e1 = [0, 1, 2].map((k) => c.pos[q * 3 + k] - c.pos[a * 3 + k]);
        const e2 = [0, 1, 2].map((k) => c.pos[r * 3 + k] - c.pos[a * 3 + k]);
        const n = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
        assert.ok(n[0] * c.nrm[a * 3] + n[1] * c.nrm[a * 3 + 1] + n[2] * c.nrm[a * 3 + 2] > 0);
      }
    }
  }
});

test("a building is lifted onto the ground where it stands and the Cut-away data follows", async () => {
  const model = await parse({ ...base, buildings: [{ ...at(60, 0), w: 10, d: 8, height: 9 }] });
  const c = prepareCity(model, frame, options);
  const env = { toPlan: identity, ground: (x: number) => x / 10, footprint: { x0: -5, y0: -5, x1: 5, y1: 5 }, homes: [] as XY[], at: [0, 0] as XY };
  const placed = placeBuildings(c, env);
  const b = c.buildings[0];
  const lowest = Math.min(...Array.from({ length: b.v1 - b.v0 }, (_, i) => placed.pos[(b.v0 + i) * 3 + 1]));
  assert.ok(Math.abs(lowest - 6) < 0.05, `base ${lowest}`);
  assert.ok(Math.abs(placed.cut[b.v0 * 3 + 1] - 6) < 1e-4, "ground height recorded");
  assert.ok(placed.cut[b.v0 * 3] > 0 && placed.cut[b.v0 * 3] <= 1, "share of height kept while cut away");
  assert.equal(placed.far.length + placed.near.length, b.i1 - b.i0);
  assert.equal(placed.near.length, 0, "60 m from the plan: beyond the shadow range");
});

test("the building the plan stands in or touches is not drawn; a neighbour is", async () => {
  const model = await parse({ ...base, buildings: [{ ...at(0, 0), w: 20, d: 20, height: 9 }, { ...at(60, 0), w: 10, d: 8, height: 9 }, { ...at(0, 29), w: 10, d: 8, height: 9 }] });
  const c = prepareCity(model, frame, options);
  const env = { toPlan: identity, ground: () => 0, footprint: { x0: -3, y0: -3, x1: 3, y1: 3 }, homes: [[0, 0]] as XY[], at: [0, 0] as XY };
  const placed = placeBuildings(c, env);
  assert.equal(placed.hosts, 1);
  assert.equal((placed.near.length + placed.far.length) / 3, 2 * 6 * 2 /* walls: 4 x 2, roof 2 triangles = 10 */ - 4);
  const away = placeBuildings(c, { ...env, toPlan: ([x, y]) => [x + 200, y], footprint: { x0: 197, y0: -3, x1: 203, y1: 3 }, homes: [[200, 0]] });
  assert.equal(away.hosts, 1, "the same building is the host wherever the plan is moved to, as long as the alignment moves with it");
});

test("a roof that swallows the footprint without a corner inside it still makes its building the host", async () => {
  const model = await parse({ ...base, buildings: [{ ...at(0, 0), w: 60, d: 60, height: 9 }] });
  const c = prepareCity(model, frame, options);
  const placed = placeBuildings(c, { toPlan: identity, ground: () => 0, footprint: { x0: -2, y0: -2, x1: 2, y1: 2 }, homes: [], at: [0, 0] });
  assert.equal(placed.hosts, 1);
});

test("road ribbons are draped on the ground plus a small lift", async () => {
  const model = await parse({ ...base, buildings: [], roads: [{ ...at(20, 0), length: 30, width: 6 }] });
  const c = prepareCity(model, frame, options);
  const pos = placeRoads(c, { toPlan: identity, ground: () => 3, footprint: null, homes: [], at: [0, 0] }, { x0: -5, y0: -5, x1: 5, y1: 5 });
  assert.ok(pos[1] > 3 && pos[1] < 3.05);
});

test("road ribbons face up whichever way the file wound them, so they are not culled from above", async () => {
  const text = vectilerObj({ ...base, buildings: [], roads: [{ ...at(20, 0), length: 30, width: 6 }, { ...at(20, 30), length: 30, width: 6, turn: 40 }] });
  const reversed = text.replace(/^f (\d+) (\d+) (\d+)$/gm, "f $1 $3 $2"); // every triangle wound the other way
  for (const obj of [text, reversed]) {
    const c = prepareCity(await parseObj(new TextEncoder().encode(obj), () => Promise.resolve()), frame, options);
    assert.ok(c.roads.idx.length >= 12);
    for (let t = 0; t < c.roads.idx.length; t += 3) {
      const [a, b, d] = [c.roads.idx[t], c.roads.idx[t + 1], c.roads.idx[t + 2]];
      const ny = (c.roads.pos[b * 3 + 2] - c.roads.pos[a * 3 + 2]) * (c.roads.pos[d * 3] - c.roads.pos[a * 3]) - (c.roads.pos[b * 3] - c.roads.pos[a * 3]) * (c.roads.pos[d * 3 + 2] - c.roads.pos[a * 3 + 2]);
      assert.ok(ny > 0);
    }
  }
});

test("the model's terrain becomes a ground grid relative to the site's centre, in metres", async () => {
  const relief = (u: number) => 200 + (u - toUnits([0, 0]).u) * frame.kx * 0.1; // metres: 200 at the site's centre, 10 % uphill to the east
  const model = await parse({ ...base, sub: 8, buildings: [], roads: [], relief });
  const c = prepareCity(model, frame, { ...options, terrain: true });
  const t = c.terrain;
  assert.ok(t);
  assert.ok(Math.abs(t.base - 200) < 0.5, `base ${t.base}`);
  const mid = (t.n - 1) / 2;
  assert.ok(Math.abs(t.h[mid * t.n + mid]) < 0.5, "0 at the centre");
  const east = t.h[mid * t.n + mid + 4]; // 4 steps east
  assert.ok(Math.abs(east - 0.1 * 4 * t.step) < 1, `east ${east}`);
  assert.equal(prepareCity(model, frame, options).terrain, undefined, "only when asked for");
});

test("an OBJ of unknown position is centred: its middle lands on the site centre", async () => {
  const model = await parse({ ...base, buildings: [{ u: 0.3, v: -0.2, w: 10, d: 8, height: 9 }, { u: 0.5, v: -0.4, w: 10, d: 8, height: 9 }] });
  const f = centredFrame(centre, Z, { u: 0.4, v: -0.3 });
  const c = prepareCity(model, f, options);
  const xs = c.buildings.flatMap((b) => [b.x0, b.x1]);
  const ys = c.buildings.flatMap((b) => [b.y0, b.y1]);
  assert.ok(Math.abs((Math.min(...xs) + Math.max(...xs)) / 2) < 1 && Math.abs((Math.min(...ys) + Math.max(...ys)) / 2) < 1);
});
