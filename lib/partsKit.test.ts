import assert from "node:assert/strict";
import test from "node:test";
import { bowlProfile, cushion, drawerFront, roundTable, taperedLegs, turned, vaseProfile } from "./partsKit.ts";

test("turned sizes the part to its profile and stands it on the base height", () => {
  const p = turned(0.1, 0.5, -0.2, [[0.1, 0], [0.2, 0.3]], "#fff");
  assert.equal(p.shape, "lathe");
  assert.deepEqual(p.s, [0.4, 0.3, 0.4]);
  assert.deepEqual(p.p, [0.1, 0.65, -0.2]);
});

test("profile builders start at the base and rise", () => {
  for (const prof of [bowlProfile(0.1, 0.06), vaseProfile(0.1, 0.3)]) {
    assert.equal(prof[0][1], 0);
    assert.ok(prof.every(([r, h], i) => r > 0 && (i === 0 || h > prof[i - 1][1])));
  }
});

test("cushions are rounded fabric with a bevel smaller than the cushion", () => {
  const c = cushion(0, 0.4, 0, 0.6, 0.14, 0.6, "#aaa", { m: true });
  assert.equal(c.tex, "fabric");
  assert.equal(c.m, true);
  assert.ok(c.bevel! > 0 && c.bevel! * 2 <= 0.14);
});

test("a drawer front keeps its gap, its handle is detail 2 and sits on the face", () => {
  const [front, handle] = drawerFront(0, 0.3, 0.2, 0.5, 0.2, "#eee", { handle: "bar-x", m: true });
  assert.ok(front.s[0] < 0.5 && front.s[0] > 0.4, "the front is a little narrower than the opening, leaving a gap");
  assert.equal(front.m, true);
  assert.equal(handle.detail, 2);
  assert.ok(handle.p[2] > front.p[2] + front.s[2] / 2);
  assert.equal(drawerFront(0, 0, 0, 0.5, 0.2, "#eee").length, 1);
});

test("tapered legs and a round table stay inside their footprint", () => {
  const legs = taperedLegs(1.2, 0.8, 0.45, "#333");
  assert.equal(legs.length, 4);
  for (const l of legs) assert.ok(Math.abs(l.p[0]) + l.s[0] / 2 <= 0.6 && Math.abs(l.p[2]) + l.s[2] / 2 <= 0.4 && l.p[1] - l.s[1] / 2 >= -1e-9);
  const [top, stem] = roundTable(0, 0, 0.9, 0.75, "#c9a26b", { m: true });
  assert.equal(top.p[1] + top.s[1] / 2, 0.75);
  assert.ok(stem.p[1] + stem.s[1] / 2 <= 0.75);
  assert.ok(Math.abs(top.p[0]) < 1e-9);
});
