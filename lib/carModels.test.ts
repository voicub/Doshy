import test from "node:test";
import assert from "node:assert/strict";
import { autoCalibration, cleanAttribution, cleanEntry, cleanMap, creditsOf, DEFAULT_CALIB, fitModel, measureModel, nudge, quarterTurns, searchWords, type CarModelEntry, type Fit, type PointCloud } from "./carModels.ts";

/** Points on a box surface grid, every `step` metres. */
function box(a: [number, number, number], b: [number, number, number], step = 0.04): number[] {
  const min = a.map((v, i) => Math.min(v, b[i]));
  const max = a.map((v, i) => Math.max(v, b[i]));
  const out: number[] = [];
  for (let x = min[0]; x <= max[0] + 1e-9; x += step) for (let y = min[1]; y <= max[1] + 1e-9; y += step) for (let z = min[2]; z <= max[2] + 1e-9; z += step) out.push(x, y, z);
  return out;
}

/** A car lying along +x with its nose at +x (cabin sits toward -x), 4.3 x 1.6 x 1.76, mirrors 0.1 m out each side, wheels 0.05 under the body. */
function carAlongX(nose = 1): PointCloud[] {
  const s = nose;
  const wheels = [[1.3, 0.8], [1.3, -0.8], [-1.3, 0.8], [-1.3, -0.8]].flatMap(([x, z]) => box([s * x - 0.3, 0, z - 0.1], [s * x + 0.3, 0.64, z + 0.1], 0.05));
  const body = box([-2.15, 0.2, -0.88], [2.15, 1.0, 0.88]);
  const cabin = box([s * -0.9, 1.0, -0.7], [s * 0.5, 1.6, 0.7]);
  const mirrors = box([s * 0.55, 1.05, -0.98], [s * 0.6, 1.1, 0.98], 0.05);
  return [
    { pos: body.concat(cabin, mirrors), wheel: false },
    { pos: wheels, wheel: true },
  ];
}

const ASX = { w: 1.77, d: 4.295, h: 1.625 };

/** Applies a Fit to a point the way the scene graph does: centre, turn, scale, lift. */
function place(p: [number, number, number], f: Fit): [number, number, number] {
  const [x, y, z] = [p[0] - f.centre[0], p[1] - f.centre[1], p[2] - f.centre[2]];
  const c = Math.cos(f.yaw);
  const s = Math.sin(f.yaw);
  return [(x * c + z * s) * f.scale[0], y * f.scale[1] + f.yOffset, (-x * s + z * c) * f.scale[2]];
}

test("measure: body size excludes mirrors, ground is the wheels, length axis and nose are found", () => {
  const m = measureModel(carAlongX())!;
  assert.equal(m.lengthAxis, "x");
  assert.ok(Math.abs(m.size[0] - 4.3) < 0.1, `length ${m.size[0]}`);
  assert.ok(Math.abs(m.size[2] - 1.76) < 0.1, `width ${m.size[2]} (mirrors must not count)`);
  assert.ok(Math.abs(m.size[1] - 1.6) < 0.05);
  assert.ok(Math.abs(m.ground) < 0.02);
  assert.equal(m.front, 1);
  assert.equal(measureModel(carAlongX(-1))!.front, -1);
});

test("measure: nothing to measure gives null", () => {
  assert.equal(measureModel([]), null);
  assert.equal(measureModel([{ pos: [0, 0, 0], wheel: false }]), null);
});

test("auto calibration turns the nose to +z whichever way the model came", () => {
  for (const nose of [1, -1]) {
    const m = measureModel(carAlongX(nose))!;
    const f = fitModel(m, autoCalibration(m), ASX);
    // the nose tip (a point at the front end) must land at +z, the tail at -z
    const tip = place([nose * 2.1, 0.6, 0], f);
    const tail = place([nose * -2.1, 0.6, 0], f);
    assert.ok(tip[2] > 2 && tail[2] < -2, `nose ${nose}: ${tip} ${tail}`);
  }
});

