import test from "node:test";
import assert from "node:assert/strict";
import { clock, familyOf, powerSensorFor, pushWatts, runStatus, suggestPlugs, suggestRunAbove, thresholdsFor, toWatts, type RunInput, type Sample } from "./running.ts";

const runState = (input: RunInput) => runStatus(input).state;

const S = 1000;
const MIN = 60 * S;
const NOW = 1_000_000_000_000;
/** Readings every `step` seconds from `from` to `to` (seconds before NOW), all at watts w. */
const span = (fromS: number, toS: number, w: number, step = 10): Sample[] => {
  const out: Sample[] = [];
  for (let s = fromS; s >= toS; s -= step) out.push({ t: NOW - s * S, w });
  return out;
};
const washer = thresholdsFor("washer");

test("families come from the kind or label", () => {
  assert.equal(familyOf("ap_washer_front"), "washer");
  assert.equal(familyOf("ap_dryer"), "dryer");
  assert.equal(familyOf("Tumble dryer"), "dryer");
  assert.equal(familyOf("ap_dishwasher_slim"), "dishwasher");
  // the owner's catalog kinds: the bathroom washer, the dishwashers and the stacked washer-dryer
  assert.equal(familyOf("bt_washer Washing machine, front load"), "washer");
  assert.equal(familyOf("washer Washing machine"), "washer");
  assert.equal(familyOf("ap_dishwasher Dishwasher"), "dishwasher");
  assert.equal(familyOf("ap_dishwasher_integrated Dishwasher, hidden behind a door"), "dishwasher");
  assert.equal(familyOf("ap_washer_dryer_tower Washer and dryer stacked"), "dryer");
  assert.equal(familyOf("kt_kettle"), "kettle");
  assert.equal(familyOf("of_printer_3d"), "printer");
  assert.equal(familyOf("ap_tv_wall"), "tv");
  assert.equal(familyOf("sofa"), "generic");
  assert.equal(familyOf("stool"), "generic"); // "tv" must not match inside other words
});

test("without any history the live watts decide", () => {
  assert.equal(runState({ powerW: 400, thresholds: washer, now: NOW }), "running");
  assert.equal(runState({ powerW: 3, thresholds: washer, now: NOW }), "standby");
  assert.equal(runState({ powerW: 0.2, thresholds: washer, now: NOW }), "off");
  assert.equal(runState({ powerW: 400, switchOn: false, thresholds: washer, now: NOW }), "off");
  assert.equal(runState({ powerW: null, thresholds: washer, now: NOW }), "off");
});

test("a short spike does not count as running, a sustained draw does", () => {
  const spike = [...span(120, 100, 2), { t: NOW - 90 * S, w: 500 }, { t: NOW - 80 * S, w: 2 }];
  assert.equal(runState({ powerW: 2, thresholds: washer, history: spike, now: NOW }), "standby");
  const sustained = [...span(120, 100, 2), ...span(90, 10, 500)];
  assert.equal(runStatus({ powerW: 500, thresholds: washer, history: sustained, now: NOW }).state, "running");
});

test("running reports when it started", () => {
  const h = [...span(300, 200, 2), ...span(190, 10, 450)];
  const r = runStatus({ powerW: 450, thresholds: washer, history: h, now: NOW });
  assert.equal(r.state, "running");
  assert.equal(r.startedAt, NOW - 190 * S);
});

test("a pause shorter than the gap keeps the run going; hysteresis keeps a wobble at the edge running", () => {
  const h = [...span(1200, 600, 300), ...span(590, 400, 2), ...span(390, 10, 300)];
  assert.equal(runState({ powerW: 300, thresholds: washer, history: h, now: NOW }), "running");
  const edge = [...span(600, 300, 100), ...span(290, 10, 17)]; // 17 W is above 80% of 20 W
  assert.equal(runState({ powerW: 17, thresholds: washer, history: edge, now: NOW }), "running");
});

test("a long cycle that ends is finished, then clears after the hold time", () => {
  const cycle = span(40 * 60 + 600, 600, 300); // 40 minutes of washing, ended 10 minutes ago
  const done = runStatus({ powerW: 1, thresholds: washer, history: [...cycle, ...span(590, 10, 1)], now: NOW });
  assert.equal(done.state, "finished");
  assert.equal(done.endedAt, NOW - 600 * S);
  const late = runState({ powerW: 1, thresholds: washer, history: cycle, now: NOW + 25 * MIN });
  assert.equal(late, "standby");
});

