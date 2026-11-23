import test from "node:test";
import assert from "node:assert/strict";
import { HOUR, MIN, alignAt, dutyPct, energyDelta, fmtDuration, kwhFactor, minMaxAvg, niceTicks, numericSteps, onIntervals, parseHistory, resample, sampleAt, timeTicks, totalMs } from "./stats.ts";

const T0 = Date.UTC(2026, 0, 1);
const iso = (ms: number) => new Date(T0 + ms).toISOString();

test("resample keeps short series and time-weights long ones", () => {
  const raw = resample([0, 10], [1, 2], 0, 100, 5);
  assert.deepEqual(raw.v, [1, 2]);
  // 10 for the first half of the only bucket, 20 for the second: mean 15, not the sample mean of 3 samples
  const r = resample([0, 50, 60], [10, 20, 20], 0, 100, 1);
  assert.equal(r.v.length, 1);
  assert.ok(Math.abs(r.v[0] - 15) < 1e-9);
  assert.equal(r.t[0], 50);
});

test("resample skips buckets before the first sample and holds the last value", () => {
  const r = resample([50, 60, 70], [4, 6, 8], 0, 100, 2);
  assert.deepEqual(r.t, [75]);
  assert.ok(Math.abs(r.v[0] - (4 * 10 + 6 * 10 + 8 * 30) / 50) < 1e-9);
});

test("parseHistory: numeric becomes num, binary stays state, attrs become entity|attr, start is clamped", () => {
  const from = T0;
  const raw = [
    [
      { entity_id: "sensor.t", state: "20.5", last_updated: iso(-HOUR) },
      { state: "unavailable", last_updated: iso(HOUR) },
      { state: "21.5", last_updated: iso(2 * HOUR) },
    ],
    [
      { entity_id: "binary_sensor.w", state: "off", last_updated: iso(-5) },
      { state: "on", last_updated: iso(HOUR) },
    ],
    [
      { entity_id: "climate.c", state: "heat", last_updated: iso(0), attributes: { hvac_action: "idle", temperature: 22 } },
      { state: "heat", last_updated: iso(HOUR), attributes: { hvac_action: "heating", temperature: 22 } },
      { state: "heat", last_updated: iso(2 * HOUR), attributes: { current_temperature: 20 } },
    ],
  ];
  const out = parseHistory(raw, from, from + 3 * HOUR, 100, ["hvac_action", "temperature"]);
  assert.deepEqual(out["sensor.t"], { kind: "num", t: [from, from + 2 * HOUR], v: [20.5, 21.5] });
  assert.deepEqual(out["binary_sensor.w"], { kind: "state", changes: [{ t: from, s: "off" }, { t: from + HOUR, s: "on" }] });
  assert.deepEqual(out["climate.c|hvac_action"], { kind: "state", changes: [{ t: from, s: "idle" }, { t: from + HOUR, s: "heating" }] });
  assert.deepEqual(out["climate.c|temperature"], { kind: "state", changes: [{ t: from, s: "22" }] });
  assert.equal(out["climate.c"].kind, "state");
  assert.deepEqual(parseHistory({ message: "nope" }, from, from + 1, 10), {});
});

test("onIntervals integrates on-time, clamps to the range and holds the last state", () => {
  const ch = [{ t: -10, s: "on" }, { t: 20, s: "off" }, { t: 50, s: "unavailable" }, { t: 60, s: "on" }];
  const iv = onIntervals(ch, 0, 100, (s) => s === "on");
  assert.deepEqual(iv, [{ start: 0, end: 20 }, { start: 60, end: 100 }]);
  assert.equal(totalMs(iv), 60);
  assert.equal(dutyPct(iv, 0, 100), 60);
  assert.deepEqual(onIntervals([], 0, 100, () => true), []);
});

test("numericSteps drops text states and extends to the end", () => {
  assert.deepEqual(numericSteps([{ t: 0, s: "21" }, { t: 5, s: "unknown" }, { t: 8, s: "22.5" }], 20), [{ t: 0, v: 21 }, { t: 8, v: 22.5 }, { t: 20, v: 22.5 }]);
});

test("sampleAt / alignAt hold the previous sample", () => {
  const s = { kind: "num" as const, t: [10, 20, 30], v: [1, 2, 3] };
  assert.equal(sampleAt(s, 5), undefined);
  assert.equal(sampleAt(s, 10), 1);
  assert.equal(sampleAt(s, 25), 2);
  assert.equal(sampleAt(s, 99), 3);
  assert.deepEqual(alignAt([s, { kind: "num", t: [0], v: [9] }], 15), [1, 9]);
});

test("energyDelta sums rises and ignores meter resets; kWh units convert", () => {
  assert.ok(Math.abs(energyDelta([10, 10.5, 11, 0.2, 0.7]) - 1.5) < 1e-9);
  assert.equal(energyDelta([5]), 0);
  assert.equal(kwhFactor("Wh"), 0.001);
  assert.equal(kwhFactor("kWh"), 1);
});

test("minMaxAvg", () => {
  assert.deepEqual(minMaxAvg([1, 3, 2]), { min: 1, max: 3, avg: 2 });
  assert.equal(minMaxAvg([]), null);
});

test("niceTicks cover the range with round steps; degenerate ranges still work", () => {
  const n = niceTicks(18.3, 23.7, 4);
  assert.deepEqual(n.ticks, [18, 20, 22, 24]);
  assert.ok(n.lo <= 18.3 && n.hi >= 23.7);
  const flat = niceTicks(5, 5);
  assert.ok(flat.lo < 5 && flat.hi > 5);
});

test("timeTicks are ordered, inside the range and land on whole hours for day spans", () => {
  const from = new Date(2026, 0, 1, 10, 17).getTime();
  const ticks = timeTicks(from, from + 24 * HOUR, 6);
  assert.ok(ticks.length >= 3 && ticks.every((t, i) => t >= from && t <= from + 24 * HOUR && (i === 0 || t > ticks[i - 1])));
  assert.ok(ticks.every((t) => new Date(t).getMinutes() === 0));
});

test("fmtDuration", () => {
  assert.equal(fmtDuration(0), "0m");
  assert.equal(fmtDuration(45 * MIN), "45m");
  assert.equal(fmtDuration(HOUR + 5 * MIN), "1h 05m");
  assert.equal(fmtDuration(20_000), "20s");
});
