import test from "node:test";
import assert from "node:assert/strict";
import { CATALOG, CATEGORIES } from "./catalog.ts";
import { ANIMALS } from "./catalog.animals.ts";
import { bounds } from "./partKit.ts";
import { BEHAVIOUR, coatSwatches, critterParams, critterPresence, isAnimalKind } from "./critters.ts";

const TOL = 0.03; // metres a part may stick out of its footprint
const entries = Object.entries(ANIMALS);
const living = entries.filter(([, d]) => d.critter);

test("the Animals catalog has about sixty kinds, unique ids and labels, all in the shared catalog", () => {
  assert.ok(entries.length >= 60, `only ${entries.length} kinds`);
  const labels = new Set<string>();
  const bad: string[] = [];
  for (const [id, d] of entries) {
    if (!/^an_[a-z0-9_]+$/.test(id)) bad.push(`${id}: id format`);
    if (d.cat !== "Animals" || !CATEGORIES.includes(d.cat)) bad.push(`${id}: category ${d.cat}`);
    if (d.label.length < 3 || d.label.length > 70) bad.push(`${id}: label length`);
    if (labels.has(d.label)) bad.push(`${id}: duplicate label "${d.label}"`);
    labels.add(d.label);
    if (CATALOG[id] !== d) bad.push(`${id}: not in the shared catalog unchanged`);
  }
  assert.deepEqual(bad, []);
});

test("sizes are positive and every part sits inside its footprint, above the floor", () => {
  const bad: string[] = [];
  for (const [id, d] of entries) {
    if (!(d.w > 0 && d.d > 0 && d.h > 0) || d.parts.length < 3) bad.push(`${id}: size or parts`);
    for (const [i, p] of d.parts.entries()) if (!p.s.every((v) => v > 0 && Number.isFinite(v)) || !p.p.every(Number.isFinite)) bad.push(`${id} part ${i}: bad numbers`);
    const bb = bounds(d.parts);
    if (bb.x0 < -d.w / 2 - TOL || bb.x1 > d.w / 2 + TOL) bad.push(`${id}: wider than w ${d.w} (${bb.x0.toFixed(2)}..${bb.x1.toFixed(2)})`);
    if (bb.z0 < -d.d / 2 - TOL || bb.z1 > d.d / 2 + TOL) bad.push(`${id}: deeper than d ${d.d} (${bb.z0.toFixed(2)}..${bb.z1.toFixed(2)})`);
    if (bb.y0 < -TOL || bb.y1 > d.h + TOL) bad.push(`${id}: outside height ${d.h} (${bb.y0.toFixed(2)}..${bb.y1.toFixed(2)})`);
  }
  assert.deepEqual(bad, []);
});

test("sizes are realistic: a dog is not a horse", () => {
  const h = (id: string) => ANIMALS[id].h;
  assert.ok(h("an_dog_chihuahua") < h("an_dog_beagle") && h("an_dog_beagle") < h("an_dog_labrador"));
  assert.ok(h("an_hen") < 0.5 && h("an_horse") > 1.4 && h("an_cow") > 1.1 && h("an_cat") < 0.5);
  assert.ok(ANIMALS.an_dog_dachshund.d > ANIMALS.an_dog_dachshund.w * 2.5, "a dachshund is long");
});

