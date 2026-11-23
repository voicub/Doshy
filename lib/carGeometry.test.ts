import test from "node:test";
import assert from "node:assert/strict";
import { buildCar, carTopView } from "./carGeometry.ts";
import { designFor } from "./carDesign.ts";
import { makeFrame } from "./carFrame.ts";
import { LAYERS } from "./carSurf.ts";
import { carSpec, type CarSpec } from "./cars.ts";
import { CAR_TABLE } from "./cars.data.ts";

const specs = CAR_TABLE.map(carSpec);
const geos = specs.map((s) => ({ s, g: buildCar(s, 0) }));
const TOL = 0.015; // the footprint and height are exact to 1.5 cm; mirrors, plates and tyres may stand out a little

test("every body style builds for every model, with finite numbers and indices in range", () => {
  for (const { s, g } of geos) {
    for (const l of LAYERS) {
      const d = g.layers[l];
      assert.equal(d.pos.length, d.nor.length, `${s.id} ${l}`);
      assert.equal(d.pos.length, d.col.length, `${s.id} ${l}`);
      assert.ok(d.pos.every(Number.isFinite) && d.nor.every(Number.isFinite), `${s.id} ${l} not finite`);
      const n = d.pos.length / 3;
      assert.ok(d.idx.every((i) => i < n), `${s.id} ${l} index out of range`);
      assert.equal(d.idx.length % 3, 0);
      for (let i = 0; i < d.nor.length; i += 3) assert.ok(Math.abs(Math.hypot(d.nor[i], d.nor[i + 1], d.nor[i + 2]) - 1) < 1e-3, `${s.id} ${l} normal ${i / 3}`);
    }
  }
});

test("every model has a sane triangle count, and the decimated variant is lighter with the same footprint", () => {
  for (const { s, g } of geos) {
    assert.ok(g.tris >= 6000 && g.tris <= 25000, `${s.id} has ${g.tris} triangles`);
    const low = buildCar(s, 1);
    assert.ok(low.tris < g.tris * 0.6, `${s.id} low ${low.tris} vs ${g.tris}`);
    assert.ok(Math.abs(low.body.max[0] - g.body.max[0]) < 0.02 && Math.abs(low.body.max[2] - g.body.max[2]) < 0.02, `${s.id} low footprint`);
  }
});

test("bounding box equals the spec footprint and height within 1.5 cm; mirrors and plates stand out a little", () => {
  for (const { s, g } of geos) {
    const { min, max } = g.bounds;
    assert.ok(Math.abs(g.body.max[0] - s.width / 2) < TOL && Math.abs(g.body.min[0] + s.width / 2) < TOL, `${s.id} width ${g.body.max[0] * 2}`);
    assert.ok(max[2] - s.length / 2 < TOL && max[2] > s.length / 2 - TOL, `${s.id} front ${max[2]}`);
    assert.ok(min[2] + s.length / 2 > -TOL && min[2] < -s.length / 2 + TOL, `${s.id} rear ${min[2]}`);
    assert.ok(Math.abs(max[1] - s.height) < TOL, `${s.id} height ${max[1]} vs ${s.height}`);
    assert.ok(min[1] > -0.001, `${s.id} below the ground ${min[1]}`);
    assert.ok(max[0] <= s.width / 2 + 0.16 && min[0] >= -s.width / 2 - 0.16, `${s.id} mirrors ${max[0]}`);
  }
});

test("symmetric about the centre line (paint, glass, lamps)", () => {
  for (const { s, g } of geos) {
    for (const l of ["paint", "glass", "lamp", "tail"] as const) {
      const { pos } = g.layers[l];
      const key = (x: number, y: number, z: number) => `${Math.round(x * 1e4)},${Math.round(y * 1e4)},${Math.round(z * 1e4)}`;
      const set = new Set<string>();
      for (let i = 0; i < pos.length; i += 3) set.add(key(pos[i], pos[i + 1], pos[i + 2]));
      for (let i = 0; i < pos.length; i += 3) assert.ok(set.has(key(-pos[i], pos[i + 1], pos[i + 2])), `${s.id} ${l} vertex ${i / 3} has no mirror image`);
    }
  }
});

