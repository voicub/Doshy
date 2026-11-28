import assert from "node:assert/strict";
import { test } from "node:test";
import { tileOf } from "./geo.ts";
import { ARGS_VERSION, CITY_FAILURES, childEnv, cityKey, cityMeta, cityTileRange, explainRun, parseCityQuery, redact, roadWidthArg, vectilerArgs, type RunResult } from "./siteCity.ts";
import { CITY_ZOOM } from "./siteCityTypes.ts";

const q = (s: string) => parseCityQuery(new URLSearchParams(s));
const ok: RunResult = { code: 0, signal: null, timedOut: false, stdout: "Using API key k\nSaved obj file: out.obj\nTriangles: 12\n" };
const KEY = "abc123SECRET";

test("tile range is the home tile plus one each way for 3 tiles and two for 5", () => {
  const { x, y } = tileOf(45.75, 4.85, CITY_ZOOM);
  assert.deepEqual(cityTileRange(45.75, 4.85, 3), { z: 16, x0: x - 1, x1: x + 1, y0: y - 1, y1: y + 1 });
  assert.deepEqual(cityTileRange(45.75, 4.85, 5), { z: 16, x0: x - 2, x1: x + 2, y0: y - 2, y1: y + 2 });
});

test("tile range is cut at the edge of the world", () => {
  const r = cityTileRange(90, -180, 5);
  assert.equal(r.x0, 0);
  assert.equal(r.y0, 0);
  assert.deepEqual(cityMeta(r, { terrain: false, roads: true }), { z: 16, x: 0, y: 0, nx: 3, ny: 3, terrain: false, roads: true });
});

test("meta reports the north-west tile and the tile counts", () => {
  const r = cityTileRange(45.75, 4.85, 3);
  assert.deepEqual(cityMeta(r, { terrain: true, roads: false }), { z: 16, x: r.x0, y: r.y0, nx: 3, ny: 3, terrain: true, roads: false });
});

test("query defaults roads on and terrain off", () => {
  assert.deepEqual(q("lat=45.75&lon=4.85&tiles=3"), { lat: 45.75, lon: 4.85, tiles: 3, terrain: false, roads: true, fresh: false });
});

test("query reads every option", () => {
  assert.deepEqual(q("lat=-33.5&lon=151&tiles=5&terrain=1&roads=0&fresh=1"), { lat: -33.5, lon: 151, tiles: 5, terrain: true, roads: false, fresh: true });
});

test("query rejects anything but plain decimals and known values", () => {
  for (const bad of [
    "lat=1e1&lon=4&tiles=3",
    "lat=45;ls&lon=4&tiles=3",
    "lat=45&lon=%24%28id%29&tiles=3",
    "lat=91&lon=4&tiles=3",
    "lat=45&lon=181&tiles=3",
    "lon=4&tiles=3",
    "lat=45&lon=4&tiles=4",
    "lat=45&lon=4&tiles=3.0",
    "lat=45&lon=4",
    "lat=45&lon=4&tiles=3&terrain=2",
    "lat=45&lon=4&tiles=3&roads=true",
  ]) {
    assert.equal(typeof q(bad), "string", bad);
  }
});

test("arguments are the exact flag list with the key and numbers only", () => {
  const r = { z: 16, x0: 100, x1: 102, y0: 200, y1: 202 };
  const args = vectilerArgs(r, { terrain: true, roads: true }, KEY);
  assert.deepEqual(args, [
    "--name", "out", "--apikey", KEY, "--tilex", "100/102", "--tiley", "200/202", "--tilez", "16", "--splitMeshes", "1", "--buildings", "1", "--roads", "1",
    "--roadsHeight", "0", "--roadsExtrusionWidth", String(roadWidthArg(r)), "--buildingsHeight", "6", "--buildingsExtrusionScale", "1", "--terrain", "1",
    "--terrainSubdivision", "32", "--normals", "0",
  ]);
});

test("terrain off keeps terrain flag on with a single quad, roads off passes 0", () => {
  const args = vectilerArgs({ z: 16, x0: 1, x1: 3, y0: 1, y1: 3 }, { terrain: false, roads: false }, KEY);
  assert.equal(args[args.indexOf("--terrain") + 1], "1");
  assert.equal(args[args.indexOf("--terrainSubdivision") + 1], "1");
  assert.equal(args[args.indexOf("--roads") + 1], "0");
});

