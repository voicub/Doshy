import test from "node:test";
import assert from "node:assert/strict";
import type { HAState } from "./ha.ts";
import {
  badgeOf, baseOf, cycleEnded, glanceOf, isWashLike, numberOf, readyAbout, remainingWords, washColor, washdataFamilies, washdataOf, washView, WASH_COLOR,
  type WashState,
} from "./washdata.ts";

const e = (entity_id: string, state: string, attributes: HAState["attributes"] = {}, last_changed?: string): [string, HAState] => [entity_id, { entity_id, state, attributes, last_changed }];
const toStates = (list: [string, HAState][]): Record<string, HAState> => Object.fromEntries(list);

/** The owner's real washing machine (WashData 0.6.1), as GET /api/ha/states returned it: finished, plug entities beside it, no `options` yet. */
const B = "bathroom_washing_machine";
const real = (over: Record<string, string> = {}): Record<string, HAState> => {
  const list: [string, HAState][] = [
    e(`sensor.${B}_state`, "finished", { friendly_name: "Washing Machine State", device_class: "enum" }, "2026-11-22T17:16:13.403929+00:00"),
    e(`sensor.${B}_program`, "off", { friendly_name: "Washing Machine Program", device_class: "enum" }),
    e(`sensor.${B}_current_phase`, "unknown", { friendly_name: "Washing Machine Current Phase" }),
    e(`sensor.${B}_time_remaining`, "unknown", { friendly_name: "Washing Machine Time Remaining", unit_of_measurement: "min", device_class: "duration" }),
    e(`sensor.${B}_total_duration`, "unknown", { friendly_name: "Washing Machine Total Duration", unit_of_measurement: "min" }),
    e(`sensor.${B}_progress`, "100", { friendly_name: "Washing Machine Progress", unit_of_measurement: "%" }),
    e(`sensor.${B}_current_power`, "0.0", { friendly_name: "Washing Machine Current Power", unit_of_measurement: "W", device_class: "power" }),
    e(`sensor.${B}_elapsed_time`, "0.0", { friendly_name: "Washing Machine Elapsed Time", unit_of_measurement: "min" }),
    e(`sensor.${B}_suggested_settings_available`, "3", { friendly_name: "Washing Machine Suggested Settings Available" }),
    e(`sensor.${B}_cycle_count`, "1", { friendly_name: "Washing Machine Cycle Count", unit_of_measurement: "cycles" }),
    e(`sensor.${B}_energy_total`, "0.046", { friendly_name: "Washing Machine Energy Total", unit_of_measurement: "kWh" }),
    e(`sensor.${B}_last_cycle_duration`, "unknown", { unit_of_measurement: "min" }),
    e(`sensor.${B}_last_cycle_energy`, "unknown", { unit_of_measurement: "kWh" }),
    e(`sensor.${B}_last_cycle_cost`, "unknown", { unit_of_measurement: "RON" }),
    e(`sensor.${B}_last_cycle_start`, "unknown", {}),
    e(`binary_sensor.${B}_running`, "off", { friendly_name: "Washing Machine Running" }),
    e(`binary_sensor.${B}_maintenance_due`, "off", { friendly_name: "Washing Machine Maintenance due" }),
    e(`select.${B}_cycle_program`, "auto_detect", { friendly_name: "Washing Machine Cycle Program" }),
    e(`button.${B}_force_end_cycle`, "unknown", {}),
    e(`button.${B}_pause_cycle`, "unavailable", {}),
    e(`button.${B}_resume_cycle`, "unavailable", {}),
    e(`button.${B}_record_cycle_start`, "unavailable", {}),
    e(`button.${B}_record_cycle_stop`, "unavailable", {}),
    e(`button.${B}_mark_unloaded`, "unavailable", {}),
    // the plug under it: not part of the family
    e(`switch.${B}_switch`, "on", { friendly_name: "Bathroom washing machine switch" }),
    e(`sensor.${B}_switch_power`, "0", { unit_of_measurement: "W", device_class: "power" }),
    e(`sensor.${B}_switch_energy`, "3.19", { unit_of_measurement: "kWh" }),
    e(`select.${B}_switch_indicator_mode`, "off/on", {}),
    e("update.washdata", "off", { friendly_name: "WashData" }),
  ];
  const s = toStates(list);
  for (const [id, state] of Object.entries(over)) s[id] = { ...(s[id] ?? { entity_id: id, attributes: {} }), entity_id: id, state };
  return s;
};
/** `real()` with a state and a few readings set, like the other moments of a cycle. */
const at = (state: WashState, over: Record<string, string> = {}) => washView(real({ [`sensor.${B}_state`]: state, ...over }), B, NOW);
const NOW = Date.parse("2026-11-22T20:00:00");