test("auto calibration for a model already along z", () => {
  const along = carAlongX().map((c) => ({ ...c, pos: Array.from({ length: c.pos.length }, (_, i) => (i % 3 === 0 ? c.pos[i + 2] : i % 3 === 2 ? c.pos[i - 2] : c.pos[i])) }));
  const m = measureModel(along)!;
  assert.equal(m.lengthAxis, "z");
  assert.equal(autoCalibration(m).rotY, m.front === 1 ? 0 : 2);
});

test("fit scales the body to the published length x width x height and stands it on y = 0, centred", () => {
  const m = measureModel(carAlongX())!;
  const f = fitModel(m, autoCalibration(m), ASX);
  assert.equal(f.differs, false);
  const lo = [Infinity, Infinity, Infinity];
  const hi = [-Infinity, -Infinity, -Infinity];
  for (const c of carAlongX()) for (let i = 0; i < c.pos.length; i += 3) {
    const q = place([c.pos[i], c.pos[i + 1], c.pos[i + 2]], f);
    q.forEach((v, k) => { lo[k] = Math.min(lo[k], v); hi[k] = Math.max(hi[k], v); });
  }
  assert.ok(Math.abs(hi[2] - lo[2] - ASX.d) < 0.06, `length ${hi[2] - lo[2]}`);
  assert.ok(Math.abs(hi[1] - ASX.h) < 0.03 && Math.abs(lo[1]) < 0.03, `height ${lo[1]}..${hi[1]}`);
  assert.ok(Math.abs((hi[2] + lo[2]) / 2) < 0.03 && Math.abs((hi[0] + lo[0]) / 2) < 0.03, "centred");
});

test("a model of another shape keeps its proportions and says so", () => {
  const m = measureModel(carAlongX())!;
  const f = fitModel(m, autoCalibration(m), { w: 1.6, d: 4.295, h: 1.3 });
  assert.equal(f.differs, true);
  assert.ok(f.scale[0] === f.scale[1] && f.scale[1] === f.scale[2]);
  // within 6 % it still counts as the same car
  assert.equal(fitModel(m, autoCalibration(m), { w: 1.8, d: 4.3, h: 1.62 }).differs, false);
});

test("rotate, flip, lift and nudge scale change the fit and stay in range", () => {
  const m = measureModel(carAlongX())!;
  const a = autoCalibration(m);
  assert.equal(quarterTurns({ ...a, flip: true }), (a.rotY + 2) % 4);
  assert.equal(quarterTurns(nudge(a, { rotY: a.rotY + 5 })), (a.rotY + 1) % 4);
  const flipped = fitModel(m, nudge(a, { flip: true }), ASX);
  assert.ok(place([2.1, 0.6, 0], flipped)[2] < -2);
  const lifted = fitModel(m, nudge(a, { yOffset: 0.03 }), ASX);
  assert.ok(Math.abs(place([0, m.ground, 0], lifted)[1] - 0.03) < 1e-9);
  assert.equal(nudge(DEFAULT_CALIB, { yOffset: 9, scale: 9 }).yOffset, 0.5);
  assert.equal(nudge(DEFAULT_CALIB, { scale: 9 }).scale, 1.25);
  assert.equal(nudge(DEFAULT_CALIB, { scale: 0 }).scale, 0.8);
  const bigger = fitModel(m, nudge(a, { scale: 1.1 }), ASX);
  assert.ok(Math.abs(bigger.scale[2] / fitModel(m, a, ASX).scale[2] - 1.1) < 1e-9);
});

const attribution = {
  source: "sketchfab",
  uid: "a".repeat(32),
  name: "Mitsubishi ASX",
  author: "Jane Doe",
  authorUrl: "https://sketchfab.com/jane",
  license: "by",
  licenseLabel: "CC Attribution",
  licenseUrl: "https://creativecommons.org/licenses/by/4.0/",
  sourceUrl: `https://sketchfab.com/3d-models/x-${"a".repeat(32)}`,
  line: '"Mitsubishi ASX" by Jane Doe is licensed under CC BY 4.0.',
};
const entry = { resource: "carmodel-abc123", calib: { rotY: 1, flip: true, yOffset: 0.02, scale: 1.05 }, attribution, triangles: 50000, bytes: 1234567, addedAt: 1 };

