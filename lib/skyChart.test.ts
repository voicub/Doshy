import assert from "node:assert/strict";
import test from "node:test";
import { chartPoint, compassPoints, directionWord, heightWord, southUp } from "./skyChart.ts";

const near = (a: number, b: number) => assert.ok(Math.abs(a - b) < 1e-9, `${a} vs ${b}`);

test("the zenith is the middle of the chart whatever the azimuth", () => {
  for (const az of [0, 90, 200]) {
    const p = chartPoint(90, az, false);
    near(p.x, 0);
    near(p.y, 0);
  }
});

test("north up: north is at the top, east on the left, and the horizon is the rim", () => {
  const n = chartPoint(0, 0, false);
  near(n.x, 0);
  near(n.y, -1);
  const e = chartPoint(0, 90, false);
  near(e.x, -1);
  near(e.y, 0);
  near(Math.hypot(chartPoint(0, 123, false).x, chartPoint(0, 123, false).y), 1);
});

test("a southern chart is the same sky turned half a round: south on top", () => {
  const s = chartPoint(0, 180, true);
  near(s.x, 0);
  near(s.y, -1);
  const c = compassPoints(true);
  assert.deepEqual(c.map((p) => p.label), ["N", "E", "S", "W"]);
  near(c[0].at.y, 1);
  assert.equal(southUp(-33.9), true);
  assert.equal(southUp(51.5), false);
});

test("halfway up the sky is half the way to the rim", () => {
  const p = chartPoint(45, 270, false);
  near(Math.hypot(p.x, p.y), 0.5);
});

test("compass and height words", () => {
  assert.equal(directionWord(0), "north");
  assert.equal(directionWord(359), "north");
  assert.equal(directionWord(135), "south-east");
  assert.equal(directionWord(-90), "west");
  assert.equal(heightWord(5), "low");
  assert.equal(heightWord(70), "very high");
});