test("a run shorter than the minimum cycle is not 'finished'", () => {
  const brief = [...span(900, 780, 300), ...span(770, 10, 1)];
  assert.equal(runState({ powerW: 1, thresholds: washer, history: brief, now: NOW }), "standby");
});

test("switching the plug off ends the run at once", () => {
  const h = span(30 * 60, 10, 300);
  assert.equal(runState({ powerW: 0, switchOn: false, thresholds: washer, history: h, now: NOW }), "finished");
  const short = span(120, 10, 300);
  assert.equal(runState({ powerW: 0, switchOn: false, thresholds: washer, history: short, now: NOW }), "off");
});

test("a kettle is running the moment it draws 2 kW, a TV never reads finished", () => {
  const kettle = thresholdsFor("kettle");
  assert.equal(runState({ powerW: 2000, thresholds: kettle, history: span(60, 10, 1), now: NOW }), "running");
  const tv = thresholdsFor("tv");
  const h = [...span(7200, 600, 80, 60), ...span(590, 10, 0.6, 60)];
  assert.equal(runState({ powerW: 0.6, thresholds: tv, history: h, now: NOW }), "standby");
});

test("the user's 'running above' overrides the family default", () => {
  assert.equal(thresholdsFor("washer", 150).runAbove, 150);
  assert.equal(runState({ powerW: 100, thresholds: thresholdsFor("washer", 150), now: NOW }), "standby");
  assert.equal(thresholdsFor("washer", 0).runAbove, 20);
});

test("watts from kW and mW, and bad states", () => {
  assert.equal(toWatts("1.5", "kW"), 1500);
  assert.equal(toWatts("500", "mW"), 0.5);
  assert.equal(toWatts("42", "W"), 42);
  assert.equal(toWatts("unavailable", "W"), null);
  assert.equal(toWatts("", "W"), null);
});

test("the buffer keeps recent readings only and replaces a same-instant one", () => {
  let b: Sample[] = [];
  b = pushWatts(b, 1000, 5, 5000);
  b = pushWatts(b, 3000, 6, 5000);
  b = pushWatts(b, 3000, 7, 5000);
  assert.deepEqual(b, [{ t: 1000, w: 5 }, { t: 3000, w: 7 }]);
  b = pushWatts(b, 9000, 8, 5000);
  assert.deepEqual(b, [{ t: 9000, w: 8 }]);
});

test("clock formats minutes:seconds and hours", () => {
  assert.equal(clock(42_000), "0:42");
  assert.equal(clock(3_729_000), "1:02:09");
});

test("suggested threshold: the family default, or half the peak for a small appliance", () => {
  assert.equal(suggestRunAbove("washer", [2, 400, 300]), 20);
  assert.equal(suggestRunAbove("tv", [1, 12, 14]), 7);
  assert.equal(suggestRunAbove("tv", []), 30);
});

const ent = (entity_id: string, state: string, attributes: Record<string, string> = {}) => ({ entity_id, state, attributes });
const world = Object.fromEntries(
  [
    ent("switch.washing_machine", "on", { friendly_name: "Washing machine" }),
    ent("sensor.washing_machine_power", "2", { unit_of_measurement: "W" }),
    ent("sensor.washing_machine_energy", "5", { unit_of_measurement: "kWh" }),
    ent("switch.kettle_plug", "off", { friendly_name: "Kitchen kettle" }),
    ent("sensor.kettle_power", "0", { device_class: "power", unit_of_measurement: "kW" }),
    ent("switch.hall_light", "on", { friendly_name: "Hall light" }),
    ent("switch.old_washer", "unavailable", { friendly_name: "Old washer" }),
  ].map((e) => [e.entity_id, e]),
);

test("a plug's power sensor is found by entity-id stem", () => {
  assert.equal(powerSensorFor("switch.washing_machine", world), "sensor.washing_machine_power");
  assert.equal(powerSensorFor("switch.kettle_plug", world), "sensor.kettle_power");
  assert.equal(powerSensorFor("switch.hall_light", world), undefined);
});

test("plug suggestions: hint matches only, best first, unavailable and unrelated switches left out", () => {
  const hints = [{ word: "washing", weight: 10 }, { word: "kitchen", weight: 2 }];
  assert.deepEqual(suggestPlugs(world, hints).map((c) => c.plug), ["switch.washing_machine", "switch.kettle_plug"]);
  assert.equal(suggestPlugs(world, hints)[0].power, "sensor.washing_machine_power");
  assert.deepEqual(suggestPlugs(world, []), []);
});