test("the owner's real washing machine is found by its state sensor, named and anchored", () => {
  const fam = washdataFamilies(real());
  assert.equal(fam.length, 1);
  assert.equal(fam[0].base, B);
  assert.equal(fam[0].name, "Washing Machine");
  assert.equal(fam[0].kind, "washer");
  assert.equal(fam[0].anchor, `sensor.${B}_state`);
  assert.ok(fam[0].entities.includes(`button.${B}_mark_unloaded`) && fam[0].entities.includes(`select.${B}_cycle_program`));
  assert.ok(!fam[0].entities.some((x) => x.includes("_switch")), "the plug is not part of the family");
});

test("every WashData entity of the family resolves to the device; the plug and strangers do not", () => {
  const s = real();
  for (const id of Object.keys(s).filter((k) => k.includes(`${B}_`) && !k.includes("_switch"))) assert.equal(washdataOf(s, id)?.base, B, id);
  for (const id of [`switch.${B}_switch`, `sensor.${B}_switch_power`, `sensor.${B}_switch_energy`, `select.${B}_switch_indicator_mode`, "update.washdata", "light.kitchen", "sensor.outside_temperature"]) {
    assert.equal(washdataOf(s, id), undefined, id);
  }
  assert.equal(washdataOf(s, undefined), undefined);
  assert.equal(washdataOf({}, `sensor.${B}_state`), undefined, "an entity id alone is not a device: the family must exist");
});

test("baseOf takes the longest matching suffix and ignores other domains", () => {
  assert.equal(baseOf("sensor.a_b_last_cycle_energy"), "a_b");
  assert.equal(baseOf("sensor.a_total_duration"), "a");
  assert.equal(baseOf("binary_sensor.a_running"), "a");
  assert.equal(baseOf("sensor.a_running"), undefined, "running is a binary sensor");
  assert.equal(baseOf("sensor._state"), undefined);
  assert.equal(baseOf("sensor.state"), undefined);
  assert.equal(isWashLike("button.a_pause_cycle"), true);
  assert.equal(isWashLike("light.a_state"), false);
  assert.equal(isWashLike(undefined), false);
});

test("partial families count when three core entities exist; one or two stray sensors do not", () => {
  const s = toStates([
    e("sensor.dishwasher_state", "running", { friendly_name: "Dishwasher State" }),
    e("sensor.dishwasher_progress", "20"),
    e("binary_sensor.dishwasher_running", "on"),
    e("sensor.download_progress", "50"), // someone else's progress sensor
    e("sensor.download_state", "busy"),
    e("sensor.lonely_time_remaining", "5"),
  ]);
  assert.deepEqual(washdataFamilies(s).map((d) => d.base), ["dishwasher"]);
  assert.equal(washdataOf(s, "sensor.download_progress"), undefined);
  // no state sensor at all: still a device, anchored on what exists, named from another friendly name
  const noState = toStates([
    e("sensor.dryer_progress", "10", { friendly_name: "Tumble Dryer Progress" }),
    e("sensor.dryer_time_remaining", "30", { friendly_name: "Tumble Dryer Time Remaining" }),
    e("binary_sensor.dryer_running", "on"),
  ]);
  const [d] = washdataFamilies(noState);
  assert.equal(d.name, "Tumble Dryer");
  assert.equal(d.kind, "dryer");
  assert.ok(noState[d.anchor]);
  assert.equal(washView(noState, "dryer", NOW).state, "running", "no state sensor: the running sensor decides");
});

test("an appliance whose entities are all unavailable is still listed, and reads as not reporting", () => {
  const s = real();
  for (const id of Object.keys(s)) if (id.includes(`${B}_`) && !id.includes("_switch")) s[id] = { ...s[id], state: "unavailable" };
  assert.equal(washdataFamilies(s).length, 1);
  const v = washView(s, B, NOW);
  assert.equal(v.state, "unavailable");
  assert.equal(v.phase, "off");
  assert.equal(v.running, false);
  assert.equal(v.progress, undefined);
  assert.deepEqual(Object.values(v.controls).filter(Boolean), [], "no control is offered while everything is unavailable");
});

