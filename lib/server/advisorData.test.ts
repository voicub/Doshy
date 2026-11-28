import { test } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { advisorQueryPlace, createAdvisorDataService } from "./advisorData.ts";
import { advisorSettings, advisorToken, saveAdvisorSettings } from "./advisorSettings.ts";
import { parseSettings } from "../advisorSettings.ts";
import { getSettings } from "../db/settings.ts";
import type { HaFetch } from "./haCall.ts";
const stamp = Date.parse("2026-11-20T12:00:00Z");
const ha: HaFetch = async (path, init) => {
  assert.equal(init?.method, undefined);
  return Response.json(path === "config" ? { time_zone: "Europe/Berlin" } : [{ entity_id: "zone.home", attributes: { latitude: 52, longitude: 13 } }]);
};
test("aWATTar normalizes negative prices, caches and expires without networking", async () => {
  let calls = 0;
  let time = stamp;
  const service = createAdvisorDataService(async (url) => { calls++; assert.equal(new URL(String(url)).hostname, "api.awattar.at"); return Response.json({ data: [{ start_timestamp: stamp, end_timestamp: stamp + 3_600_000, marketprice: -50, unit: "Eur/MWh" }] }); }, () => time);
  const settings = parseSettings({ price: { source: "awattar-at" }, weather: { source: "none" }, solar: { source: "none" } });
  assert.equal((await service(settings, ha, null, { external: true, forecastService: false })).prices[0].price, -0.05);
  await service(settings, ha, null, { external: true, forecastService: false });
  assert.equal(calls, 1);
  time += 30 * 60_000;
  await service(settings, ha, null, { external: true, forecastService: false });
  assert.equal(calls, 2);
});
test("failed and gated sources do not fabricate data or leak tokens", async () => {
  let calls = 0;
  const service = createAdvisorDataService(async () => { calls++; throw new Error("private-secret-token"); }, () => stamp);
  const settings = parseSettings({ price: { source: "entsoe" }, weather: { source: "none" }, solar: { source: "none" } });
  const result = await service(settings, ha, "private-secret-token", { external: true, forecastService: false });
  assert.deepEqual(result.prices, []);
  assert.ok(result.notes.length);
  assert.ok(!JSON.stringify(result).includes("private-secret-token"));
  await service(settings, ha, "private-secret-token", { external: true, forecastService: false });
  assert.equal(calls, 2);
  await service(settings, ha, "private-secret-token", { external: false, forecastService: false });
  assert.equal(calls, 2);
});
test("HA forecast read-only service is explicitly gated", async () => {
  let posts = 0;
  const fake: HaFetch = async (path, init) => {
    if (path === "config") return Response.json({ time_zone: "UTC" });
    if (path === "states") return Response.json([{ entity_id: "weather.home", attributes: {} }]);
    assert.equal(path, "services/weather/get_forecasts?return_response");
    assert.equal(init?.method, "POST"); posts++;
    return Response.json({ service_response: { "weather.home": { forecast: [{ datetime: new Date(stamp).toISOString(), temperature: 9 }] } } });
  };
  const service = createAdvisorDataService(async () => { throw new Error("No external requests"); }, () => stamp);
  const settings = parseSettings({ price: { source: "none" }, solar: { source: "none" }, weather: { source: "entity" } });
  assert.equal((await service(settings, fake, null, { external: false, forecastService: false })).hours.length, 0);
  assert.equal(posts, 0);
  assert.equal((await service(settings, fake, null, { external: false, forecastService: true })).hours[0].tempC, 9);
  assert.equal(posts, 1);
});
test("settings persist validated values and only sealed secrets outside generic settings", () => {
  const dir = mkdtempSync(join(tmpdir(), "advisor-"));
  const db = new DatabaseSync(join(dir, "housey-test-advisor.db"));
  try {
    db.exec("CREATE TABLE meta(key TEXT PRIMARY KEY,value TEXT NOT NULL); CREATE TABLE settings(key TEXT PRIMARY KEY,value TEXT NOT NULL,updated_at INTEGER NOT NULL)");
    const saved = saveAdvisorSettings(db, { settings: { climate: { min: -999, max: 999 }, token: "never-store" }, token: "test-token-12345678" });
    assert.equal(saved.tokenSaved, true);
    assert.equal(advisorToken(db), "test-token-12345678");
    assert.ok(!JSON.stringify(saved).includes("test-token"));
    assert.ok(!JSON.stringify(getSettings(db)).includes("token"));
    assert.ok(!String(db.prepare("SELECT value FROM meta").get()?.value).includes("test-token"));
    assert.throws(() => saveAdvisorSettings(db, { settings: {}, token: "bad\nsecret" }));
    assert.throws(() => saveAdvisorSettings(db, { settings: {}, clearToken: "yes" }));
    assert.equal(saveAdvisorSettings(db, { settings: {}, clearToken: true }).tokenSaved, false);
    assert.equal(advisorSettings(db).tokenSaved, false);
  } finally { db.close(); rmSync(dir, { recursive: true, force: true }); }
});
test("Open-Meteo provides weather and estimated solar with location and source gating", async () => {
  let calls = 0;
  const service = createAdvisorDataService(async (input) => {
    calls++;
    assert.equal(new URL(String(input)).hostname, "api.open-meteo.com");
    return Response.json({ hourly: { time: [stamp / 1000], temperature_2m: [12], cloud_cover: [20], shortwave_radiation: [400], precipitation_probability: [10], pressure_msl: [1010] } });
  }, () => stamp);
  const settings = parseSettings({ price: { source: "none" }, solar: { source: "openmeteo" }, weather: { source: "openmeteo" } });
  const result = await service(settings, ha, null, { external: true, forecastService: false });
  assert.equal(result.hours[0].tempC, 12);
  assert.ok(result.pv[0].kw > 0);
  assert.deepEqual(result.place, { lat: 52, lon: 13 });
  await service(settings, ha, null, { external: true, forecastService: false });
  assert.equal(calls, 1);
  const gated = await service(settings, ha, null, { external: false, forecastService: false });
  assert.deepEqual(gated.hours, []);
  assert.equal(calls, 1);
});
test("plan location query requires a finite coordinate pair", () => {
  assert.equal(advisorQueryPlace(new URLSearchParams()), undefined);
  assert.deepEqual(advisorQueryPlace(new URLSearchParams("lat=0&lon=-180")), { lat: 0, lon: -180 });
  for (const query of ["lat=52", "lat=&lon=0", "lat=NaN&lon=0", "lat=91&lon=0", "lat=0&lon=181"]) assert.throws(() => advisorQueryPlace(new URLSearchParams(query)));
});
