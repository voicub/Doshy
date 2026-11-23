import test from "node:test";
import assert from "node:assert/strict";
import { CATALOG } from "./catalog.ts";
import { BEHAVIOUR, BODY_N, BONE_N, O_BREATH, O_RX, O_Y, animate, critterParams, initState, outSize, standable, stepCritter, type Box, type Cfg, type CritterState, type Place } from "./critters.ts";
import { hashStr } from "./mathUtil.ts";
import { buildWorld } from "./critterWorld.ts";
import type { Item, Plan } from "./types";

const dog = CATALOG.an_dog_labrador;
const spec = dog.critter!;
const cfgFor = (radius: number, over: Partial<Cfg> = {}): Cfg => ({ b: BEHAVIOUR.dog, spec, radius, speed: 1, pose: "stand", ...over });
const box = (x: number, z: number, hx: number, hz: number, ang = 0): Box => ({ x, z, hx, hz, c: Math.cos(ang), s: Math.sin(ang) });
const open = (over: Partial<Place> = {}): Place => ({ boxes: [], rooms: [], indoor: false, spots: [], shelters: [], ...over });
const DT = 1 / 30;

/** Run an animal for `seconds`, calling `each` every step. */
function run(s: CritterState, c: Cfg, p: Place | null, seconds: number, night = false, each?: (s: CritterState) => void) {
  for (let i = 0; i < seconds / DT; i++) {
    stepCritter(s, c, p, night, DT);
    each?.(s);
  }
}

test("a roaming animal never leaves its radius and never walks into a wall or furniture", () => {
  const r = 1.5;
  const place = open({ boxes: [box(0.9, 0.2, 0.05, 1.2), box(-0.6, -0.8, 0.4, 0.3, 0.5)] });
  const s = initState("dog-1");
  const c = cfgFor(r);
  let walked = 0;
  let last = { x: 0, z: 0 };
  run(s, c, place, 600, false, (st) => {
    assert.ok(Math.hypot(st.x, st.z) <= r + 0.02, `left the circle at ${st.x.toFixed(2)},${st.z.toFixed(2)}`);
    assert.ok(standable(place, r, 0, st.x, st.z), `inside an obstacle at ${st.x.toFixed(2)},${st.z.toFixed(2)}`);
    walked += Math.hypot(st.x - last.x, st.z - last.z);
    last = { x: st.x, z: st.z };
  });
  assert.ok(walked > 20, `it barely moved (${walked.toFixed(1)} m in ten minutes)`);
});

test("it stays inside its pen, and in its room when indoors, and out of rooms when outdoors", () => {
  const pen = box(0, 0, 0.8, 0.5);
  const s1 = initState("hen-pen");
  const c1 = { ...cfgFor(3), b: BEHAVIOUR.fowl };
  run(s1, c1, open({ pen }), 400, false, (st) => assert.ok(Math.abs(st.x) <= 0.8 && Math.abs(st.z) <= 0.5, "left the pen"));
  const room = box(0.5, 0, 1.5, 1.2);
  const s2 = initState("indoor");
  run(s2, cfgFor(3), open({ rooms: [room], indoor: true }), 400, false, (st) => assert.ok(Math.abs(st.x - 0.5) <= 1.5 && Math.abs(st.z) <= 1.2, "left the room"));
  const s3 = initState("outdoor");
  run(s3, cfgFor(3), open({ rooms: [box(0, 2.2, 3, 1.2)] }), 400, false, (st) => assert.ok(st.z < 1.1, "walked into the house"));
});

test("the same id walks the same way, different ids do not", () => {
  const place = open({ boxes: [box(0.7, 0, 0.1, 0.6)] });
  const trace = (id: string) => {
    const s = initState(id);
    const pts: number[] = [];
    run(s, cfgFor(2), place, 90, false, (st) => pts.push(Math.round(st.x * 1000), Math.round(st.z * 1000)));
    return pts.join(",");
  };
  assert.equal(trace("same"), trace("same"));
  assert.notEqual(trace("one"), trace("two"));
  assert.equal(hashStr("abc"), hashStr("abc"));
  assert.notEqual(hashStr("abc"), hashStr("abd"));
});

test("without a wander radius (or a place) it never moves, but it idles and forages in place", () => {
  const s = initState("still");
  const moods = new Set<string>();
  run(s, cfgFor(0), null, 200, false, (st) => {
    assert.equal(st.x, 0);
    assert.equal(st.z, 0);
    assert.notEqual(st.mood, "walk");
    moods.add(st.mood);
  });
  assert.ok(moods.has("idle") && moods.has("forage"), [...moods].join());
});

