import test from "node:test";
import assert from "node:assert/strict";
import { hourlyMeans, parseAnomalyQuery, shapeSeries, seenOf } from "./anomalyHistory.ts";
import { loadAnomalies } from "./anomalyLoad.ts";
import { HOUR_MS, parseAnomalyWire } from "../anomalyWire.ts";
import { EMPTY_PREFS, markNormal, snooze, visible, bannerWorthy, parsePrefs, COOLDOWN_MS } from "../anomalyPrefs.ts";
import type { Anomaly } from "../anomalyTypes.ts";

const row = (minute: number, state: string) => ({ entity_id: "sensor.temp", state, last_changed: new Date(minute * 60_000).toISOString() });
test("history time weights readings, preserves gaps and resets unavailable segments", () => {
  assert.deepEqual(hourlyMeans([row(0, "10"), row(15, "30"), row(60, "unavailable"), row(90, "20")], 0, 2, 3 * HOUR_MS), [25, 20, 20]);
  assert.deepEqual(hourlyMeans([row(90, "20")], 0, 2, 3 * HOUR_MS), [null, 20, 20]);
  assert.deepEqual(shapeSeries([[[row(0, "10")], [{ ...row(0, "900"), entity_id: "sensor.unwanted" }]]], ["sensor.temp"], 0, 1, 2 * HOUR_MS), { "sensor.temp": { h0: 0, v: [10, 10] } });
});
test("history validates bounds and numeric wire data", () => {
  assert.equal(parseAnomalyQuery(new URLSearchParams("entities=switch.pump")).ok, false);
  assert.equal(parseAnomalyQuery(new URLSearchParams("entities=sensor.temp&days=31")).ok, false);
  assert.equal(parseAnomalyQuery(new URLSearchParams("entities=sensor.temp&days=21")).ok, true);
  assert.throws(() => parseAnomalyWire({ from: 2, to: 1, series: {}, days: 21 }));
  assert.deepEqual(seenOf([{ entity_id: "sensor.temp", last_reported: new Date(2000).toISOString(), last_updated: new Date(1000).toISOString() }], ["sensor.temp"]), { "sensor.temp": 2000 });
});
test("batched loader requests only read-only history and shares the home clock", async () => {
  const calls: string[] = [];
  const now = 30 * 24 * HOUR_MS;
  const entities = Array.from({ length: 26 }, (_, i) => `sensor.t${i}`);
  const result = await loadAnomalies(async (path, init) => {
    calls.push(path);
    assert.ok(!init?.method || init.method === "GET");
    if (path === "config") return Response.json({ time_zone: "Europe/Bucharest", latitude: 44, longitude: 26 });
    if (path === "states/zone.home") return Response.json({ attributes: { latitude: 44, longitude: 26 } });
    if (path === "states") return Response.json([]);
    return Response.json([[{ entity_id: "sensor.t0", state: "20", last_changed: new Date(now - 21 * 24 * HOUR_MS).toISOString() }]]);
  }, entities, 21, now);
  assert.equal(calls.filter((path) => path.startsWith("history/period/")).length, 2);
  assert.equal(result.zone, "Europe/Bucharest");
  assert.equal(result.series["sensor.t0"].v[0], 20);
});
const warning: Anomaly = { id: "level:sensor.temp", rule: "level", entity: "sensor.temp", name: "Temperature", severity: "warning", title: "Warm", message: "Warmer than normal", hints: [], since: 1, teachable: true, ratio: 2 };
test("snooze, learned tolerance, validation and daily warning cooldown are deterministic", () => {
  const now = 2 * COOLDOWN_MS;
  const hidden = snooze(EMPTY_PREFS, warning.id, now);
  assert.deepEqual(visible(hidden, [warning], now), []);
  assert.deepEqual(visible(hidden, [warning], now + 8 * 86_400_000), [warning]);
  assert.ok(markNormal(EMPTY_PREFS, warning).tolerance[warning.entity] >= 2);
  assert.deepEqual(parsePrefs({ ignored: ["bad"], tolerance: { "sensor.temp": -1 }, alerts: "anything" }).ignored, []);
  const first = bannerWorthy(EMPTY_PREFS, [warning], new Set(), now);
  assert.equal(first.alerts.length, 1);
  const stamped = { ...EMPTY_PREFS, raised: first.raised };
  assert.equal(bannerWorthy(stamped, [warning], new Set(), now + 1000).alerts.length, 0);
  assert.equal(bannerWorthy(stamped, [warning], new Set([warning.id]), now + 1000).alerts.length, 1);
  assert.equal(bannerWorthy(stamped, [{ ...warning, severity: "notice" }], new Set(), now + COOLDOWN_MS).alerts.length, 0);
});