test("two appliances stay apart, and the kind comes from the name or what it reports", () => {
  const dish = (b: string, name: string, extra: [string, HAState][] = []) => [
    e(`sensor.${b}_state`, "idle", { friendly_name: `${name} State` }), e(`sensor.${b}_progress`, "0"), e(`binary_sensor.${b}_running`, "off"), ...extra,
  ];
  const s = toStates([...dish("kitchen_dishwasher", "Dishwasher"), ...dish("utility_dryer", "Tumble Dryer"), ...dish("garden", "Garden", [e("sensor.garden_pump_runs_last_24_h", "3")]), ...dish("hall", "Hall", [e("sensor.hall_program", "cotton_40")]), ...dish("wd", "Washer Dryer"), ...dish("mystery", "Mystery")]);
  const kinds = Object.fromEntries(washdataFamilies(s).map((d) => [d.base, d.kind]));
  assert.deepEqual(kinds, { kitchen_dishwasher: "dishwasher", utility_dryer: "dryer", garden: "pump", hall: "washer", wd: "washer", mystery: "other" });
  assert.deepEqual(washdataFamilies(s).map((d) => d.name), ["Dishwasher", "Garden", "Hall", "Mystery", "Tumble Dryer", "Washer Dryer"]);
  const anti = toStates([...dish("x1", "Machine"), e("sensor.x1_state", "anti_wrinkle", { friendly_name: "Machine State" })]);
  assert.equal(washdataFamilies(anti)[0].kind, "dryer");
});

test("numbers are parsed safely", () => {
  assert.equal(numberOf(undefined), undefined);
  for (const bad of ["unknown", "unavailable", "", "  ", "abc", "None", "NaN"]) assert.equal(numberOf({ entity_id: "sensor.x", state: bad, attributes: {} }), undefined, bad);
  assert.equal(numberOf({ entity_id: "sensor.x", state: "0.046", attributes: {} }), 0.046);
  assert.equal(numberOf({ entity_id: "sensor.x", state: "0", attributes: {} }), 0, "zero is a reading");
});

test("the real finished machine: done, 100 %, not 'laundry inside' (only clean is)", () => {
  const v = washView(real(), B, NOW);
  assert.equal(v.state, "finished");
  assert.equal(v.phase, "done");
  assert.equal(v.running, false);
  assert.equal(v.inCycle, false);
  assert.equal(v.loadInside, false);
  assert.equal(v.progress, 100);
  assert.equal(v.program, undefined, "'off' is no program");
  assert.equal(v.phaseName, undefined);
  assert.equal(v.remainingMin, undefined);
  assert.equal(v.readyAt, undefined);
  assert.equal(v.powerW, 0);
  assert.equal(v.cycleCount, 1);
  assert.equal(v.energyKwh, 0.046);
  assert.equal(v.suggestions, 3);
  assert.equal(v.maintenanceDue, false);
  assert.equal(v.lastCycle, undefined, "all last-cycle readings are unknown");
  assert.equal(v.finishedAt, Date.parse("2026-11-22T17:16:13.403929+00:00"));
  assert.deepEqual(v.programs, [], "the real select carried no options attribute yet");
  assert.equal(v.selectedProgram, "auto_detect");
  assert.deepEqual(v.controls, { pause: undefined, resume: undefined, forceEnd: `button.${B}_force_end_cycle`, markUnloaded: undefined, program: `select.${B}_cycle_program` });
  assert.equal(glanceOf(v, `sensor.${B}_state`), undefined, "a finished, emptied machine is no news");
});