test("a chosen pose is held when it stays put, and a different pose is held after a change", () => {
  const s = initState("pose");
  run(s, cfgFor(0, { pose: "sit" }), null, 5);
  assert.ok(s.sit > 0.97 && s.lie < 0.03);
  run(s, cfgFor(0, { pose: "lie" }), null, 5);
  assert.ok(s.lie > 0.97 && s.sit < 0.03);
  run(s, cfgFor(0, { pose: "stand" }), null, 5);
  assert.ok(s.lie < 0.03 && s.sit < 0.03);
});

test("at night a roaming animal goes to its shelter and sleeps there; at dawn it gets up", () => {
  const kennel = { x: 1, z: -0.5, r: 0.4 };
  const place = open({ shelters: [kennel], spots: [kennel], boxes: [box(1, -0.5, 0.4, 0.5)] });
  const s = initState("sleepy");
  const c = cfgFor(2);
  run(s, c, place, 30, true);
  assert.equal(s.mood, "sleep");
  assert.ok(s.lie > 0.95, "lying down");
  assert.ok(Math.hypot(s.x - kennel.x, s.z - kennel.z) < kennel.r + spec.r + 0.6, `slept ${Math.hypot(s.x - kennel.x, s.z - kennel.z).toFixed(2)} m from the kennel`);
  const at = { x: s.x, z: s.z };
  run(s, c, place, 20, true);
  assert.deepEqual({ x: s.x, z: s.z }, at, "stays asleep");
  run(s, c, place, 6, false);
  assert.notEqual(s.mood, "sleep");
  assert.ok(s.lie < 0.5, "standing up");
});

test("it stops near a house or bowl it likes, not only at random spots", () => {
  const bowl = { x: 1.2, z: 0.6, r: 0.15 };
  const s = initState("bowl");
  let near = 0;
  run(s, cfgFor(2), open({ spots: [bowl] }), 600, false, (st) => {
    if (st.mood !== "walk" && Math.hypot(st.x - bowl.x, st.z - bowl.z) < bowl.r + spec.r + 0.5) near++;
  });
  assert.ok(near > 30, `rarely by the bowl (${near} frames)`);
});

test("chickens drift towards their flock", () => {
  const flock = { x: 1.2, z: 0 };
  const c = { ...cfgFor(2), b: BEHAVIOUR.fowl };
  let sum = 0;
  let n = 0;
  for (const id of ["a", "b", "c", "d"]) {
    const s = initState(id);
    run(s, c, open({ flock }), 300, false, (st) => {
      sum += st.x;
      n++;
    });
  }
  assert.ok(sum / n > 0.25, `mean x ${(sum / n).toFixed(2)}`);
});

test("it walks on legs that swing, in diagonal pairs, and bobs; it breathes when still", () => {
  const s = initState("legs");
  const out = new Float32Array(outSize(spec));
  const c = cfgFor(2);
  const idx = (role: string) => spec.bones.findIndex((b) => b.role === role);
  let swing = 0;
  s.mood = "walk"; // set off straight ahead
  s.tx = 0;
  s.tz = 1.8;
  s.left = 99;
  run(s, c, open(), 2, false, (st) => {
    if (st.mood !== "walk" || st.walk < 0.9) return;
    animate(spec, c, st, 5, out, false);
    const a = out[BODY_N + idx("legFL") * BONE_N];
    const d = out[BODY_N + idx("legBR") * BONE_N];
    const o = out[BODY_N + idx("legFR") * BONE_N];
    assert.ok(Math.abs(a - d) < 1e-5 && Math.abs(a + o) < 1e-5, "diagonal pairs move together");
    swing = Math.max(swing, Math.abs(a));
  });
  assert.ok(swing > 0.3, `legs barely swing (${swing})`);
  const still = initState("breath");
  animate(spec, c, still, 1, out, false);
  const b1 = out[O_BREATH];
  animate(spec, c, still, 1.6, out, false);
  assert.notEqual(b1, out[O_BREATH]);
  assert.ok(Math.abs(out[O_BREATH] - 1) < 0.03);
});

