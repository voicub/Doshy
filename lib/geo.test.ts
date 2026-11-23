import assert from "node:assert/strict";
import { test } from "node:test";
import { homeOf, latLonToSite, metresPerDegree, planToSite, siteCenter, siteToLatLon, siteToPlan, tileBoundsSite, tileCorner, tileOf } from "./geo.ts";

const C = { lat: 51.4779, lon: -0.0015 };
const near = (a: number, b: number, eps = 1e-6) => assert.ok(Math.abs(a - b) <= eps, `${a} vs ${b}`);

test("a degree is about 111 km of latitude and shrinks with latitude in longitude", () => {
  const eq = metresPerDegree(0);
  near(eq.lat, 110574, 50);
  near(eq.lon, 111320, 50);
  const m = metresPerDegree(51.48);
  near(m.lat, 111200, 100);
  near(m.lon, 69470, 400);
});

test("north is -y and east is +x", () => {
  const north = latLonToSite(C, C.lat + 0.001, C.lon);
  assert.ok(north[1] < -100 && Math.abs(north[0]) < 1e-9);
  const east = latLonToSite(C, C.lat, C.lon + 0.001);
  assert.ok(east[0] > 65 && Math.abs(east[1]) < 1e-9);
  const here = latLonToSite(C, C.lat, C.lon);
  near(here[0], 0);
  near(here[1], 0);
});

test("latLonToSite and siteToLatLon are exact inverses", () => {
  for (const xy of [[0, 0], [123.4, -250.5], [-599, 599]] as [number, number][]) {
    const ll = siteToLatLon(C, xy);
    const back = latLonToSite(C, ll.lat, ll.lon);
    near(back[0], xy[0], 1e-7);
    near(back[1], xy[1], 1e-7);
  }
});

test("siteToPlan: bearing 0 keeps north up, only the nudge applies", () => {
  const site = { dx: 3, dy: -2 };
  assert.deepEqual(siteToPlan(site, 0, [10, 20]), [7, 22]);
});

test("siteToPlan: a point due east of the origin sits at the right of the plan when up is north and at the top when up is east", () => {
  const origin = { dx: 0, dy: 0 };
  const [x0, y0] = siteToPlan(origin, 0, [10, 0]);
  near(x0, 10);
  near(y0, 0);
  // plan-up faces east (bearing 90): east is now up (-y)
  const [x1, y1] = siteToPlan(origin, 90, [10, 0]);
  near(x1, 0);
  near(y1, -10);
  // plan-up faces south (bearing 180): north (0,-10) appears at the bottom (+y)
  const [x2, y2] = siteToPlan(origin, 180, [0, -10]);
  near(x2, 0);
  near(y2, 10);
});

test("a point at compass theta shows theta - bearing clockwise from plan-up", () => {
  const origin = { dx: 0, dy: 0 };
  for (const [theta, bearing] of [[30, 0], [30, 50], [200, 75], [10, 300]]) {
    const t = (theta * Math.PI) / 180;
    const p = siteToPlan(origin, bearing, [Math.sin(t) * 40, -Math.cos(t) * 40]);
    const phi = ((theta - bearing) * Math.PI) / 180;
    near(p[0], Math.sin(phi) * 40, 1e-9);
    near(p[1], -Math.cos(phi) * 40, 1e-9);
  }
});

test("siteToPlan and planToSite are exact inverses", () => {
  const site = { dx: 12.5, dy: -7.25 };
  for (const bearing of [0, 33, 90, 181, 359]) {
    for (const xy of [[0, 0], [50, -80], [-200, 140]] as [number, number][]) {
      const back = planToSite(site, bearing, siteToPlan(site, bearing, xy));
      near(back[0], xy[0], 1e-9);
      near(back[1], xy[1], 1e-9);
    }
  }
});

test("homeOf reads zone.home and refuses anything else", () => {
  assert.deepEqual(homeOf({ "zone.home": { attributes: { latitude: 47.5, longitude: 23.5 } } }), { lat: 47.5, lon: 23.5 });
  assert.equal(homeOf({}), null);
  assert.equal(homeOf(undefined), null);
  assert.equal(homeOf({ "zone.home": { attributes: { latitude: "47", longitude: 23 } } }), null);
  assert.equal(homeOf({ "zone.home": { attributes: { latitude: 99, longitude: 23 } } }), null);
});

test("siteCenter: manual coordinates win over the home zone, home source needs the zone", () => {
  const states = { "zone.home": { attributes: { latitude: 47.5, longitude: 23.5 } } };
  assert.deepEqual(siteCenter({ source: "home" }, states), { lat: 47.5, lon: 23.5 });
  assert.deepEqual(siteCenter({ source: "manual", lat: 1, lon: 2 }, states), { lat: 1, lon: 2 });
  assert.equal(siteCenter({ source: "manual" }, states), null);
  assert.equal(siteCenter({ source: "home" }, {}), null);
});

test("tileOf: known tiles", () => {
  assert.deepEqual(tileOf(0, 0, 1), { x: 1, y: 1 });
  assert.deepEqual(tileOf(51.5, -0.12, 10), { x: 511, y: 340 });
  assert.deepEqual(tileOf(51.4779, -0.0015, 17), { x: 65535, y: 43602 });
});

test("tileBoundsSite: the home tile contains the centre, is ~191 m square at z17 and runs north to south", () => {
  const t = tileOf(C.lat, C.lon, 17);
  const b = tileBoundsSite(C, 17, t.x, t.y);
  assert.ok(b.x0 < 0 && b.x1 > 0 && b.y0 < 0 && b.y1 > 0, JSON.stringify(b));
  near(b.x1 - b.x0, 191, 3);
  near(b.y1 - b.y0, 191, 3);
  const next = tileBoundsSite(C, 17, t.x + 1, t.y);
  near(next.x0, b.x1, 1e-6);
});

test("tileCorner is the inverse of tileOf at the corner", () => {
  const c = tileCorner(12, 2200, 1400);
  const t = tileOf(c.lat - 1e-6, c.lon + 1e-6, 12);
  assert.deepEqual(t, { x: 2200, y: 1400 });
});