test("running: 45 %, 32 min left, program and phase, expected finish, power", () => {
  const s = real({ [`sensor.${B}_state`]: "running", [`sensor.${B}_program`]: "Cotton 40", [`sensor.${B}_current_phase`]: "Rinse", [`sensor.${B}_time_remaining`]: "32", [`sensor.${B}_progress`]: "45", [`sensor.${B}_elapsed_time`]: "26", [`sensor.${B}_total_duration`]: "58", [`sensor.${B}_current_power`]: "412.5", [`binary_sensor.${B}_running`]: "on", [`button.${B}_pause_cycle`]: "unknown" });
  const v = washView(s, B, NOW);
  assert.equal(v.phase, "running");
  assert.equal(v.running, true);
  assert.equal(v.inCycle, true);
  assert.equal(v.program, "Cotton 40");
  assert.equal(v.phaseName, "Rinse");
  assert.equal(v.progress, 45);
  assert.equal(v.remainingMin, 32);
  assert.equal(v.elapsedMin, 26);
  assert.equal(v.totalMin, 58);
  assert.equal(v.powerW, 412.5);
  assert.equal(v.readyAt, NOW + 32 * 60_000);
  assert.equal(v.finishedAt, undefined);
  assert.equal(v.controls.pause, `button.${B}_pause_cycle`);
  assert.equal(v.controls.resume, undefined);
  assert.deepEqual([badgeOf(v).tone, badgeOf(v).pct, badgeOf(v).attention, badgeOf(v).calm], ["run", 45, false, false]);
  assert.equal(washColor(v), WASH_COLOR.run);
});

test("paused and paused by you: amber, the drum does not turn, the cycle is still under way", () => {
  for (const state of ["paused", "user_paused"] as const) {
    const v = at(state, { [`sensor.${B}_progress`]: "60", [`sensor.${B}_time_remaining`]: "20", [`button.${B}_resume_cycle`]: "unknown" });
    assert.equal(v.phase, "paused");
    assert.equal(v.running, false);
    assert.equal(v.inCycle, true);
    assert.equal(v.readyAt, undefined, "no finish time while paused");
    assert.equal(v.controls.resume, `button.${B}_resume_cycle`);
    assert.equal(badgeOf(v).tone, "paused");
    assert.equal(washColor(v), WASH_COLOR.paused);
  }
});

test("starting, ending and waiting for a start time", () => {
  const start = at("starting");
  assert.equal(start.running, true);
  const end = at("ending", { [`sensor.${B}_progress`]: "98" });
  assert.equal(end.phase, "running");
  assert.equal(end.running, false, "the drum rests while it waits to call the end");
  assert.equal(end.inCycle, true);
  const wait = at("delay_wait");
  assert.equal(wait.phase, "waiting");
  assert.equal(badgeOf(wait).tone, "paused");
  assert.equal(wait.running, false);
});

test("clean means the laundry is still inside: an attention badge and a glance, other done states are not", () => {
  const v = at("clean");
  assert.equal(v.loadInside, true);
  assert.equal(v.phase, "done");
  assert.deepEqual([badgeOf(v).tone, badgeOf(v).attention, badgeOf(v).calm], ["done", true, false]);
  assert.deepEqual([glanceOf(v, `sensor.${B}_state`)?.tone, glanceOf(v, `sensor.${B}_state`)?.entity], ["done", `sensor.${B}_state`]);
  assert.equal(washColor(v), WASH_COLOR.done);
  for (const s of ["finished", "anti_wrinkle", "idle", "off"] as const) assert.equal(at(s).loadInside, false, s);
});

test("plain finished and idle shrink to a dot in a busy scene; a cycle under way, laundry inside and problems never do", () => {
  for (const s of ["finished", "idle", "off", "unknown"] as const) assert.equal(badgeOf(at(s)).calm, true, s);
  for (const s of ["running", "starting", "ending", "paused", "user_paused", "delay_wait", "clean", "anti_wrinkle", "interrupted", "force_stopped"] as const) assert.equal(badgeOf(at(s)).calm, false, s);
});

test("anti-wrinkle: a dryer still tumbling, green and calm", () => {
  const v = at("anti_wrinkle");
  assert.equal(v.phase, "done");
  assert.equal(v.running, false);
  assert.deepEqual([badgeOf(v).tone, badgeOf(v).attention, badgeOf(v).calm], ["done", false, false]);
});

test("interrupted and force stopped are problems (red, attention); idle, off and unknown are muted", () => {
  for (const state of ["interrupted", "force_stopped"] as const) {
    const v = at(state);
    assert.equal(v.phase, "problem");
    assert.deepEqual([badgeOf(v).tone, badgeOf(v).attention], ["problem", true]);
    assert.equal(washColor(v), WASH_COLOR.problem);
    assert.equal(glanceOf(v, "x"), undefined);
  }
  for (const [state, phase] of [["idle", "idle"], ["off", "off"], ["unknown", "off"]] as const) {
    const v = at(state);
    assert.equal(v.phase, phase);
    assert.equal(badgeOf(v).tone, "muted");
  }
});