test("sitting tilts the body back and sinks the haunches; lying sinks further; legs fold", () => {
  const out = new Float32Array(outSize(spec));
  const s = initState("sit");
  animate(spec, cfgFor(0), s, 0, out, true);
  assert.equal(out[O_RX], -0);
  assert.equal(out[O_Y], 0);
  s.sit = 1;
  animate(spec, cfgFor(0), s, 0, out, true);
  assert.ok(out[O_RX] < -0.4, "front rises");
  const [hy, hz] = spec.hip;
  const hipY = out[O_Y] + hy * Math.cos(out[O_RX]) - hz * Math.sin(out[O_RX]); // where the tilt pivot ends up
  assert.ok(Math.abs(hipY - (hy - spec.sitDrop)) < 1e-4 && spec.sitDrop > 0.1, "haunches sink");
  const hind = BODY_N + spec.bones.findIndex((b) => b.role === "legBL") * BONE_N;
  assert.ok(out[hind + 3] < 0.8, "hind legs shortened");
  s.sit = 0;
  s.lie = 1;
  animate(spec, cfgFor(0), s, 0, out, true);
  assert.ok(out[O_Y] < -0.15 && Math.abs(out[O_RX]) < 1e-6);
  const hen = CATALOG.an_hen.critter!;
  const out2 = new Float32Array(outSize(hen));
  const h = initState("hen");
  h.sit = 1;
  animate(hen, { b: BEHAVIOUR.fowl, spec: hen, radius: 0, speed: 1, pose: "sit" }, h, 0, out2, true);
  assert.ok(out2[O_Y] < -0.05, "a sitting hen sinks onto her legs");
});

test("reduced motion: only the pose, nothing else moves", () => {
  const out = new Float32Array(outSize(spec));
  const s = initState("calm");
  s.mood = "forage";
  s.walk = 1;
  s.phase = 1;
  const c = cfgFor(2);
  animate(spec, c, s, 3.7, out, true);
  assert.equal(out[O_BREATH], 1);
  for (let i = 0; i < spec.bones.length; i++) {
    const o = BODY_N + i * BONE_N;
    if (!spec.bones[i].role.startsWith("leg")) assert.deepEqual([out[o] + 0, out[o + 1] + 0, out[o + 2] + 0, out[o + 3]], [0, 0, 0, 1], spec.bones[i].role);
    else assert.equal(out[o], 0, "legs do not swing");
  }
});

test("thirty animals cost well under a millisecond a frame", () => {
  const place = open({ boxes: [box(0.9, 0.2, 0.05, 1.2), box(-0.6, -0.8, 0.4, 0.3, 0.5)], spots: [{ x: 1, z: 1, r: 0.3 }] });
  const names = Object.keys(CATALOG).filter((k) => CATALOG[k].critter).slice(0, 30);
  const crowd = names.map((k, i) => ({ s: initState(`id${i}`), sp: CATALOG[k].critter!, k }));
  const outs = crowd.map((a) => new Float32Array(outSize(a.sp)));
  const cs = crowd.map((a) => ({ b: BEHAVIOUR[a.sp.kind], spec: a.sp, radius: 1.5, speed: 1, pose: "stand" as const }));
  // Fastest of several batches: machine load only ever adds time, so the minimum is the cost of the code itself.
  const frames = 100;
  let best = Infinity;
  for (let batch = 0; batch < 7; batch++) {
    const t0 = performance.now();
    for (let f = 0; f < frames; f++) for (let i = 0; i < crowd.length; i++) {
      stepCritter(crowd[i].s, cs[i], place, false, DT);
      animate(crowd[i].sp, cs[i], crowd[i].s, f * DT, outs[i], false);
    }
    best = Math.min(best, (performance.now() - t0) / frames);
  }
  assert.ok(best < 0.6, `${best.toFixed(3)} ms per frame for ${crowd.length} animals`);
});

// ---------- reading the plan ----------

const wallOf = (id: string, ax: number, ay: number, bx: number, by: number) => ({ id, a: { x: ax, y: ay }, b: { x: bx, y: by }, style: "plaster" as const });
const itemOf = (o: Partial<Item> & { id: string; kind: string }): Item => ({ x: 0, y: 0, rot: 0, w: 1, d: 1, h: 1, ...o });
const planOf = (items: Item[], extra: Partial<Plan> = {}): Plan => ({ walls: [], openings: [], rooms: [], items, ...extra }) as Plan;

test("the world is read in the animal's own frame: a wall in front is in front, whatever the dog's rotation", () => {
  const home = itemOf({ id: "d", kind: "an_dog_labrador", x: 5, y: 5, rot: 0 });
  const wall = wallOf("w", 3, 6, 7, 6); // 1 m south of the dog (plan y grows south, the item's front is +z = south at rot 0)
  const near = buildWorld(planOf([home], { walls: [wall] }), home, spec, 2, CATALOG);
  assert.equal(near.boxes.length, 1);
  assert.ok(Math.abs(near.boxes[0].z - 1) < 1e-6 && Math.abs(near.boxes[0].x) < 1e-6);
  const turned = { ...home, rot: 90 }; // turned a quarter: its front now points west, so the south wall is on its left (+x or -x)
  const b2 = buildWorld(planOf([turned], { walls: [wall] }), turned, spec, 2, CATALOG).boxes[0];
  assert.ok(Math.abs(b2.z) < 1e-6 && Math.abs(Math.abs(b2.x) - 1) < 1e-6, `${b2.x}, ${b2.z}`);
  assert.equal(standable(near, 2, 0.2, 0, 0.9), false, "touching the wall");
  assert.equal(standable(near, 2, 0.2, 0, 0.5), true);
});

