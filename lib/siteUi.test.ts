import assert from "node:assert/strict";
import test from "node:test";
import { siteToPlan } from "./geo.ts";
import { beginEdit, endEdit, redoStep, undoStep, type HistoryState } from "./history.ts";
import { DEFAULT_SITE, siteOf } from "./siteTypes.ts";
import { SITE_CREDITS, clampRadius, creditsOf, dragSite, enablePatch, mergeSite, normBearing, nudgeSite, parseCoords, parseNumber, setSiteIn, withSite } from "./siteUi.ts";
import type { Plan } from "./types.ts";

const plan = (extra: Partial<Plan> = {}): Plan => ({ walls: [], openings: [], rooms: [], items: [], ...extra });
const state = (p: Plan = plan()): HistoryState => ({ plan: p, past: [], future: [], gesture: false });
const apply = (s: HistoryState, step: Partial<HistoryState>): HistoryState => ({ ...s, ...step });
const near = (a: number, b: number, eps = 0.011) => assert.ok(Math.abs(a - b) <= eps, `${a} vs ${b}`);

test("enabling puts the middle of a never-aligned plan on the location, at any bearing, and leaves a nudged plan alone", () => {
  const b = { x0: 2, y0: 4, x1: 12, y1: 10 };
  for (const bearing of [0, 90, 156, 300]) {
    const { patch, centred } = enablePatch({ dx: 0, dy: 0 }, bearing, b);
    assert.equal(centred, true);
    const [x, y] = siteToPlan({ dx: patch.dx!, dy: patch.dy! }, bearing, [0, 0]); // the location point, on the plan
    near(x, 7);
    near(y, 7);
  }
  assert.deepEqual(enablePatch({ dx: 1, dy: 0 }, 0, b), { patch: { enabled: true }, centred: false });
  assert.deepEqual(enablePatch({ dx: 0, dy: 0 }, 0, null), { patch: { enabled: true }, centred: false });
});

test("coordinates are read from what people paste", () => {
  assert.deepEqual(parseCoords("51.47790000081094, -0.00150002973862"), { lat: 51.4779, lon: -0.0015 });
  assert.deepEqual(parseCoords("51.48 0.12"), { lat: 51.48, lon: 0.12 });
  assert.deepEqual(parseCoords("51,48 0,12"), { lat: 51.48, lon: 0.12 });
  assert.deepEqual(parseCoords("51.48; -0.12"), { lat: 51.48, lon: -0.12 });
  assert.deepEqual(parseCoords("51.48\u00b0N, 0.12\u00b0E"), { lat: 51.48, lon: 0.12 });
  assert.deepEqual(parseCoords("33.9 S 151.2 E"), { lat: -33.9, lon: 151.2 });
  assert.deepEqual(parseCoords("40.7N 74.0W"), { lat: 40.7, lon: -74 });
});

test("things that are not a coordinate pair are refused", () => {
  for (const bad of ["", "51.48", "51.48, 0.12, 5", "91, 10", "10, 181", "home, away", "51.48 0.12 north", "abc 12 34"]) assert.equal(parseCoords(bad), null, bad);
});

test("one number from a field", () => {
  assert.equal(parseNumber(" 12.5 "), 12.5);
  assert.equal(parseNumber("-3,5"), -3.5);
  for (const bad of ["", "x", "1e3", "1.2.3", "--1"]) assert.equal(parseNumber(bad), null, bad);
});

test("bearings wrap to 0..359 and the radius is clamped", () => {
  assert.equal(normBearing(-10), 350);
  assert.equal(normBearing(360), 0);
  assert.equal(normBearing(359.6), 0);
  assert.equal(clampRadius(5000), 600);
  assert.equal(clampRadius(10), 100);
});

test("a nudge moves the map the way the arrow points, at any bearing", () => {
  const site = { dx: 3, dy: -2 };
  for (const bearing of [0, 90, 156, 250]) {
    for (const [way, v] of [["right", [1, 0]], ["left", [-1, 0]], ["up", [0, -1]], ["down", [0, 1]]] as const) {
      const moved = nudgeSite(site, bearing, way, 5);
      const p: [number, number] = [20, -7]; // some point of the map, in site axes
      const before = siteToPlan(site, bearing, p);
      const after = siteToPlan(moved, bearing, p);
      near(after[0] - before[0], v[0] * 5);
      near(after[1] - before[1], v[1] * 5);
    }
  }
  assert.deepEqual(nudgeSite({ dx: 0, dy: 0 }, 0, "right", 1), { dx: -1, dy: 0 }); // the map slides east of the flat: the flat is one metre further west
});