test("deterministic: the same car built twice is identical", () => {
  for (const s of [specs[0], specs[10], specs[specs.length - 1]]) {
    const fresh: CarSpec = { ...s, label: `${s.label} again` }; // a new cache key
    const a = buildCar(s, 0);
    const b = buildCar(fresh, 0);
    for (const l of LAYERS) {
      assert.deepEqual(a.layers[l].pos, b.layers[l].pos, `${s.id} ${l}`);
      assert.deepEqual(a.layers[l].idx, b.layers[l].idx, `${s.id} ${l}`);
    }
  }
});

test("surfaces face outwards: body normals point away from the middle of the car", () => {
  for (const { s, g } of geos.filter((_, i) => i % 7 === 0)) {
    const { pos, nor } = g.layers.paint;
    let sum = 0;
    for (let i = 0; i < pos.length; i += 3) sum += nor[i] * pos[i] + nor[i + 1] * (pos[i + 1] - s.height / 2);
    assert.ok(sum > 0, `${s.id} normals point inwards`);
  }
});

test("Mitsubishi ASX 2016: exact dimensions in the generated body, wheelbase 2.67 m, shield-and-rail crossover with exhaust and plates", () => {
  const s = specs.find((x) => x.id === "car_mitsubishi_asx_2016")!;
  const g = buildCar(s);
  const f = makeFrame(designFor(s));
  assert.ok(Math.abs(g.body.max[2] * 2 - 4.295) < 1e-6 && Math.abs(g.body.max[0] * 2 - 1.77) < 0.02);
  assert.ok(Math.abs(g.bounds.max[1] - 1.625) < TOL);
  assert.ok(Math.abs(f.axleF - f.axleR - 2.67) < 1e-9);
  assert.ok(g.exhausts >= 1 && g.chargePort === undefined);
  assert.deepEqual(g.plates.map((p) => p.end).sort(), ["front", "rear"]);
  const front = g.plates.find((p) => p.end === "front")!;
  const rear = g.plates.find((p) => p.end === "rear")!;
  assert.ok(front.p[2] > 4.295 / 2 - 0.05 && front.p[2] < 4.295 / 2 + 0.015, `front plate z ${front.p[2]}`);
  assert.ok(rear.p[2] < -4.295 / 2 + 0.05 && rear.p[2] > -4.295 / 2 - 0.015, `rear plate z ${rear.p[2]}`);
  assert.ok(front.p[1] > 0.25 && front.p[1] < 0.8 && rear.p[1] > 0.25 && rear.p[1] < 1.0);
});

test("EVs have a charge flap and no exhaust; combustion cars have an exhaust tip unless the design hides it", () => {
  for (const { s, g } of geos) {
    const d = designFor(s);
    if (s.fuel === "ev") assert.deepEqual([g.chargePort, g.exhausts], [s.port ?? "r", 0], s.id);
    else assert.equal(g.exhausts, d.rear.exhaust === "hidden" ? 0 : d.rear.exhaust === "twin" ? 2 : 1, s.id);
  }
});

test("wheels: 5 to 10 spokes on alloys, none on steel wheels", () => {
  for (const { s, g } of geos) {
    const d = designFor(s);
    if (d.wheel.style === "steel") assert.equal(g.spokes, 0, s.id);
    else assert.ok(g.spokes >= 5 && g.spokes <= 10, `${s.id} ${g.spokes}`);
  }
});

test("top view: a closed outline inside the footprint, a glasshouse and four wheels", () => {
  for (const s of specs.filter((_, i) => i % 9 === 0)) {
    const v = carTopView(s);
    assert.equal(v.wheels.length, 4);
    for (const [x, z] of v.outline) assert.ok(Math.abs(x) <= s.width / 2 + 1e-6 && Math.abs(z) <= s.length / 2 + 1e-6, s.id);
    assert.ok(v.cabin.length >= 4, s.id);
  }
});