test("every living animal has a coherent rig: bones own distinct parts, parents come first, a recolourable coat", () => {
  assert.ok(living.length >= 36, `${living.length} living animals`);
  const bad: string[] = [];
  for (const [id, d] of living) {
    const s = d.critter!;
    const owned = new Set<number>();
    s.bones.forEach((bn, i) => {
      if (bn.parent !== undefined && !(bn.parent >= 0 && bn.parent < i)) bad.push(`${id}: bone ${i} parent`);
      if (!bn.pivot.every(Number.isFinite)) bad.push(`${id}: bone ${i} pivot`);
      for (const pi of bn.parts) {
        if (!d.parts[pi]) bad.push(`${id}: bone ${i} part ${pi} missing`);
        if (owned.has(pi)) bad.push(`${id}: part ${pi} in two bones`);
        owned.add(pi);
      }
    });
    if (!d.parts.some((p) => p.m)) bad.push(`${id}: no recolourable coat`);
    const first = d.parts.find((p) => p.m)!;
    if (first.c.toLowerCase() !== s.coats[0].toLowerCase()) bad.push(`${id}: default coat ${first.c} vs ${s.coats[0]}`);
    if (!s.poses.includes("stand") || !s.coats.length || !/^#[0-9a-f]{6}$/i.test(s.coats[0])) bad.push(`${id}: poses or coats`);
    if (!s.bones.some((b) => b.role === "head")) bad.push(`${id}: no head`);
    if (BEHAVIOUR[s.kind] === undefined) bad.push(`${id}: kind ${s.kind}`);
    const legs = s.bones.filter((b) => b.role.startsWith("leg")).length;
    if (s.kind !== "fowl" && s.poses.length > 1 && legs !== 4) bad.push(`${id}: ${legs} legs`);
    if (s.sitDrop < 0 || s.lieDrop < 0 || !(s.r > 0)) bad.push(`${id}: sitDrop/lieDrop/r`);
  }
  assert.deepEqual(bad, []);
});

test("pose and wander params are read safely", () => {
  const dog = ANIMALS.an_dog_labrador.critter!;
  assert.deepEqual(critterParams(undefined, dog), { roam: 0, speed: 1, pose: "stand" });
  assert.equal(critterParams({ pose: "sit" }, dog).pose, "sit");
  assert.equal(critterParams({ pose: "lie" }, dog).pose, "lie");
  assert.equal(critterParams({ pose: "fly" }, dog).pose, "stand");
  assert.equal(critterParams({ pose: "lie" }, ANIMALS.an_hen.critter!).pose, "stand", "a hen has no lying pose");
  assert.equal(critterParams({ roam: 99, speed: 9 }, dog).roam, 6, "radius is capped");
  assert.equal(critterParams({ roam: 2, speed: 9 }, dog).speed, 2);
  assert.equal(critterParams({ roam: -1 }, dog).roam, 0);
  assert.equal(critterParams({ roam: 2 }, ANIMALS.an_parrot.critter!).roam, 0, "a perched parrot cannot wander");
});

test("pet houses: glow lamps only where a lamp is meant, pens exist, wire runs are open", () => {
  const lit = entries.filter(([, d]) => d.parts.some((p) => p.glow)).map(([k]) => k);
  for (const k of ["an_kennel_l", "an_coop_s", "an_coop_l"]) {
    assert.ok(lit.includes(k), `${k} has a lamp`);
    assert.ok(ANIMALS[k].light && ANIMALS[k].light!.y > 0 && ANIMALS[k].light!.y <= ANIMALS[k].h + TOL, `${k} light`);
  }
  for (const [k, d] of entries) if (d.light) assert.ok(d.parts.some((p) => p.glow), `${k}: light without glow part`);
  for (const k of ["an_chicken_run", "an_dog_run", "an_kennel_run", "an_rabbit_run"]) {
    const d = ANIMALS[k];
    assert.ok(d.w >= 1.5 && d.d >= 0.8, `${k} is big enough to live in`);
    const tallInside = d.parts.filter((p) => Math.abs(p.p[0]) < d.w / 2 - 0.3 && Math.abs(p.p[2]) < d.d / 2 - 0.3 && p.p[1] - p.s[1] / 2 > 0.05 && p.p[1] < 1.0);
    if (k === "an_chicken_run" || k === "an_dog_run") assert.deepEqual(tallInside.map((p) => p.p), [], `${k} interior is open`);
  }
});

test("animal ids and presence: only an_ pieces linked to a tracker get a home / away look", () => {
  assert.ok(isAnimalKind("an_cat") && !isAnimalKind("car_golf"));
  assert.equal(critterPresence("an_cat", "device_tracker.tractive_cat", "home"), "home");
  assert.equal(critterPresence("an_cat", "person.sam", "not_home"), "away");
  assert.equal(critterPresence("an_cat", "device_tracker.tractive_cat", "Garden"), undefined, "a named zone is neither");
  assert.equal(critterPresence("an_cat", "binary_sensor.feeder", "on"), undefined);
  assert.equal(critterPresence("an_cat", undefined, "home"), undefined);
  assert.equal(critterPresence("sofa", "device_tracker.x", "home"), undefined);
});

test("coat chips have unique names, so they can be keys", () => {
  for (const [id, d] of living) {
    const names = coatSwatches(d.critter!.coats).map((s) => s.name);
    assert.equal(new Set(names).size, names.length, `${id}: ${names.join(", ")}`);
  }
});