test("a stored entry is checked: licence, links, ids and numbers", () => {
  const ok = cleanEntry(entry) as CarModelEntry;
  assert.equal(ok.calib.rotY, 1);
  assert.equal(ok.attribution.license, "by");
  assert.equal(cleanEntry({ ...entry, attribution: { ...attribution, license: "by-nc" } }), null);
  assert.equal(cleanEntry({ ...entry, attribution: { ...attribution, license: "by-nd" } }), null);
  assert.equal(cleanEntry({ ...entry, attribution: { ...attribution, sourceUrl: "http://sketchfab.com/x" } }), null);
  assert.equal(cleanEntry({ ...entry, attribution: { ...attribution, sourceUrl: "javascript:alert(1)" } }), null);
  assert.equal(cleanEntry({ ...entry, attribution: { ...attribution, uid: "nope" } }), null);
  assert.equal(cleanEntry({ ...entry, resource: "../etc/passwd" }), null);
  assert.equal(cleanEntry(null), null);
  const odd = cleanEntry({ ...entry, calib: { rotY: 9, flip: "yes", yOffset: 50, scale: -3 } })!;
  assert.deepEqual(odd.calib, { rotY: 3, flip: false, yOffset: 0.5, scale: 0.8 });
  assert.equal(cleanAttribution({ ...attribution, authorUrl: "http://x" })!.authorUrl, "");
  assert.equal(cleanAttribution({ ...attribution, name: "A\u0000B" })!.name, "A B");
});

test("the mapping persists as plain data and falls back when entries are broken", () => {
  const stored = JSON.parse(JSON.stringify({ car_mitsubishi_asx_2016: entry, car_bad: { resource: "x" }, not_a_car: entry }));
  const map = cleanMap(stored);
  assert.deepEqual(Object.keys(map), ["car_mitsubishi_asx_2016"]);
  assert.deepEqual(cleanMap("junk"), {});
  assert.deepEqual(cleanMap(undefined), {});
});

test("search words: full label first, year-less and regional names as alternatives", () => {
  const w = searchWords({ brand: "Mitsubishi", label: "Mitsubishi ASX 2016" });
  assert.equal(w.query, "Mitsubishi ASX 2016");
  assert.deepEqual(w.alternatives, ["Mitsubishi ASX", "Mitsubishi Outlander Sport", "Mitsubishi RVR"]);
  assert.deepEqual(searchWords({ brand: "Tesla", label: "Tesla Model 3" }).alternatives, ["Tesla Model"]);
});

test("credits: one line per model even when two cars share it", () => {
  const map = cleanMap({ car_a: entry, car_b: entry, car_c: { ...entry, attribution: { ...attribution, uid: "b".repeat(32), name: "Another" } } });
  const c = creditsOf(map);
  assert.equal(c.length, 2);
  assert.equal(c[0].attribution.name, "Another");
  assert.deepEqual(c[1].carIds, ["car_a", "car_b"]);
});

test("a model turned a quarter the wrong way is shrunk to fit inside the box instead of being stretched", () => {
  const m = measureModel(carAlongX())!;
  const a = autoCalibration(m);
  const f = fitModel(m, nudge(a, { rotY: a.rotY + 1 }), ASX);
  assert.equal(f.differs, false);
  assert.ok(f.scale[0] === f.scale[1] && f.scale[1] === f.scale[2]);
  assert.ok(f.scale[0] < 0.5, `scale ${f.scale[0]}`);
  for (const c of carAlongX()) for (let i = 0; i < c.pos.length; i += 3) {
    const q = place([c.pos[i], c.pos[i + 1], c.pos[i + 2]], f);
    assert.ok(Math.abs(q[0]) <= ASX.w / 2 + 0.2 && Math.abs(q[2]) <= ASX.d / 2 + 0.01);
  }
});