test("the world has solid furniture, but not rugs, shelves above the floor, or other animals; a run is a pen; a kennel is a shelter", () => {
  const home = itemOf({ id: "d", kind: "an_dog_labrador", x: 0, y: 0 });
  const items = [
    home,
    itemOf({ id: "sofa", kind: "dining_table", x: 1, y: 0, w: 2, d: 0.9, h: 0.8 }),
    itemOf({ id: "rug", kind: "dc_rug_round_120", x: -1, y: 0, w: 1, d: 1, h: 0.02 }),
    itemOf({ id: "cat", kind: "an_cat", x: 0.5, y: 0.5, w: 0.3, d: 0.5, h: 0.3 }),
    itemOf({ id: "lifted", kind: "dining_table", x: 0, y: 1, w: 0.5, d: 0.5, h: 0.9, elev: 0.75 }),
    itemOf({ id: "k", kind: "an_kennel_m", x: 0, y: 1.5, w: 0.7, d: 1, h: 0.8 }),
  ].filter((i) => CATALOG[i.kind]);
  const w = buildWorld(planOf(items), home, spec, 2, CATALOG);
  const ids = w.boxes.length;
  assert.ok(ids >= 2, `sofa and kennel block, got ${ids}`);
  assert.equal(standable(w, 2, 0, -1, 0), true, "walks over the rug");
  assert.equal(standable(w, 2, 0, 0.5, 0.5), true, "another animal is not a wall");
  assert.ok(w.shelters.length === 1 && w.spots.length === 1, "the kennel is a shelter and a spot");
  const hen = itemOf({ id: "h", kind: "an_hen", x: 0, y: 0, w: 0.3, d: 0.4, h: 0.4 });
  const run = itemOf({ id: "r", kind: "an_chicken_run", x: 0, y: 0, w: 3, d: 2, h: 1.8 });
  const penned = buildWorld(planOf([hen, run]), hen, CATALOG.an_hen.critter!, 2, CATALOG);
  assert.ok(penned.pen && Math.abs(penned.pen.hx - 1.5) < 1e-6 && Math.abs(penned.pen.hz - 1) < 1e-6);
  assert.equal(penned.boxes.length, 0, "the pen is not an obstacle");
});

test("an animal inside a room stays indoors; one on a lawn stays out of the house", () => {
  const room = { id: "r", name: "Living", x: 0, y: 0, w: 4, h: 3, color: "#fff", floor: "wood" as const };
  const inside = itemOf({ id: "d1", kind: "an_dog_labrador", x: 2, y: 1.5 });
  const outside = itemOf({ id: "d2", kind: "an_dog_labrador", x: 6, y: 1.5 });
  const a = buildWorld(planOf([inside], { rooms: [room] }), inside, spec, 2, CATALOG);
  const b = buildWorld(planOf([outside], { rooms: [room] }), outside, spec, 2, CATALOG);
  assert.equal(a.indoor, true);
  assert.equal(b.indoor, false);
  assert.equal(standable(b, 2, 0.1, -3, 0), false, "that is the living room");
  assert.equal(standable(b, 2, 0.1, 1, 0), true);
});

test("critter params and the spec default radius", () => {
  assert.equal(BEHAVIOUR.dog.roam, 1.5);
  assert.equal(BEHAVIOUR.fowl.roam, 1.5);
  assert.equal(critterParams({ roam: 1.5 }, spec).roam, 1.5);
});

test("garden ponds (Plan.ground water) are walked around, except by ducks", () => {
  const home = itemOf({ id: "d", kind: "an_dog_labrador", x: 0, y: 0 });
  const pond = { id: "p", x: 0.5, y: -0.5, w: 1.5, h: 1, kind: "water" as const };
  const w = buildWorld(planOf([home], { ground: [pond] }), home, spec, 2, CATALOG);
  assert.equal(standable(w, 2, 0, 1.2, 0), false, "in the pond");
  assert.equal(standable(w, 2, 0, -0.5, 0), true);
  const duck = itemOf({ id: "k", kind: "an_duck", x: 0, y: 0 });
  assert.equal(standable(buildWorld(planOf([duck], { ground: [pond] }), duck, CATALOG.an_duck.critter!, 2, CATALOG), 2, 0, 1.2, 0), true, "a duck swims");
});
