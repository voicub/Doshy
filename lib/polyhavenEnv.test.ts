import assert from "node:assert/strict";
import test from "node:test";
import { DataUtils, Euler, Vector3 } from "three";
import { hdriResFor } from "./polyhaven.ts";
import { INTENSITY_RANGE, ROTATION_RANGE, SUN_MIN_ELEVATION, azimuthOf, findSun, hdriGain, hdriMode, hdriRotation, lightingCredit, sanitizeHdri, sunDirection, sunMatchRotation, wrapRad, type HdriSetting } from "./polyhavenEnv.ts";
import { TIER_ORDER, knobsOf } from "./quality.ts";

const RES_ID = `hdri-${"ab12".repeat(6)}`;
const base = { resourceId: RES_ID, assetId: "kloppenheim_06", name: "Kloppenheim 06" };
const valid = (extra: Record<string, unknown> = {}): HdriSetting => {
  const s = sanitizeHdri({ ...base, ...extra });
  assert.ok(s, "a valid setting must survive the scrub");
  return s;
};
const deg = (d: number) => (d * Math.PI) / 180;

// ---- the saved setting --------------------------------------------------------------------------------------------------------

test("a minimal record gets every default and a credit line", () => {
  const s = valid();
  assert.equal(s.res, "1k");
  assert.equal(s.intensity, INTENSITY_RANGE.def);
  assert.equal(s.rotation, 0);
  assert.deepEqual([s.background, s.matchSun, s.alsoLive], [false, false, false]);
  assert.equal(s.credit, lightingCredit("Kloppenheim 06"));
  assert.equal("sun" in s, false, "a sun nobody looked for stays unknown, not null");
});

test("anything that is not a stored hdri is refused", () => {
  for (const bad of [null, undefined, 3, "x", [], {}, { ...base, resourceId: "mat-" + "a".repeat(24) }, { ...base, resourceId: "hdri-short" }, { ...base, resourceId: `hdri-${"A".repeat(24)}` }, { ...base, resourceId: "../" + RES_ID }, { ...base, assetId: "../etc/passwd" }, { ...base, assetId: 5 }, { resourceId: RES_ID }]) {
    assert.equal(sanitizeHdri(bad), null, JSON.stringify(bad));
  }
});

test("numbers are clamped, junk numbers fall back to the default", () => {
  assert.equal(valid({ intensity: 99 }).intensity, INTENSITY_RANGE.max);
  assert.equal(valid({ intensity: -4 }).intensity, INTENSITY_RANGE.min);
  assert.equal(valid({ intensity: Number.NaN }).intensity, INTENSITY_RANGE.def);
  assert.equal(valid({ intensity: "2" }).intensity, INTENSITY_RANGE.def);
  assert.equal(valid({ rotation: 720 }).rotation, ROTATION_RANGE.max);
  assert.equal(valid({ rotation: -Infinity }).rotation, 0);
  assert.equal(valid({ rotation: 45 }).rotation, 45);
});

test("flags only accept real booleans, the size only 1k or 2k", () => {
  const s = valid({ background: "yes", matchSun: 1, alsoLive: true, res: "8k" });
  assert.deepEqual([s.background, s.matchSun, s.alsoLive, s.res], [false, false, true, "1k"]);
  assert.equal(valid({ res: "2k" }).res, "2k");
});