test("dragging by a plan vector moves the map by exactly that vector", () => {
  const moved = dragSite({ dx: 1, dy: 1 }, 156, [4.2, -1.3]);
  const p: [number, number] = [-12, 30];
  const a = siteToPlan({ dx: 1, dy: 1 }, 156, p);
  const b = siteToPlan(moved, 156, p);
  near(b[0] - a[0], 4.2);
  near(b[1] - a[1], -1.3);
});

test("the site is validated and completed, never beyond what is valid", () => {
  assert.deepEqual(mergeSite(undefined, {}), DEFAULT_SITE);
  const m = mergeSite(undefined, { enabled: true, radius: 9999, dx: 1e6, layers: { satellite: true } });
  assert.equal(m.enabled, true);
  assert.equal(m.radius, 600);
  assert.equal(m.dx, 500);
  assert.equal(m.layers.satellite, true);
  assert.equal(m.layers.buildings, true);
  assert.equal(mergeSite(m, { source: "manual", lat: 47.6, lon: 23.5 }).source, "manual");
  assert.equal(mergeSite(m, { source: "manual", lat: 147, lon: 23.5 }).source, "home"); // out-of-range coordinates cannot be kept
});

test("changing the site is one undo step, and nothing changed leaves none", () => {
  let s = state();
  assert.deepEqual(setSiteIn(s, {}), {}, "no site is invented");
  s = apply(s, setSiteIn(s, { enabled: true }));
  assert.equal(s.plan.site?.enabled, true);
  assert.equal(s.past.length, 1);
  assert.deepEqual(setSiteIn(s, { enabled: true }), {}, "same value, no step");
  s = apply(s, setSiteIn(s, { layers: { trees: false } }));
  assert.equal(s.plan.site?.layers.trees, false);
  assert.equal(s.plan.site?.layers.buildings, true);
  s = apply(s, undoStep(s));
  assert.equal(s.plan.site?.layers.trees, true);
  s = apply(s, undoStep(s));
  assert.equal(s.plan.site, undefined, "undo takes the first change back to no site at all");
  s = apply(s, redoStep(s));
  assert.equal(s.plan.site?.enabled, true);
});

test("a drag is one undo step however many moves it has", () => {
  let s = state(plan({ site: siteOf({ enabled: true }) }));
  s = apply(s, beginEdit(s));
  for (let i = 1; i <= 20; i++) s = apply(s, setSiteIn(s, { dx: i, dy: -i }));
  s = apply(s, endEdit(s));
  assert.equal(s.past.length, 1);
  assert.equal(s.plan.site?.dx, 20);
  s = apply(s, undoStep(s));
  assert.equal(s.plan.site?.dx, 0);
});

test("a plan saved without a site loads unchanged; a site in a file is made valid and survives export and import", () => {
  const old = plan({ bearing: 156 });
  assert.equal(withSite(old), old);
  assert.equal("site" in withSite(JSON.parse(JSON.stringify(old))), false);
  const mine = plan({ bearing: 156, site: siteOf({ enabled: true, source: "manual", lat: 51.48, lon: 0.12, dx: 2.5, dy: -4, radius: 400, layers: { ...DEFAULT_SITE.layers, satellite: true } }) });
  const imported = withSite(JSON.parse(JSON.stringify(mine)));
  assert.deepEqual(imported, mine);
  const messy = withSite({ ...old, site: { source: "manual", lat: "x", dx: 9999, radius: 1, layers: { trees: false, bogus: true } } as never });
  assert.equal(messy.site?.source, "home");
  assert.equal(messy.site?.dx, 500);
  assert.equal(messy.site?.radius, 100);
  assert.equal(messy.site?.layers.trees, false);
  assert.equal("bogus" in (messy.site?.layers ?? {}), false);
});

test("credits: the data layer's lines win, the photo's is added when none names it", () => {
  assert.deepEqual(creditsOf(undefined, false), SITE_CREDITS);
  assert.deepEqual(creditsOf(["A", "B"], false), ["A", "B"]);
  assert.equal(creditsOf(["A"], true).length, 2);
  assert.deepEqual(creditsOf(["A", "Imagery: Esri"], true), ["A", "Imagery: Esri"]);
});