test("road width grows with latitude as 3 over cos(lat), to two decimals", () => {
  const equator = cityTileRange(0.0001, 0.0001, 3);
  const lyon = cityTileRange(45.75, 4.85, 3);
  assert.equal(roadWidthArg(equator), 3);
  assert.ok(Math.abs(roadWidthArg(lyon) - 3 / Math.cos((45.75 * Math.PI) / 180)) < 0.1);
  assert.equal(roadWidthArg(lyon), Number(roadWidthArg(lyon).toFixed(2)));
});

test("cache key depends on range and options only, so neighbours share it", () => {
  const a = cityTileRange(45.75, 4.85, 3);
  const b = cityTileRange(45.7501, 4.8501, 3);
  assert.equal(cityKey(a, { terrain: false, roads: true }), cityKey(b, { terrain: false, roads: true }));
  assert.match(cityKey(a, { terrain: false, roads: true }), new RegExp(`^v${ARGS_VERSION}_z16_`));
});

test("cache key changes with the range, terrain and roads", () => {
  const a = cityTileRange(45.75, 4.85, 3);
  const keys = new Set([
    cityKey(a, { terrain: false, roads: true }),
    cityKey(a, { terrain: true, roads: true }),
    cityKey(a, { terrain: false, roads: false }),
    cityKey(cityTileRange(45.75, 4.85, 5), { terrain: false, roads: true }),
    cityKey(cityTileRange(46.75, 4.85, 3), { terrain: false, roads: true }),
  ]);
  assert.equal(keys.size, 5);
});

test("the child's environment holds only what it needs to run and trust TLS", () => {
  const env = childEnv({ PATH: "/bin", HA_TOKEN: "secret", NEXTZEN_API_KEY: KEY, SSL_CERT_FILE: "/c.pem", HOME: "/home/me" }, "/tmp/work");
  assert.deepEqual(env, { HOME: "/tmp/work", PATH: "/bin", SSL_CERT_FILE: "/c.pem" });
});

test("redact removes the key and api_key= query values", () => {
  const text = `Using API key ${KEY}\nURL request: https://x/y.json?api_key=${KEY}&z=1 and again ${KEY}`;
  const out = redact(text, KEY);
  assert.ok(!out.includes(KEY));
  assert.ok(out.includes("api_key=***&z=1"));
});

test("redact still masks api_key= when no key is given", () => {
  assert.equal(redact("a?api_key=zzz", ""), "a?api_key=***");
});

test("a clean run is accepted", () => {
  assert.equal(explainRun(ok), undefined);
});

test("our timeout kill is a timeout whatever the exit code", () => {
  assert.equal(explainRun({ ...ok, code: null, signal: "SIGKILL", timedOut: true }), CITY_FAILURES.timedOut);
});

test("a non-zero exit or a signal is a crash", () => {
  assert.equal(explainRun({ ...ok, code: 3 }), CITY_FAILURES.crashed);
  assert.equal(explainRun({ ...ok, code: null, signal: "SIGSEGV" }), CITY_FAILURES.crashed);
});

test("curl failure lines mean no network even though the exit code is 0", () => {
  for (const why of ["Couldn't resolve host name", "Could not connect to server", "Timeout was reached", "SSL connect error"]) {
    const stdout = `URL request: https://tile.nextzen.org/a -- Failure: ${why}\nFailed to download vector tile data for tile 1 2 16\n`;
    assert.equal(explainRun({ ...ok, stdout }), CITY_FAILURES.noNetwork, why);
  }
});

test("a GeoJSON without features means Nextzen did not accept the key", () => {
  assert.equal(explainRun({ ...ok, stdout: "ERROR: GeoJSON missing 'features' member\nFailed to download vector tile data for tile 1 2 16\n" }), CITY_FAILURES.keyRejected);
  assert.equal(explainRun({ ...ok, stdout: "Error parsing tile\n" }), CITY_FAILURES.keyRejected);
});

test("any failed download alone means incomplete output, never a partial model", () => {
  assert.equal(explainRun({ ...ok, stdout: "Failed to download heightmap texture data for tile 1 2 16\nSaved obj file: out.obj\n" }), CITY_FAILURES.incomplete);
});

test("failure sentences never name the key variable's value or raw output", () => {
  for (const f of Object.values(CITY_FAILURES)) assert.ok(!/api_key=|Using API key/.test(f.message));
});
