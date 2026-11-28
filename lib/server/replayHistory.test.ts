import assert from "node:assert/strict";
import { test } from "node:test";
import { BUCKET_MS, MAX_EVENTS_PER_ENTITY, MAX_EVENTS_TOTAL, historyPaths, parseReplayQuery, shapeReplay } from "./replayHistory.ts";

const T0 = Date.UTC(2026, 5, 10, 12, 0, 0);
const MIN = 60_000;
const iso = (ms: number) => new Date(T0 + ms).toISOString();
const q = (s: string) => parseReplayQuery(new URLSearchParams(s));

test("the query: entities and hours are validated", () => {
  assert.deepEqual(q("entities=light.a,sensor.b,light.a"), { ok: true, entities: ["light.a", "sensor.b"], hours: 24 });
  assert.deepEqual(q("entities=light.a&hours=168"), { ok: true, entities: ["light.a"], hours: 168 });
  for (const bad of ["", "entities=", "entities=Light.A", "entities=light", "entities=light.a;rm", "entities=light.a&hours=48", "entities=light.a&hours=", "entities=light.a&hours=0168"]) {
    assert.equal(q(bad).ok, false, bad);
  }
  const many = Array.from({ length: 121 }, (_, i) => `sensor.s${i}`).join(",");
  assert.deepEqual(q(`entities=${many}`), { ok: false, error: "at most 120 entities" });
  assert.equal(q(`entities=${many.split(",").slice(0, 120).join(",")}`).ok, true);
});

test("two upstream queries: attributes for lights, covers, climate, fan, media players; minimal for the rest", () => {
  const paths = historyPaths(["light.a", "sensor.b", "cover.c", "constructor.x"], T0, T0 + 24 * 3_600_000);
  assert.equal(paths.length, 2);
  assert.match(paths[0], /^history\/period\/2026-06-10T12:00:00\.000Z\?filter_entity_id=light\.a,cover\.c&end_time=2026-06-11T12%3A00%3A00\.000Z&significant_changes_only=0$/);
  assert.match(paths[1], /filter_entity_id=sensor\.b,constructor\.x&minimal_response&no_attributes&end_time=/);
  assert.equal(historyPaths(["sensor.b"], T0, T0 + 1000).length, 1);
  assert.ok(!historyPaths(["light.a"], T0, T0 + 1000)[0].includes("minimal_response"));
});

test("numbers: the last reading of each minute, repeats dropped, unavailable kept", () => {
  const rows = [
    { entity_id: "sensor.t", state: "20.0", last_updated: iso(-5 * MIN) }, // before the window: clamped to its start
    { state: "20.5", last_updated: iso(10_000) },
    { state: "20.7", last_updated: iso(50_000) }, // same minute as the previous: replaces it
    { state: "20.7", last_updated: iso(2 * MIN + 1000) }, // the same value again: dropped
    { state: "unavailable", last_updated: iso(3 * MIN) },
    { state: "unknown", last_updated: iso(3 * MIN + 5000) },
    { state: "21", last_updated: iso(4 * MIN) },
    { state: "22", last_updated: iso(4 * MIN + 30_000) },
  ];
  const out = shapeReplay([[rows]], ["sensor.t"], T0, T0 + 24 * 3_600_000, 24);
  assert.equal(out.bucketMs, MIN);
  assert.deepEqual(out.entities["sensor.t"], [
    [T0 + 50_000, "20.7"], // the start-of-window 20.0 shared its minute with later readings, so the minute shows its last one
    [T0 + 3 * MIN, "unavailable"],
    [T0 + 3 * MIN + 5000, "unknown"],
    [T0 + 4 * MIN + 30_000, "22"],
  ]);
});

test("a week is bucketed to five minutes", () => {
  const rows = [{ entity_id: "sensor.p", state: "1", last_updated: iso(0) }, ...Array.from({ length: 9 }, (_, i) => ({ state: String(i + 2), last_updated: iso((i + 1) * MIN) }))];
  const out = shapeReplay([[rows]], ["sensor.p"], T0, T0 + 168 * 3_600_000, 168);
  assert.equal(out.bucketMs, BUCKET_MS[168]);
  assert.deepEqual(out.entities["sensor.p"].map((e) => e[1]), ["5", "10"], "minutes 0-4 give 5, minutes 5-9 give 10 (T0 is on a 5-minute edge)");
});

test("words keep every change; attributes are picked and repeats (same state and attributes) dropped", () => {
  const rows = [
    { entity_id: "light.a", state: "on", attributes: { brightness: 100, friendly_name: "A", rgb_color: [1, 2, 3] }, last_updated: iso(0) },
    { entity_id: "light.a", state: "on", attributes: { brightness: 100, friendly_name: "A", rgb_color: [1, 2, 3], other: 1 }, last_updated: iso(MIN) },
    { entity_id: "light.a", state: "on", attributes: { brightness: 120, rgb_color: [1, 2, 3] }, last_updated: iso(2 * MIN) },
    { entity_id: "light.a", state: "off", attributes: { brightness: null }, last_updated: iso(3 * MIN) },
    { entity_id: "light.a", state: "unavailable", attributes: {}, last_updated: iso(4 * MIN) },
  ];
  const out = shapeReplay([[rows]], ["light.a"], T0, T0 + 1, 24);
  assert.deepEqual(out.entities["light.a"], [
    [T0, "on", { brightness: 100, rgb_color: [1, 2, 3] }],
    [T0 + 2 * MIN, "on", { brightness: 120, rgb_color: [1, 2, 3] }],
    [T0 + 3 * MIN, "off"],
    [T0 + 4 * MIN, "unavailable"],
  ]);
});

test("both upstream answers merge; unrequested entities, empty lists and junk are ignored", () => {
  const out = shapeReplay(
    [[[{ entity_id: "light.a", state: "on", last_updated: iso(0) }], [], [{ entity_id: "light.other", state: "on", last_updated: iso(0) }]], [[{ entity_id: "binary_sensor.d", state: "off", last_changed: iso(0) }]], "junk", null],
    ["light.a", "binary_sensor.d", "sensor.missing"],
    T0,
    T0 + 1,
    24,
  );
  assert.deepEqual(Object.keys(out.entities).sort(), ["binary_sensor.d", "light.a"]);
});

test("caps: the newest events of an entity, and a total budget shared down", () => {
  const rows = Array.from({ length: 3000 }, (_, i) => ({ ...(i ? {} : { entity_id: "switch.s" }), state: i % 2 ? "on" : "off", last_updated: iso(i * 1000) }));
  const out = shapeReplay([[rows]], ["switch.s"], T0, T0 + 1, 24);
  assert.equal(out.entities["switch.s"].length, MAX_EVENTS_PER_ENTITY);
  assert.equal(out.entities["switch.s"].at(-1)?.[0], T0 + 2999 * 1000, "the most recent kept");

  const ids = Array.from({ length: 40 }, (_, i) => `switch.s${i}`);
  const lists = ids.map((id) => rows.map((r, i) => (i ? r : { ...r, entity_id: id })));
  const big = shapeReplay([lists], ids, T0, T0 + 1, 24);
  const total = Object.values(big.entities).reduce((n, l) => n + l.length, 0);
  assert.ok(total <= MAX_EVENTS_TOTAL, `${total} within the budget`);
  assert.ok(Object.values(big.entities).every((l) => l.length > 100), "every entity keeps a useful share");
});
