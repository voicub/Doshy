import test from "node:test";
import assert from "node:assert/strict";
import {
  arrivalStepOf, arrivalStepsOf, choreographiesOf, choreographyOf, duplicateChoreography, MAX_ARRIVAL_STEPS, MAX_CHOREOGRAPHIES, MAX_SEQUENCE_MS, MAX_STEP_DELAY_MS, removeChoreographyFrom,
  saveChoreographyIn, sequenceMs, withChoreographies, type Choreography,
} from "./arrival.ts";
import { checkPlan } from "./db/planDoc.ts";
import { PLAN } from "./sceneFixture.ts";

const welcome = (over: Partial<Choreography> = {}): Choreography => ({
  id: "c1",
  name: "Evening",
  kind: "arrival",
  entrance: { openingId: "front" },
  steps: [{ entity: "light.living_main", on: true, brightness: 60, delayMs: 0 }, { entity: "light.kitchen_ceiling", on: true, delayMs: 1500 }],
  conditions: { onlyAfterDark: true, persons: ["person.anna"], offAfterMinutes: 10, motion: "binary_sensor.hall_motion" },
  ...over,
});

test("a step is a scene step plus a wait, clamped to a minute; anything that is not a usable step is dropped", () => {
  assert.deepEqual(arrivalStepOf({ entity: "light.a", on: true, brightness: 250, delayMs: 1500.4 }), { entity: "light.a", on: true, brightness: 100, delayMs: 1500 });
  assert.equal(arrivalStepOf({ entity: "light.a", on: true, delayMs: 999999 })?.delayMs, MAX_STEP_DELAY_MS);
  assert.equal(arrivalStepOf({ entity: "light.a", on: true, delayMs: -5 })?.delayMs, 0);
  assert.equal(arrivalStepOf({ entity: "light.a", on: true, delayMs: "soon" })?.delayMs, 0);
  assert.equal(arrivalStepOf({ entity: "lock.front_door", on: false }), null, "a lock is not something a step can name");
  assert.equal(arrivalStepOf({ entity: "cover.a" }), null);
  assert.equal(arrivalStepOf("light.a"), null);
});

test("a sequence has at most 30 steps and 5 minutes; a departure waits for nothing", () => {
  const many = Array.from({ length: 40 }, (_, i) => ({ entity: `light.l${i}`, on: true, delayMs: 100 }));
  assert.equal(arrivalStepsOf(many).length, MAX_ARRIVAL_STEPS);
  const slow = Array.from({ length: 10 }, (_, i) => ({ entity: `light.l${i}`, on: true, delayMs: MAX_STEP_DELAY_MS }));
  const kept = arrivalStepsOf(slow);
  assert.equal(kept.length, 5);
  assert.ok(sequenceMs(kept) <= MAX_SEQUENCE_MS);
  assert.ok(arrivalStepsOf(slow, false).every((s) => s.delayMs === 0));
});

test("a choreography is read clean: name, kind, entrance, people, zones and the off-again clause", () => {
  const c = choreographyOf({ ...welcome(), junk: 1, name: "  Evening\u0000  ", trigger: { zones: ["zone.gate", "zone.gate", "light.x"] }, away: { awayMinutes: 9 } });
  assert.ok(c);
  assert.equal(c.name, "Evening");
  assert.deepEqual(c.trigger, { zones: ["zone.gate"] });
  assert.equal("away" in c, false, "the goodbye settings are for departures only");
  assert.equal("junk" in c, false);
  assert.deepEqual(c.entrance, { openingId: "front" });
  assert.deepEqual(choreographyOf(welcome({ entrance: { x: -3, y: 2, level: "L0" } }))?.entrance, { x: -3, y: 2, level: "L0" });
  assert.equal(choreographyOf(welcome({ entrance: { x: Number.NaN, y: 0 } }))?.entrance, undefined);
  const odd = choreographyOf({ ...welcome(), conditions: { onlyAfterDark: "yes", persons: ["person.anna", "lock.front", "person.anna"], offAfterMinutes: 9999, motion: "light.x", debounceSeconds: -3 } });
  assert.deepEqual(odd?.conditions, { onlyAfterDark: true, persons: ["person.anna"], offAfterMinutes: 240, debounceSeconds: 0 });
  for (const bad of [null, {}, { ...welcome(), id: "bad id" }, { ...welcome(), name: "  " }, { ...welcome(), kind: "party" }]) assert.equal(choreographyOf(bad), null);
});