test("text is cleaned and cut, the name falls back to the id", () => {
  const s = valid({ name: `  <b>Evil</b>\n"quote"\u0000  ${"x".repeat(500)}`, authors: ["A", `<i>B</i>`, 7, ...Array(20).fill("z")], credit: "<script>alert(1)</script>" });
  assert.ok(s.name.length <= 80 && !/[<>"\u0000]/.test(s.name));
  assert.ok(s.authors.length <= 6 && s.authors.every((a) => !/[<>]/.test(a)));
  assert.ok(!/[<>]/.test(s.credit));
  assert.equal(valid({ name: 5 }).name, base.assetId);
});

test("a hostile object with extra keys keeps only the known ones", () => {
  const s = sanitizeHdri(JSON.parse(`{"resourceId":"${RES_ID}","assetId":"a","__proto__":{"x":1},"constructor":{"y":2},"evil":true}`));
  assert.ok(s);
  assert.deepEqual(Object.keys(s).sort(), ["alsoLive", "assetId", "authors", "background", "credit", "intensity", "matchSun", "name", "res", "resourceId", "rotation"]);
});

test("a saved sun is checked: null stays null, a bad one is 'not looked yet'", () => {
  assert.equal(valid({ sun: null }).sun, null);
  assert.equal("sun" in valid({ sun: { azimuth: "x", elevation: 1 } }), false);
  assert.equal("sun" in valid({ sun: "sun" }), false);
  const s = valid({ sun: { azimuth: 7, elevation: 9 } }).sun;
  assert.ok(s);
  assert.ok(Math.abs(s.azimuth) <= Math.PI && s.elevation <= Math.PI / 2);
});

test("scrubbing is idempotent", () => {
  const once = valid({ intensity: 1.3, rotation: 30, sun: { azimuth: 1, elevation: 0.5 }, matchSun: true });
  assert.deepEqual(sanitizeHdri(once), once);
});

// ---- which tiers load -----------------------------------------------------------------------------------------------------------

test("only tiers with image based light load a picture, and Ultra gets the bigger one", () => {
  for (const tier of TIER_ORDER) {
    const loads = hdriResFor(tier) !== null;
    assert.equal(loads, knobsOf(tier).ibl, `${tier}: the resolution rule and the tier's ibl knob agree`);
    assert.equal(hdriMode(valid(), knobsOf(tier).ibl, true) !== null, loads);
  }
  assert.equal(hdriResFor("eco"), null);
  assert.equal(hdriResFor("low"), null);
  assert.equal(hdriResFor("medium"), "1k");
  assert.equal(hdriResFor("ultra"), "2k");
});

test("the Studio view uses the picture, the Live view only on request, nothing without a setting", () => {
  assert.equal(hdriMode(valid(), true, true), "studio");
  assert.equal(hdriMode(valid(), true, false), null);
  assert.equal(hdriMode(valid({ alsoLive: true }), true, false), "live");
  assert.equal(hdriMode(null, true, true), null);
  assert.equal(hdriMode(valid({ alsoLive: true }), false, false), null, "Eco and Light never");
});

// ---- strength -------------------------------------------------------------------------------------------------------------------

test("Studio strength follows the slider and ignores the hour", () => {
  assert.equal(hdriGain(1, true, 0), hdriGain(1, true, 1));
  assert.ok(hdriGain(2, true, 1) > hdriGain(1, true, 1) && hdriGain(1, true, 1) > hdriGain(0.5, true, 1));
});

test("Live strength is dimmed by daylight: dark at night, dimmer than the Studio by day", () => {
  assert.equal(hdriGain(1, false, 0), 0);
  assert.ok(hdriGain(1, false, 0.5) > 0 && hdriGain(1, false, 0.5) < hdriGain(1, false, 1));
  assert.ok(hdriGain(1, false, 1) < hdriGain(1, true, 1), "reflections are a hint, not the light");
  assert.equal(hdriGain(1, false, 7), hdriGain(1, false, 1), "daylight is clamped");
  assert.equal(hdriGain(1, false, -3), 0);
});

test("strength survives junk input", () => {
  for (const v of [Number.NaN, Infinity, -Infinity]) {
    assert.ok(Number.isFinite(hdriGain(v, true, v)) && Number.isFinite(hdriGain(v, false, v)));
  }
  assert.equal(hdriGain(1000, true, 1), hdriGain(INTENSITY_RANGE.max, true, 1));
});

// ---- turning the picture --------------------------------------------------------------------------------------------------------

test("wrapRad lands in (-pi, pi]", () => {
  for (const a of [0, 1, -1, Math.PI, -Math.PI, 3 * Math.PI, -7, 100]) {
    const w = wrapRad(a);
    assert.ok(w > -Math.PI - 1e-12 && w <= Math.PI + 1e-12, String(a));
    assert.ok(Math.abs(Math.cos(w) - Math.cos(a)) < 1e-9 && Math.abs(Math.sin(w) - Math.sin(a)) < 1e-9);
  }
  assert.equal(wrapRad(Number.NaN), 0);
});

test("the match rotation, applied the way three.js applies environmentRotation, puts the picture's sun on the app's sun", () => {
  const app = new Vector3(Math.cos(deg(-50)) * Math.cos(deg(30)), Math.sin(deg(30)), Math.sin(deg(-50)) * Math.cos(deg(30)));
  for (const picAz of [0, 1, 2.5, -2, 3.1]) {
    const pic = { azimuth: picAz, elevation: deg(35) };
    const turn = sunMatchRotation(pic, app);
    const d = sunDirection(pic);
    // three.js turns what the sky shows by +angle around Y (a vector rotated by an Euler), which is what the scene's environmentRotation does to the picture
    const turned = new Vector3(d.x, d.y, d.z).applyEuler(new Euler(0, turn, 0));
    assert.ok(Math.abs(wrapRad(azimuthOf(turned.x, turned.z) - azimuthOf(app.x, app.z))) < 1e-9, `picture azimuth ${picAz}`);
    assert.ok(Math.abs(turned.y - d.y) < 1e-9, "turning never tilts the sky");
  }
});

test("a sun straight overhead has no azimuth: no match turn", () => {
  assert.equal(sunMatchRotation({ azimuth: 1, elevation: 0.7 }, { x: 0, z: 0 }), 0);
});

test("the total turn adds the slider to the match only when asked and a sun exists", () => {
  const sun = { azimuth: 1, elevation: 0.6 };
  const app = { x: 1, z: 0 };
  const manual = deg(40);
  assert.ok(Math.abs(hdriRotation({ rotation: 40, matchSun: false, sun }, app) - manual) < 1e-12);
  assert.ok(Math.abs(hdriRotation({ rotation: 40, matchSun: true, sun: undefined }, app) - manual) < 1e-12);
  assert.ok(Math.abs(hdriRotation({ rotation: 40, matchSun: true, sun: null }, app) - manual) < 1e-12);
  const both = hdriRotation({ rotation: 40, matchSun: true, sun }, app);
  assert.ok(Math.abs(wrapRad(both - manual - sunMatchRotation(sun, app))) < 1e-12);
});

// ---- finding the sun ------------------------------------------------------------------------------------------------------------

const W = 512;
const H = 256;
/** A sky of `level` everywhere, with a hot disc (radius `r` px) of `hot` at the given azimuth/elevation (radians). */
function sky(level: number, hot: { az: number; el: number; value: number; r?: number } | null, nanAt?: number): Float32Array {
  const data = new Float32Array(W * H * 4).fill(level);
  for (let i = 3; i < data.length; i += 4) data[i] = 1;
  if (hot) {
    const cx = Math.round((hot.az / (2 * Math.PI) + 0.5) * W - 0.5);
    const cy = Math.round((0.5 - hot.el / Math.PI) * H - 0.5);
    const r = hot.r ?? 2;
    for (let y = cy - r; y <= cy + r; y++) for (let x = cx - r; x <= cx + r; x++) if (x >= 0 && x < W && y >= 0 && y < H) data.fill(hot.value, (y * W + x) * 4, (y * W + x) * 4 + 3);
  }
  if (nanAt !== undefined) data[nanAt] = Number.NaN;
  return data;
}
const near = (a: number, b: number, tol = deg(3)) => Math.abs(wrapRad(a - b)) <= tol;

test("finds a bright disc in a dim sky, in the picture's own frame", () => {
  for (const [az, el] of [[deg(90), deg(40)], [deg(-120), deg(15)], [deg(0), deg(70)], [deg(170), deg(8)]] as const) {
    const sun = findSun(sky(1, { az, el, value: 4000 }), W, H);
    assert.ok(sun, `sun at ${az},${el}`);
    assert.ok(near(sun.azimuth, az) && near(sun.elevation, el), `found ${sun.azimuth},${sun.elevation} wanted ${az},${el}`);
  }
});

test("finds the brightest of several lights", () => {
  const data = sky(1, { az: deg(20), el: deg(30), value: 500 });
  const second = sky(1, { az: deg(-100), el: deg(50), value: 9000 });
  for (let i = 0; i < data.length; i++) data[i] = Math.max(data[i], second[i]);
  const sun = findSun(data, W, H);
  assert.ok(sun && near(sun.azimuth, deg(-100)) && near(sun.elevation, deg(50)));
});

test("an overcast or plain sky has no sun", () => {
  assert.equal(findSun(sky(2, null), W, H), null);
  assert.equal(findSun(sky(2, { az: 0, el: deg(40), value: 6, r: 6 }), W, H), null, "a gentle brighter patch is not a sun");
  assert.equal(findSun(new Float32Array(W * H * 4), W, H), null, "a black picture");
});

test("a bright spot at or below the horizon is not a sun", () => {
  assert.equal(findSun(sky(1, { az: 1, el: deg(1), value: 5000 }), W, H), null);
  assert.equal(findSun(sky(1, { az: 1, el: deg(-30), value: 5000 }), W, H), null);
  const sun = findSun(sky(1, { az: 1, el: SUN_MIN_ELEVATION + deg(6), value: 5000 }), W, H);
  assert.ok(sun, "just above the limit still counts");
});

test("bad pixels and bad sizes never crash or win", () => {
  assert.equal(findSun(sky(1, null, 1000), W, H), null);
  const data = sky(1, { az: 0.5, el: deg(30), value: 4000 });
  data[4 * (W * 10 + 20)] = Number.NaN;
  const sun = findSun(data, W, H);
  assert.ok(sun && near(sun.azimuth, 0.5));
  assert.equal(findSun(new Float32Array(10), W, H), null, "too little data");
  assert.equal(findSun(new Float32Array(16), 2, 2), null, "too small to judge");
  assert.equal(findSun(sky(1, null), 0.5, H), null);
});

test("half-float pictures are read through the decoder", () => {
  const f = sky(1, { az: deg(60), el: deg(35), value: 3000 });
  const half = new Uint16Array(f.length);
  for (let i = 0; i < f.length; i++) half[i] = DataUtils.toHalfFloat(Math.min(f[i], 65504));
  const sun = findSun(half, W, H, DataUtils.fromHalfFloat);
  assert.ok(sun && near(sun.azimuth, deg(60)) && near(sun.elevation, deg(35)));
  assert.equal(findSun(half, W, H), null, "without the decoder the raw half-float numbers are not a sun (the encoded values are all alike)");
});
