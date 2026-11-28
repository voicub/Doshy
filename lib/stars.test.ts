import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { bvToRgb, getStars } from "./stars.ts";

test("real compact catalogue decodes once, sorted, finite and in range", () => {
  const c = getStars();
  assert.equal(getStars(), c);
  assert.equal(c.count, 2887);
  for (const a of [c.ra, c.dec, c.mag, c.bv]) assert.equal(a.length, c.count);
  for (let i = 0; i < c.count; i++) {
    assert.ok(c.ra[i] >= 0 && c.ra[i] < 360);
    assert.ok(c.dec[i] >= -90 && c.dec[i] <= 90);
    assert.ok(Number.isFinite(c.bv[i]));
    assert.ok(c.mag[i] <= 5.5);
    if (i) assert.ok(c.mag[i] >= c.mag[i - 1]);
  }
  const source = readFileSync(new URL("./starData.ts", import.meta.url));
  assert.ok(source.length < 150_000);
  assert.ok(gzipSync(source).length < 80_000);
});

test("named Sirius, Polaris and Betelgeuse match BSC J2000 within packing precision", () => {
  const c = getStars();
  assert.ok(c.names.length >= 60);
  for (const [name, ra, dec] of [["Sirius", 101.2871, -16.7161], ["Polaris", 37.9546, 89.2641], ["Betelgeuse", 88.7929, 7.4071]] as const) {
    const named = c.names.find((s) => s.name === name);
    assert.ok(named);
    assert.ok(Math.abs(c.ra[named.index] - ra) < 0.006);
    assert.ok(Math.abs(c.dec[named.index] - dec) < 0.003);
  }
  for (const n of c.names) assert.ok(n.index >= 0 && n.index < c.count && n.name.length > 0);
});

test("constellation endpoints resolve to catalogue stars and valid labels", () => {
  const c = getStars();
  assert.ok(c.constellations.length >= 10);
  for (const group of c.constellations) {
    assert.ok(group.label.ra >= 0 && group.label.ra < 360 && Math.abs(group.label.dec) <= 90);
    assert.ok(group.lines.length > 0);
    for (const pair of group.lines) for (const index of pair) assert.ok(Number.isInteger(index) && index >= 0 && index < c.count);
  }
});

test("B-V colors clamp safely and range from blue-white to red", () => {
  for (const bv of [-100, -0.4, 0.65, 2, 100, NaN, Infinity]) {
    for (const value of bvToRgb(bv)) assert.ok(Number.isFinite(value) && value >= 0 && value <= 1);
  }
  const blue = bvToRgb(-0.3);
  const red = bvToRgb(2);
  assert.ok(blue[2] > blue[0]);
  assert.ok(red[0] > red[2]);
  assert.deepEqual(bvToRgb(NaN), bvToRgb(0.65));
});
