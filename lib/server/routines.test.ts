import test from "node:test";
import assert from "node:assert/strict";
import { isRecord } from "../guards.ts";
import { STATES } from "../sceneFixture.ts";
import { createAutomation } from "./haAutomation.ts";
import type { HaFetch } from "./haCall.ts";
import { coversOfConfig } from "./routineCoverage.ts";
import { DEFAULT_DAYS, MAX_EVENTS_PER_ENTITY, historyPaths, parseRoutinesQuery, shapeChanges, spanFor } from "./routineHistory.ts";
import { loadRoutines } from "./routineLoad.ts";
import { parseRoutines } from "../routinesWire.ts";

const query = (s: string) => parseRoutinesQuery(new URLSearchParams(s));
const FROM = Date.UTC(2026, 10, 1);

test("the query needs plain device ids of the kinds a routine may touch, and 7 to 30 days", () => {
  const ok = query("entities=light.hall,cover.bed,binary_sensor.door");
  assert.ok(ok.ok && ok.days === DEFAULT_DAYS && ok.entities.length === 3);
  assert.ok(query("entities=light.hall&days=30").ok);
  for (const bad of ["", "entities=", "entities=light.hall&days=6", "entities=light.hall&days=31", "entities=light.hall&days=2.5", "entities=light.hall&days=x", "entities=Light.Hall", "entities=lock.front", "entities=alarm_control_panel.home", "entities=sensor.temp", `entities=${Array.from({ length: 151 }, (_, i) => `light.l${i}`).join(",")}`]) {
    assert.equal(query(bad).ok, false, bad);
  }
  const twice = query("entities=light.a,light.a");
  assert.ok(twice.ok);
  assert.deepEqual(twice.entities, ["light.a"], "repeats collapse");
});

test("the span reaches back the asked days plus today and a day of slack", () => {
  const { from, to } = spanFor(14, 1_000_000_000_000);
  assert.equal(to - from, 16 * 86_400_000);
});

test("covers and thermostats are asked with their attributes, everything else without", () => {
  const paths = historyPaths(["light.hall", "cover.bed", "climate.house", "binary_sensor.door"], FROM, FROM + 86_400_000);
  assert.equal(paths.length, 2);
  const rich = paths.find((p) => p.includes("significant_changes_only=0"));
  const plain = paths.find((p) => p.includes("minimal_response"));
  assert.ok(rich?.includes("filter_entity_id=cover.bed,climate.house"));
  assert.ok(plain?.includes("filter_entity_id=light.hall,binary_sensor.door") && plain.includes("no_attributes"));
  assert.equal(historyPaths(["light.hall"], FROM, FROM + 1000).length, 1);
});

test("history rows become change lists: clamped to the start, repeats dropped, the number that matters kept", () => {
  const rows = (id: string, list: [string, string, Record<string, unknown>?][]) => list.map(([at, state, attributes]) => ({ entity_id: id, state, last_updated: at, ...(attributes ? { attributes } : {}) }));
  const answer = [
    [rows("cover.bed", [["2026-10-31T20:00:00Z", "closed", { current_position: 0 }], ["2026-11-01T06:00:00Z", "opening", { current_position: 0 }], ["2026-11-01T06:00:20Z", "open", { current_position: 100 }], ["2026-11-01T06:00:30Z", "open", { current_position: 100 }]])],
    [rows("light.hall", [["2026-10-31T23:00:00Z", "on"], ["2026-11-01T21:10:00Z", "off"], ["2026-11-01T21:10:00Z", "off"]]), rows("light.other", [["2026-11-01T01:00:00Z", "on"]])],
    "not a list",
  ];
  const out = shapeChanges(answer, ["cover.bed", "light.hall"], FROM);
  assert.deepEqual(out["cover.bed"], [[FROM, "closed", 0], [Date.UTC(2026, 10, 1, 6), "opening", 0], [Date.UTC(2026, 10, 1, 6, 0, 20), "open", 100]]);
  assert.deepEqual(out["light.hall"], [[FROM, "on"], [Date.UTC(2026, 10, 1, 21, 10), "off"]]);
  assert.equal(out["light.other"], undefined, "not asked for");
});

test("a very busy device is cut to its newest changes", () => {
  const busy = Array.from({ length: MAX_EVENTS_PER_ENTITY + 200 }, (_, i) => ({ entity_id: "light.hall", state: i % 2 ? "on" : "off", last_updated: new Date(FROM + (i + 1) * 60_000).toISOString() }));
  const out = shapeChanges([[busy]], ["light.hall"], FROM);
  assert.equal(out["light.hall"].length, MAX_EVENTS_PER_ENTITY);
  assert.equal(out["light.hall"].at(-1)?.[0], FROM + (MAX_EVENTS_PER_ENTITY + 200) * 60_000);
});