test("remaining time in plain words", () => {
  assert.equal(remainingWords(32), "32 min left");
  assert.equal(remainingWords(32.4), "32 min left");
  assert.equal(remainingWords(1), "1 min left");
  assert.equal(remainingWords(0.4), "Finishing");
  assert.equal(remainingWords(0), "Finishing");
  assert.equal(remainingWords(NaN), "Finishing");
  assert.equal(remainingWords(65), "1 h 05 min left");
  assert.equal(remainingWords(120), "2 h 00 min left");
  assert.equal(remainingWords(59.6), "1 h 00 min left");
  assert.equal(readyAbout(new Date(2026, 10, 22, 21, 45).getTime()), "ready about 21:45");
  assert.equal(readyAbout(new Date(2026, 10, 22, 7, 5).getTime()), "ready about 07:05");
});

test("the last cycle and totals: duration, energy, cost with its currency, start time", () => {
  const v = at("finished", { [`sensor.${B}_last_cycle_duration`]: "58", [`sensor.${B}_last_cycle_energy`]: "0.87", [`sensor.${B}_last_cycle_cost`]: "0.65", [`sensor.${B}_last_cycle_start`]: "2026-11-22T15:10:00+00:00" });
  assert.deepEqual(v.lastCycle, { minutes: 58, kwh: 0.87, cost: 0.65, currency: "RON", startedAt: Date.parse("2026-11-22T15:10:00+00:00") });
  const partial = at("finished", { [`sensor.${B}_last_cycle_energy`]: "0.5" });
  assert.deepEqual(partial.lastCycle, { kwh: 0.5 });
});

test("maintenance, programs and the program select (options only when the entity lists them)", () => {
  const s = real({ [`binary_sensor.${B}_maintenance_due`]: "on", [`select.${B}_cycle_program`]: "Cotton 40" });
  s[`select.${B}_cycle_program`] = { ...s[`select.${B}_cycle_program`], attributes: { options: ["auto_detect", "Cotton 40", "Eco 50", 3 as unknown as string] } };
  const v = washView(s, B, NOW);
  assert.equal(v.maintenanceDue, true);
  assert.deepEqual(v.programs, ["auto_detect", "Cotton 40", "Eco 50"]);
  assert.equal(v.selectedProgram, "Cotton 40");
  s[`select.${B}_cycle_program`] = { ...s[`select.${B}_cycle_program`], state: "unavailable" };
  assert.equal(washView(s, B, NOW).controls.program, undefined);
  assert.equal(washView(s, B, NOW).selectedProgram, undefined);
});

test("progress is clamped and a missing time left leaves the badge without one", () => {
  assert.equal(at("running", { [`sensor.${B}_progress`]: "130" }).progress, 100);
  assert.equal(at("running", { [`sensor.${B}_progress`]: "-4" }).progress, 0);
  const noTime = at("running", { [`sensor.${B}_progress`]: "30" });
  assert.equal(noTime.remainingMin, undefined);
});

test("a cycle ending is noticed once: only from a cycle under way into a done state, never on first sight", () => {
  const live: WashState[] = ["starting", "running", "paused", "user_paused", "ending"];
  const done: WashState[] = ["finished", "clean", "anti_wrinkle"];
  for (const a of live) for (const b of done) assert.equal(cycleEnded(a, b), true, `${a} -> ${b}`);
  assert.equal(cycleEnded(undefined, "finished"), false, "after a reload there is no earlier reading");
  assert.equal(cycleEnded("finished", "clean"), false);
  assert.equal(cycleEnded("finished", "anti_wrinkle"), false);
  assert.equal(cycleEnded("idle", "finished"), false);
  assert.equal(cycleEnded("running", "interrupted"), false);
  assert.equal(cycleEnded("running", "running"), false);
  assert.equal(cycleEnded("running", "unavailable"), false, "a dropped connection is not the end of the cycle");
  assert.equal(cycleEnded("unavailable", "finished"), false);
});
