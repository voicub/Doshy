import test from "node:test";
import assert from "node:assert/strict";
import { Euler, Quaternion, Vector3 } from "three";
import type { PlateMount } from "./carSurf.ts";
import { plateRotation } from "./plate.ts";
import {
  FIT_RANGE,
  PLATE_FIT_KEY,
  applyPlateFit,
  cleanFitMap,
  cleanPlateFit,
  defaultFit,
  encodePlateFit,
  fitsOfModel,
  holderStays,
  itemPlateFits,
  plateModelKey,
  resolvePlateFits,
  type PlateFit,
} from "./plateFit.ts";
import { guestPlan } from "./guestPlan.ts";
import { splitPlanFile } from "./planFile.ts";

const front: PlateMount = { end: "front", p: [0, 0.5, 2.2], rot: plateRotation("front", 0) };
const rear: PlateMount = { end: "rear", p: [0, 0.8, -2.2], rot: plateRotation("rear", 0) };
const fit = (over: Partial<PlateFit>): PlateFit => ({ ...defaultFit, ...over });
const near = (a: number, b: number, why = "") => assert.ok(Math.abs(a - b) < 1e-9, `${why} ${a} vs ${b}`);
const axis = (rot: [number, number, number], v: [number, number, number]) => new Vector3(...v).applyQuaternion(new Quaternion().setFromEuler(new Euler(...rot)));

test("a fit that changes nothing is no fit; numbers are clamped to their range and rounded to their step", () => {
  assert.equal(cleanPlateFit(defaultFit), undefined);
  assert.equal(cleanPlateFit({}), undefined);
  assert.equal(cleanPlateFit("0 0 0 0 0 100 0"), undefined);
  const wild = cleanPlateFit({ dx: 9, dy: -9, dz: 9, tilt: 400, yaw: -400, scale: 9, hidden: true });
  assert.deepEqual(wild, { dx: FIT_RANGE.dx.max, dy: FIT_RANGE.dy.min, dz: FIT_RANGE.dz.max, tilt: FIT_RANGE.tilt.max, yaw: FIT_RANGE.yaw.min, scale: FIT_RANGE.scale.max, hidden: true });
  assert.equal(cleanPlateFit({ scale: 0 })?.scale, FIT_RANGE.scale.min);
  assert.equal(cleanPlateFit({ dx: 0.0123456 })?.dx, 0.012);
  assert.equal(cleanPlateFit({ dy: -0.0002, tilt: 1 })?.dy, 0, "no negative zero");
  assert.ok(Object.is(cleanPlateFit({ dy: -0.0002, tilt: 1 })?.dy, 0));
});

test("hostile or stale values never produce a fit", () => {
  for (const bad of [null, undefined, 5, true, [], "x", "1 2 x", "1e9", "9".repeat(200), "1 2 3 4 5 6 7 8", "--1", "<script>", { dx: "9" }, { dx: Number.NaN, dy: Infinity }]) assert.equal(cleanPlateFit(bad), undefined, JSON.stringify(bad));
  assert.equal(cleanPlateFit({ dx: Number.NaN, tilt: 2 })?.dx, 0, "a bad field falls back, the good ones stay");
  assert.equal(cleanPlateFit({ hidden: "yes", tilt: 2 })?.hidden, false, "only true hides");
  assert.deepEqual(itemPlateFits({ plateFront: 7, plateRear: "garbage", finish: "matte" }), {});
});

