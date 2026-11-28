import assert from "node:assert/strict";
import test from "node:test";
import { withDesign } from "./designFields.ts";
import type { Trace } from "./designTypes.ts";
import { sanitizeTrace, turnOf, withTrace } from "./trace.ts";
import type { Plan } from "./types.ts";

const base: Trace = { resourceId: "trace-abc123", w: 2000, h: 1400, x: 5, y: 4, scale: 0.01, rotation: 12, opacity: 0.5, locked: false };
const empty = (): Plan => ({ walls: [], openings: [], rooms: [], items: [] });

test("a valid trace comes back as it was", () => {
  assert.deepEqual(sanitizeTrace(base), base);
  assert.deepEqual(sanitizeTrace({ ...base, hidden: true, locked: true }), { ...base, hidden: true, locked: true });
});

test("a trace pointing at nothing usable is dropped, so the plan loads without it", () => {
  assert.equal(sanitizeTrace({ ...base, resourceId: "../etc/passwd" }), undefined);
  assert.equal(sanitizeTrace({ ...base, resourceId: undefined }), undefined);
  assert.equal(sanitizeTrace({ ...base, w: 0 }), undefined);
  assert.equal(sanitizeTrace({ ...base, h: 100000 }), undefined);
  assert.equal(sanitizeTrace("trace"), undefined);
});

test("numbers are clamped into range instead of refusing the plan", () => {
  const t = sanitizeTrace({ ...base, scale: 50, opacity: 0, x: 1e9, rotation: 540 });
  assert.equal(t?.scale, 1);
  assert.equal(t?.opacity, 0.05);
  assert.equal(t?.x, 1000);
  assert.equal(t?.rotation, 180);
  assert.equal(sanitizeTrace({ ...base, scale: "big" })?.scale, 0.01, "a non-number falls back to the default");
});

test("angles are kept in (-180, 180]", () => {
  assert.equal(turnOf(190), -170);
  assert.equal(turnOf(-190), 170);
  assert.equal(turnOf(180), 180);
  assert.equal(turnOf(-180), 180);
  assert.equal(turnOf(360), 0);
});

test("setting and clearing a plan's trace", () => {
  const set = withTrace(empty(), base);
  assert.deepEqual(set.trace, base);
  assert.equal("trace" in withTrace(set, null), false);
});

test("withDesign repairs a loaded plan and leaves a clean one alone", () => {
  const clean = { ...empty(), trace: base };
  assert.equal(withDesign(clean), clean);
  const fixed = withDesign({ ...empty(), trace: { ...base, opacity: 9 } });
  assert.equal(fixed.trace?.opacity, 1);
  assert.equal("trace" in withDesign({ ...empty(), trace: { ...base, resourceId: "no way" } }), false);
});
