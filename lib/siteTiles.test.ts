import assert from "node:assert/strict";
import { test } from "node:test";
import { DEFAULT_TILE_URL, evictionPlan, parseTile, sniffImage, tileProvider, tileUrl, windowLimiter } from "./siteTiles.ts";

test("the default provider fills the tile in row-first order", () => {
  const p = tileProvider({});
  assert.equal(tileUrl(p, { z: 17, x: 74114, y: 45745 }), "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/17/45745/74114");
});

test("the environment can change the provider; malformed values fall back to the defaults", () => {
  const p = tileProvider({ SITE_TILE_URL: "https://tiles.example.org/{z}/{x}/{y}.jpg", SITE_TILE_MAX_ZOOM: "19", SITE_TILE_CREDIT: "Aerial \u00a9 Example" });
  assert.equal(tileUrl(p, { z: 3, x: 1, y: 2 }), "https://tiles.example.org/3/1/2.jpg");
  assert.equal(p.maxZoom, 19);
  assert.equal(p.credit, "Aerial  Example", "non-ASCII is dropped: it travels in a header");
  assert.notEqual(p.key, tileProvider({}).key, "another provider, another cache folder");
  for (const bad of ["ftp://x/{z}/{x}/{y}", "https://x/{z}/{x}", "not a url {z}{x}{y}", "javascript:{z}{x}{y}", ""]) assert.equal(tileProvider({ SITE_TILE_URL: bad }).template, DEFAULT_TILE_URL, bad);
  for (const bad of ["x", "-1", "99", "17.5", ""]) assert.equal(tileProvider({ SITE_TILE_MAX_ZOOM: bad }).maxZoom, 17, bad);
});

test("only plain integers of a tile that exists get through", () => {
  assert.deepEqual(parseTile("17", "74114", "45745", 17), { z: 17, x: 74114, y: 45745 });
  assert.deepEqual(parseTile("0", "0", "0", 17), { z: 0, x: 0, y: 0 });
  assert.equal(parseTile("18", "1", "1", 17), undefined, "deeper than the provider has");
  assert.equal(parseTile("3", "8", "0", 17), undefined, "x out of range for z3");
  assert.equal(parseTile("3", "0", "8", 17), undefined);
  for (const bad of ["-1", "1.5", "1e3", "0x10", " 1", "1 ", "../1", "", "1/1", "%31", "99999999"]) {
    assert.equal(parseTile("17", bad, "1", 17), undefined, bad);
    assert.equal(parseTile("17", "1", bad, 17), undefined, bad);
    assert.equal(parseTile(bad, "1", "1", 17), undefined, bad);
  }
});

test("pictures are recognised by their first bytes, nothing else", () => {
  assert.equal(sniffImage(Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0, 0])), "image/jpeg");
  assert.equal(sniffImage(Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0])), "image/png");
  assert.equal(sniffImage(new TextEncoder().encode("RIFF\0\0\0\0WEBPVP8 ")), "image/webp");
  assert.equal(sniffImage(new TextEncoder().encode("<svg xmlns='http://www.w3.org/2000/svg'/>")), undefined);
  assert.equal(sniffImage(new TextEncoder().encode("<html>Map data not yet available</html>")), undefined);
  assert.equal(sniffImage(new Uint8Array(0)), undefined);
});

test("the disk cache evicts the oldest files first, only as many as needed", () => {
  const files = [
    { path: "new", size: 40, mtimeMs: 300 },
    { path: "old", size: 40, mtimeMs: 100 },
    { path: "mid", size: 40, mtimeMs: 200 },
  ];
  assert.deepEqual(evictionPlan(files, 10, 200), [], "fits");
  assert.deepEqual(evictionPlan(files, 10, 125), ["old"]);
  assert.deepEqual(evictionPlan(files, 50, 100), ["old", "mid"]);
  assert.deepEqual(evictionPlan(files, 500, 100), ["old", "mid", "new"], "even everything may go for a huge newcomer");
});

test("the window limiter allows `max` per window and starts again after it", () => {
  const hit = windowLimiter(3, 1000);
  assert.deepEqual([0, 1, 2, 3, 4].map((t) => hit(t)), [true, true, true, false, false]);
  assert.equal(hit(1000), true);
});
