import test from "node:test";
import assert from "node:assert/strict";
import { cleanWall, nightDim, pixelShift, startMs, WALL_DEFAULTS } from "./wall.ts";

test("anything that is not a valid setting falls back to the default, field by field", () => {
  assert.deepEqual(cleanWall(undefined), WALL_DEFAULTS);
  assert.deepEqual(cleanWall({ on: "yes", kinds: "all", secs: "x", startMin: -3, dim: 1, shift: null }), WALL_DEFAULTS);
  assert.deepEqual(cleanWall({ on: true, kinds: ["clock"], secs: 30, startMin: 5, dim: false, shift: false }), { on: true, kinds: ["clock"], secs: 30, startMin: 5, dim: false, shift: false });
});

test("kinds keep the fixed order, drop unknown names and repeats", () => {
  assert.deepEqual(cleanWall({ kinds: ["house", "bogus", "overview", "house"] }).kinds, ["overview", "house"]);
  assert.deepEqual(cleanWall({ kinds: [] }).kinds, [], "choosing nothing is kept: the scheduler shows the clock");
});
test("optional sky and advisor slides are accepted without changing existing defaults", () => {
  assert.deepEqual(cleanWall({ kinds: ["sky", "advisor", "sky"] }).kinds, ["sky", "advisor"]);
  assert.deepEqual(WALL_DEFAULTS.kinds, ["overview", "rooms", "clock", "house"]);
});

test("numbers are kept inside sane limits", () => {
  assert.equal(cleanWall({ secs: 1 }).secs, 5);
  assert.equal(cleanWall({ secs: 99999 }).secs, 300);
  assert.equal(cleanWall({ startMin: 99999 }).startMin, 240);
  assert.equal(cleanWall({ secs: NaN }).secs, WALL_DEFAULTS.secs);
});

test("always on (0 minutes) comes back a minute after a touch, never at once", () => {
  assert.equal(startMs({ ...WALL_DEFAULTS, startMin: 0 }), 60_000);
  assert.equal(startMs({ ...WALL_DEFAULTS, startMin: 5 }), 300_000);
});

test("night dimming: none by day, strongest at night, never brighter as it gets darker", () => {
  assert.equal(nightDim(1), 0);
  assert.equal(nightDim(0.5), 0);
  assert.ok(nightDim(0) > 0.5 && nightDim(0) < 1, "dark but still readable");
  let last = 0;
  for (let d = 1; d >= 0; d -= 0.05) {
    const v = nightDim(d);
    assert.ok(v >= last - 1e-9, `daylight ${d}`);
    last = v;
  }
  assert.equal(nightDim(NaN), 0);
});

test("the pixel shift stays within a few pixels, changes every minute and comes round again", () => {
  const seen = new Set<string>();
  for (let m = 0; m < 18; m++) {
    const p = pixelShift(m);
    assert.ok(Math.abs(p.x) <= 4 && Math.abs(p.y) <= 4);
    seen.add(`${p.x},${p.y}`);
    if (m > 0) assert.notDeepEqual(p, pixelShift(m - 1), `minute ${m} moves`);
  }
  assert.ok(seen.size >= 8);
  assert.deepEqual(pixelShift(-1), pixelShift(8), "negative minutes wrap too");
});