test("existing automations: what they do to which device, and when", () => {
  const classic = { trigger: [{ platform: "time", at: "23:00:00" }, { platform: "state", entity_id: "binary_sensor.hall_motion", to: "off" }], action: [{ service: "light.turn_off", target: { entity_id: ["light.hall", "light.desk"] } }] };
  const covers = coversOfConfig(classic);
  assert.deepEqual(covers.map((c) => c.entity).sort(), ["light.desk", "light.hall"]);
  assert.deepEqual(covers[0], { entity: "light.hall", verbs: ["turn_off"], at: [1380], sun: [], sensors: ["binary_sensor.hall_motion"] });
  const modern = { triggers: [{ trigger: "sun", event: "sunset", offset: "-00:30:00" }, { trigger: "time", at: ["06:30", "input_datetime.wake"] }], actions: [{ choose: [{ conditions: [], sequence: [{ action: "cover.close_cover", target: { entity_id: "cover.bed" } }] }] }, { action: "light.toggle", entity_id: "light.porch" }] };
  const m = coversOfConfig(modern);
  assert.deepEqual(m.find((c) => c.entity === "cover.bed"), { entity: "cover.bed", verbs: ["close"], at: [390], sun: [{ event: "sunset", offset: -30 }], sensors: [] });
  assert.deepEqual(m.find((c) => c.entity === "light.porch")?.verbs, ["turn_on", "turn_off"]);
  assert.deepEqual(coversOfConfig({ action: [{ service: "notify.phone", data: { message: "hi" } }, { service: "scene.turn_on", target: { entity_id: "scene.evening" } }] }), [], "no device it moves");
  assert.deepEqual(coversOfConfig("nonsense"), []);
  assert.deepEqual(coversOfConfig({ action: [{ service: "light.turn_off", target: { entity_id: "not an id" } }] }), []);
});

/** A fake Home Assistant: history of two lights, its config, and two automations (one on, one off). It records everything sent. */
function fakeHa(opts: { admin?: boolean } = {}) {
  const { admin = true } = opts;
  const sent: { method: string; path: string; body: unknown }[] = [];
  const hist = (id: string, rows: [string, string][]) => rows.map(([t, state]) => ({ entity_id: id, state, last_updated: t }));
  const fetchHa: HaFetch = async (path, init) => {
    const method = init?.method ?? "GET";
    sent.push({ method, path, body: init?.body ? JSON.parse(String(init.body)) : undefined });
    if (path.startsWith("history/")) return Response.json([hist("light.hall", [["2026-11-01T22:00:00Z", "on"], ["2026-11-01T23:10:00Z", "off"]])]);
    if (path === "config") return Response.json({ time_zone: "Europe/Bucharest", latitude: 44.43, longitude: 26.1 });
    if (path === "states") return Response.json([...Object.values(STATES), { entity_id: "zone.home", state: "1", attributes: {} }, { entity_id: "automation.night", state: "on", attributes: { id: "night" } }, { entity_id: "automation.old", state: "off", attributes: { id: "old" } }]);
    if (path === "services") return Response.json([]);
    if (path.startsWith("config/automation/config/")) {
      if (!admin) return new Response("no", { status: 403 });
      if (method === "GET") return Response.json({ trigger: [{ platform: "time", at: "23:15:00" }], action: [{ service: "light.turn_off", entity_id: "light.hall" }] });
      return Response.json({ result: "ok" });
    }
    return Response.json([]);
  };
  return { fetchHa, sent };
}

test("loading asks for history, the home's place and the switched-on automations, all read-only", async () => {
  const ha = fakeHa();
  const wire = await loadRoutines(ha.fetchHa, ["light.hall"], 14, FROM);
  assert.equal(wire.zone, "Europe/Bucharest");
  assert.equal(wire.lat, 44.43);
  assert.deepEqual(wire.entities["light.hall"].map((e) => e[1]), ["on", "off"]);
  assert.deepEqual(wire.covers, [{ entity: "light.hall", verbs: ["turn_off"], at: [1395], sun: [], sensors: [] }]);
  assert.ok(ha.sent.every((s) => s.method === "GET"), "nothing is written");
  assert.ok(!ha.sent.some((s) => s.path.endsWith("/old")), "a switched-off automation is not asked for");
  const parsed = parseRoutines(JSON.parse(JSON.stringify(wire)));
  assert.equal(parsed.days, 14);
});