test("a departure keeps its goodbye settings with defaults, and a door reminder only with both a contact and a notify service", () => {
  const away = choreographyOf({ id: "d1", name: "Leaving", kind: "departure", steps: [{ entity: "light.a", on: false, delayMs: 5000 }], conditions: {}, away: { awayMinutes: 500, doorContact: "binary_sensor.front_door" } });
  assert.deepEqual(away?.away, { awayMinutes: 60, delayMinutes: 0 });
  assert.equal(away?.steps[0].delayMs, 0);
  assert.equal(away?.conditions.onlyAfterDark, false);
  const full = choreographyOf({ id: "d1", name: "Leaving", kind: "departure", steps: [], conditions: {}, away: { awayMinutes: 7, delayMinutes: 3, doorContact: "binary_sensor.front_door", notify: "notify.mobile_app_phone" } });
  assert.deepEqual(full?.away, { awayMinutes: 7, delayMinutes: 3, doorContact: "binary_sensor.front_door", notify: "notify.mobile_app_phone" });
});

test("a list keeps at most 12, ids unique; no list stays no list", () => {
  assert.equal(choreographiesOf(undefined), undefined);
  assert.equal(choreographiesOf("x"), undefined);
  const twice = choreographiesOf([welcome(), welcome({ name: "Again" }), { nope: true }]);
  assert.equal(twice?.length, 1);
  const lots = choreographiesOf(Array.from({ length: 20 }, (_, i) => welcome({ id: `c${i}` })));
  assert.equal(lots?.length, MAX_CHOREOGRAPHIES);
});

test("a loaded plan keeps clean choreographies as the same object, repairs dirty ones, and a plan without the field stays without it", () => {
  const plain = { ...PLAN };
  assert.equal(withChoreographies(plain), plain);
  assert.equal("choreographies" in withChoreographies(plain), false);
  const mine = saveChoreographyIn(PLAN, welcome());
  assert.equal(withChoreographies(mine), mine);
  const copy: unknown = JSON.parse(JSON.stringify(mine));
  assert.deepEqual(withChoreographies(copy as typeof mine).choreographies, mine.choreographies, "an exported and imported plan keeps them");
  const dirty = withChoreographies({ ...mine, choreographies: [...(mine.choreographies ?? []), { id: "z", name: "", kind: "arrival", steps: [] } as never] });
  assert.equal(dirty.choreographies?.length, 1);
  assert.deepEqual(JSON.parse(checkPlan(mine).json).choreographies, mine.choreographies, "the server keeps the field");
});

test("save, replace, remove and duplicate", () => {
  let p = saveChoreographyIn(PLAN, welcome());
  p = saveChoreographyIn(p, welcome({ name: "Renamed" }));
  assert.deepEqual(p.choreographies?.map((c) => c.name), ["Renamed"]);
  assert.equal(saveChoreographyIn(p, { ...welcome(), id: "bad id" }), p, "an unusable one changes nothing");
  const full = Array.from({ length: MAX_CHOREOGRAPHIES }, (_, i) => welcome({ id: `c${i}` })).reduce(saveChoreographyIn, PLAN);
  assert.equal(saveChoreographyIn(full, welcome({ id: "extra" })), full, "no 13th");
  assert.equal(saveChoreographyIn(full, welcome({ id: "c3", name: "Replaced" })).choreographies?.[3].name, "Replaced");
  const copy = duplicateChoreography(welcome(), "c2", ["Evening copy"]);
  assert.deepEqual([copy.id, copy.name], ["c2", "Evening 2"]);
  assert.equal(removeChoreographyFrom(p, "c1").choreographies?.length, 0);
  assert.equal(removeChoreographyFrom(p, "nope"), p);
});