test("the text kept in a car's params reads back to the same fit, fits in a plain short word, and a default fit has no text", () => {
  const f = fit({ dx: -0.125, dy: 0.085, dz: 0.004, tilt: -7, yaw: 12, scale: 1.25, hidden: true });
  const text = encodePlateFit(f)!;
  assert.match(text, /^[\w .#%+-]{1,40}$/);
  assert.deepEqual(cleanPlateFit(text), f);
  assert.equal(encodePlateFit(undefined), undefined);
  assert.equal(encodePlateFit(defaultFit), undefined);
  assert.equal(encodePlateFit(fit({ hidden: true })), "0 0 0 0 0 100 1", "hidden alone is a fit");
  const worst = encodePlateFit(fit({ dx: -9, dy: -9, dz: -9, tilt: -99, yaw: -99, scale: 9, hidden: true }))!;
  assert.ok(worst.length <= 40);
  assert.deepEqual(itemPlateFits({ [PLATE_FIT_KEY.rear]: text }), { rear: f });
});

test("resolution: the car's own fit, else the model's, else none; per end", () => {
  const own = { front: fit({ dy: 0.05 }) };
  const model = { front: fit({ dy: 0.2 }), rear: fit({ dx: 0.1 }) };
  assert.deepEqual(resolvePlateFits(own, model), { front: own.front, rear: model.rear });
  assert.deepEqual(resolvePlateFits({}, model), model);
  assert.deepEqual(resolvePlateFits({}, undefined), {});
  assert.deepEqual(resolvePlateFits(own, undefined), own);
});

test("without a fit the automatic place is returned as it is", () => {
  const placed = applyPlateFit(front, undefined);
  assert.deepEqual([placed.p, placed.rot, placed.scale, placed.hidden], [front.p, front.rot, 1, false]);
});

test("up raises the plate, out moves it along the surface normal, left and right follow what you see from outside", () => {
  const up = applyPlateFit(front, fit({ dy: 0.1 }));
  near(up.p[1], 0.6);
  near(up.p[2], 2.2);
  const out = applyPlateFit(front, fit({ dz: 0.05 }));
  near(out.p[2], 2.25);
  const outBack = applyPlateFit(rear, fit({ dz: 0.05 }));
  near(outBack.p[2], -2.25, "out of the back is toward -z");
  // seen from outside, "right" is +x at the front and -x at the back
  near(applyPlateFit(front, fit({ dx: 0.1 })).p[0], 0.1);
  near(applyPlateFit(rear, fit({ dx: 0.1 })).p[0], -0.1);
  near(applyPlateFit(rear, fit({ dy: 0.1 })).p[1], 0.9);
});

test("on a leaning surface up and out follow the plate, not the world", () => {
  const lean: PlateMount = { end: "front", p: [0, 0.5, 2], rot: plateRotation("front", Math.sin(0.4)) };
  const up = new Vector3(...applyPlateFit(lean, fit({ dy: 0.1 })).p).sub(new Vector3(...lean.p));
  const plateUp = axis(lean.rot, [0, 1, 0]);
  const normal = axis(lean.rot, [0, 0, 1]);
  near(up.dot(normal), 0, "up stays in the plate's plane");
  near(up.dot(plateUp), 0.1);
  const out = new Vector3(...applyPlateFit(lean, fit({ dz: 0.1 })).p).sub(new Vector3(...lean.p));
  near(out.dot(normal), 0.1);
});

test("tilt turns the plate about its own horizontal axis: its top goes outward, its sides stay put", () => {
  const t = applyPlateFit(front, fit({ tilt: 10 }));
  const normal = axis(t.rot, [0, 0, 1]);
  near(normal.y, -Math.sin(Math.PI / 18), "face turns down");
  near(normal.x, 0);
  const side = axis(t.rot, [1, 0, 0]);
  near(side.x, 1, "the horizontal axis is unchanged");
  const top = axis(t.rot, [0, 1, 0]);
  assert.ok(top.z > 0, "the top leans out");
  // the same at the back, where outward is -z
  const b = applyPlateFit(rear, fit({ tilt: 10 }));
  assert.ok(axis(b.rot, [0, 1, 0]).z < 0, "the top leans out at the back too");
  assert.deepEqual(applyPlateFit(front, fit({ tilt: 10 })).p, front.p, "tilting does not move the plate's centre");
});

test("turn swings the face about the plate's vertical axis; size and hidden are passed on", () => {
  const t = applyPlateFit(front, fit({ yaw: 20, scale: 1.4, hidden: true }));
  near(axis(t.rot, [0, 0, 1]).x, Math.sin((20 * Math.PI) / 180), "face turns toward the viewer's right");
  near(axis(t.rot, [0, 1, 0]).y, 1, "the vertical axis stays");
  assert.equal(t.scale, 1.4);
  assert.equal(t.hidden, true);
});

test("the plate holder of a procedural car stays only while the plate stays on it", () => {
  assert.equal(holderStays(undefined), true);
  assert.equal(holderStays(fit({ dy: 0.01 })), true);
  assert.equal(holderStays(fit({ dy: 0.1 })), false);
  assert.equal(holderStays(fit({ dx: 0.2 })), false);
  assert.equal(holderStays(fit({ scale: 1.5 })), false);
  assert.equal(holderStays(fit({ hidden: true })), false);
});

test("the remembered map keeps only model ids with usable fits, is capped, and is read by own keys", () => {
  const map = cleanFitMap({
    carmodel_abc: { rear: { dy: 0.05 }, front: "junk" },
    "car_generic_suv": { front: { hidden: true } },
    "bad key!": { rear: { dy: 0.1 } },
    empty: { rear: {} },
    notObject: 5,
    ["__proto__x"]: null,
  });
  assert.deepEqual(Object.keys(map).sort(), ["car_generic_suv", "carmodel_abc"]);
  assert.deepEqual(map.carmodel_abc, { rear: fit({ dy: 0.05 }) });
  assert.equal(fitsOfModel(map, "constructor"), undefined);
  assert.equal(fitsOfModel(map, "toString"), undefined);
  for (const bad of [null, undefined, 3, "x", [1, 2]]) assert.deepEqual(cleanFitMap(bad), {});
  const many = Object.fromEntries(Array.from({ length: 500 }, (_, i) => [`m${i}`, { rear: { dy: 0.01 } }]));
  assert.equal(Object.keys(cleanFitMap(many)).length, 64);
  assert.ok(JSON.stringify(cleanFitMap(many)).length < 16 * 1024, "stays tiny against the 256 KB limit");
});

test("a model is remembered by its real model's id, or by the catalogue id while the car is the built-in shape", () => {
  assert.equal(plateModelKey("car_generic_suv", "carmodel-edc994ad-cdjk2t"), "carmodel-edc994ad-cdjk2t");
  assert.equal(plateModelKey("car_generic_suv", undefined), "car_generic_suv");
});

test("a guest link keeps a car's plate placement (it is cosmetic) and it still reads back", () => {
  const text = encodePlateFit(fit({ dx: -0.125, dy: 0.085, scale: 1.2, hidden: false, tilt: -4 }))!;
  const { plan } = guestPlan({ walls: [], items: [{ id: "c", kind: "car_generic_suv", x: 1, y: 1, rot: 0, w: 2, d: 4, h: 1.6, params: { plate: "AB 123", plateFront: text, plateRear: "0 0 0 0 0 100 1" } }] }, { location: false, live: false });
  assert.equal(plan.items[0].params?.plateFront, text);
  assert.deepEqual(itemPlateFits(plan.items[0].params).rear, fit({ hidden: true }));
  assert.equal(itemPlateFits(plan.items[0].params).front?.dy, 0.085);
});

test("a plan file written and read back keeps the placement, and a car whose text was hand-edited to nonsense falls back to automatic", () => {
  const plan = { walls: [], openings: [], rooms: [], items: [{ id: "c", kind: "car_generic_suv", params: { plateRear: "-10 150 0 -15 0 135 0", plateFront: "oops" } }] };
  const back = splitPlanFile(JSON.parse(JSON.stringify({ ...plan, custom: null }))).plan;
  assert.deepEqual(itemPlateFits(back.items[0].params), { rear: fit({ dx: -0.01, dy: 0.15, tilt: -15, scale: 1.35 }) });
});
