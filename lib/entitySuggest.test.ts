import test from "node:test";
import assert from "node:assert/strict";
import { domainChips, domainsForCategory, MAX_RECENT, offersWashdata, pushRecent, rankEntities, washdataOptions, type Candidate } from "./entitySuggest.ts";
import type { HAState } from "./ha.ts";

const c = (id: string, name: string, areaId: string | null = null): Candidate => ({ id, name, area: areaId, areaId });
const ALL = [
  c("switch.fan", "Fan plug", "living"),
  c("light.sofa", "Sofa lamp", "living"),
  c("light.bed", "Bed lamp", "bedroom"),
  c("sensor.temp", "Temperature", "living"),
  c("light.hall", "Hall light"),
];
const base = { prefer: ["living"], fit: ["light", "switch"], recent: [] as string[], query: "", domain: null };

test("entities in the item's room are suggested, lights first when lights fit", () => {
  const r = rankEntities(ALL, base);
  assert.deepEqual(r.suggested.map((x) => x.id), ["light.sofa", "switch.fan", "sensor.temp"]);
  assert.deepEqual(r.rest.map((x) => x.id), ["light.bed", "light.hall"]);
  assert.deepEqual(r.recent, []);
});

test("recent picks come first in recent order and are not repeated below", () => {
  const r = rankEntities(ALL, { ...base, recent: ["light.hall", "light.sofa", "gone.entity"] });
  assert.deepEqual(r.recent.map((x) => x.id), ["light.hall", "light.sofa"]);
  assert.ok(![...r.suggested, ...r.rest].some((x) => x.id === "light.hall" || x.id === "light.sofa"));
});

test("search matches id, name and area words; a domain chip narrows further", () => {
  assert.deepEqual(rankEntities(ALL, { ...base, query: "lamp" }).rest.map((x) => x.id), ["light.bed"]);
  assert.deepEqual(rankEntities(ALL, { ...base, query: "living lamp" }).suggested.map((x) => x.id), ["light.sofa"]);
  const r = rankEntities(ALL, { ...base, domain: "light" });
  assert.deepEqual([...r.suggested, ...r.rest].map((x) => x.id), ["light.sofa", "light.bed", "light.hall"]);
});

test("pushRecent keeps newest first, drops repeats and caps the list", () => {
  assert.deepEqual(pushRecent(["a.x", "b.y"], "b.y"), ["b.y", "a.x"]);
  const many = Array.from({ length: MAX_RECENT + 3 }, (_, i) => `e.${i}`);
  assert.equal(pushRecent(many, "new.one").length, MAX_RECENT);
  assert.equal(pushRecent(many, "new.one")[0], "new.one");
});

test("domain chips put fitting domains first; categories map to domains", () => {
  assert.deepEqual(domainChips(ALL, ["light", "switch"]), ["light", "switch", "sensor"]);
  assert.deepEqual(domainsForCategory("Sensors"), ["binary_sensor", "sensor"]);
  assert.deepEqual(domainsForCategory(undefined), ["light", "switch"]);
});

const wd = (base: string, name: string, state: string, extra: Record<string, string> = {}): [string, HAState][] =>
  Object.entries({ [`sensor.${base}_state`]: state, [`sensor.${base}_progress`]: "40", [`binary_sensor.${base}_running`]: state === "running" ? "on" : "off", [`sensor.${base}_time_remaining`]: "32", ...extra }).map(([id, st]) => [
    id,
    { entity_id: id, state: st, attributes: id.endsWith("_state") ? { friendly_name: `${name} State` } : {} },
  ]);

test("the WashData group lists each detected device once, the item's own kind first, and stays out of the normal domains", () => {
  const states = Object.fromEntries([...wd("kitchen_dishwasher", "Dishwasher", "running"), ...wd("bathroom_washing_machine", "Washing Machine", "clean"), ...wd("utility_dryer", "Dryer", "idle"), ["sensor.living_temp", { entity_id: "sensor.living_temp", state: "21", attributes: {} }]]);
  assert.deepEqual(washdataOptions(states, "washer").map((o) => [o.entity, o.name]), [
    ["sensor.bathroom_washing_machine_state", "Washing Machine"],
    ["sensor.kitchen_dishwasher_state", "Dishwasher"],
    ["sensor.utility_dryer_state", "Dryer"],
  ]);
  assert.equal(washdataOptions(states, "dishwasher")[0].name, "Dishwasher");
  assert.deepEqual(washdataOptions({}), []);
  // the picker's domain lists did not grow
  assert.ok(!domainsForCategory("Appliances").includes("sensor") && !domainsForCategory("Appliances").includes("binary_sensor"));
});

test("washers, dryers, dishwashers and other appliances offer WashData; a sofa or a lamp does not", () => {
  assert.equal(offersWashdata("bt_washer", "Washing machine, front load", "Bathroom"), true);
  assert.equal(offersWashdata("washer", "Washing machine", "Kitchen & dining"), true);
  assert.equal(offersWashdata("ap_dryer", "Tumble dryer", "Appliances"), true);
  assert.equal(offersWashdata("ap_dishwasher_integrated", "Dishwasher, hidden behind a door", "Appliances"), true);
  assert.equal(offersWashdata("ap_washer_dryer_tower", "Washer and dryer stacked", "Appliances"), true);
  assert.equal(offersWashdata("ap_stand_mixer", "Stand mixer", "Appliances"), true);
  assert.equal(offersWashdata("kt_fridge_steel", "Fridge", "Kitchen & dining"), true);
  assert.equal(offersWashdata("ektorp", "Sofa", "Living room"), false);
  assert.equal(offersWashdata("ceiling_light", undefined, "Lighting & devices"), false);
});