test("without an administrator's token the history still loads, and the automations check is skipped", async () => {
  const wire = await loadRoutines(fakeHa({ admin: false }).fetchHa, ["light.hall"], 14, FROM);
  assert.equal(wire.covers, null);
  assert.ok(wire.entities["light.hall"]);
});

test("a history Home Assistant cannot give fails the whole load", async () => {
  const fetchHa: HaFetch = async (path) => (path.startsWith("history/") ? new Response("no", { status: 500 }) : Response.json({}));
  await assert.rejects(() => loadRoutines(fetchHa, ["light.hall"], 14, FROM), /HTTP 500/);
});

test("the parsed answer drops what is malformed and keeps order", () => {
  const w = parseRoutines({ from: 1, to: 2, days: 99, entities: { "light.a": [[5, "on"], [3, "off"], ["x", "on"], [4, "unknown", 1.5]], "bad id": [[1, "on"]], "light.b": "no" }, covers: [{ entity: "light.a", verbs: ["turn_off", "dance"], at: [60, "x"], sun: [{ event: "sunset", offset: 5 }, { event: "noon", offset: 1 }], sensors: ["binary_sensor.m", 5] }, "x"] });
  assert.equal(w.days, 30);
  assert.deepEqual(w.entities, { "light.a": [[3, "off"], [4, "unknown", 1.5], [5, "on"]] });
  assert.deepEqual(w.covers, [{ entity: "light.a", verbs: ["turn_off"], at: [60], sun: [{ event: "sunset", offset: 5 }], sensors: ["binary_sensor.m"] }]);
  assert.throws(() => parseRoutines({ from: 2, to: 1, entities: {}, days: 14 }));
  assert.equal(parseRoutines({ from: 1, to: 2, days: 14, entities: {} }).covers, null);
});

// ---- creating through the existing route ----------------------------------------------------------------------------------------------------------------

const recipe = { type: "device-at", entity: "light.kitchen_ceiling", action: { verb: "turn_off" }, time: "23:10", days: ["mon", "tue", "wed", "thu", "fri", "sat", "sun"], onlyHome: true };

test("a routine recipe is created only with the confirmation, built by the server and posted under a doshy_ id", async () => {
  const ha = fakeHa();
  assert.equal((await createAutomation({ action: "create", recipe }, ha.fetchHa, () => "r4nd0m")).status, 400, "no confirm, no write");
  assert.ok(ha.sent.every((s) => s.method === "GET"));
  const r = await createAutomation({ action: "create", confirm: true, recipe }, ha.fetchHa, () => "r4nd0m");
  assert.equal(r.status, 200);
  assert.equal(r.body.id, "doshy_device_at_r4nd0m");
  const post = ha.sent.find((s) => s.method === "POST" && s.path.startsWith("config/"));
  assert.equal(post?.path, "config/automation/config/doshy_device_at_r4nd0m");
  assert.ok(isRecord(post?.body));
  assert.equal(post.body.alias, "Doshy: At 23:10 every day, turn Kitchen ceiling off, when someone is home");
  assert.deepEqual(post.body.trigger, [{ platform: "time", at: "23:10:00" }]);
  assert.deepEqual(post.body.condition, [{ condition: "numeric_state", entity_id: "zone.home", above: 0 }]);
  assert.deepEqual(post.body.action, [{ service: "light.turn_off", target: { entity_id: "light.kitchen_ceiling" } }]);
  assert.deepEqual(ha.sent.filter((s) => s.method !== "GET").map((s) => s.path.split("/").slice(0, 2).join("/")), ["config/automation", "services/automation"]);
});

test("a routine recipe that breaks the rules never reaches Home Assistant, whatever is sent", async () => {
  for (const bad of [{ ...recipe, entity: "cover.garage_door", action: { verb: "open" } }, { ...recipe, entity: "lock.front" }, { ...recipe, time: "99:99" }, { ...recipe, entity: "climate.living", action: { verb: "set_temperature", value: 99 } }, { ...recipe, action: { verb: "turn_off", extra: "x", value: 1 } }, { type: "device-at", raw: "alias: x" }]) {
    const ha = fakeHa();
    const r = await createAutomation({ action: "create", confirm: true, recipe: bad }, ha.fetchHa, () => "r4nd0m");
    assert.equal(r.status, 400, JSON.stringify(bad));
    assert.ok(ha.sent.every((s) => s.method === "GET"), JSON.stringify(bad));
  }
});
