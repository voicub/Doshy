import assert from "node:assert/strict";
import { test } from "node:test";
import { identityOf, parsePlanIdentity, splitPlanFile } from "./planFile.ts";

const plan = { walls: [], openings: [], rooms: [], items: [] };

test("an exported plan file comes apart into the plan, its custom pieces and its identity; neither extra block stays in the plan", () => {
  const file = { ...plan, bearing: 30, custom: { pieces: [] }, dashboard: { name: " Garden  house ", icon: "tree", color: "#ABCDEF", description: "out back" } };
  const parts = splitPlanFile(file);
  assert.deepEqual(parts.plan, { ...plan, bearing: 30 });
  assert.deepEqual(parts.custom, { pieces: [] });
  assert.deepEqual(parts.identity, { name: "Garden house", icon: "tree", color: "#abcdef", description: "out back" });
});

test("an old plan file (no dashboard block) still loads, with no identity", () => {
  assert.deepEqual(splitPlanFile(plan), { plan, custom: undefined, identity: null });
});

test("the floor plan image block is taken out of the plan and handed over unchecked; the plan keeps its own trace", () => {
  const trace = { resourceId: "trace-0123456789abcdef01234567", w: 10, h: 10, x: 0, y: 0, scale: 0.01, rotation: 0, opacity: 0.5, locked: false };
  const parts = splitPlanFile({ ...plan, trace, traceImage: { mime: "image/png", b64: "AAAA" } });
  assert.deepEqual(parts.plan, { ...plan, trace });
  assert.deepEqual(parts.traceImage, { mime: "image/png", b64: "AAAA" });
});

test("a file that is not a plan is refused", () => {
  for (const bad of [null, [], "x", 5, {}, { walls: [], openings: [], rooms: [] }]) assert.throws(() => splitPlanFile(bad), /missing keys/);
});

test("the identity block is made safe: a name is needed, bad icons and colours are dropped, long texts are cut", () => {
  assert.equal(parsePlanIdentity({ icon: "tree" }), null);
  assert.equal(parsePlanIdentity({ name: "   " }), null);
  assert.equal(parsePlanIdentity({ name: 5 }), null);
  assert.equal(parsePlanIdentity("Home"), null);
  assert.deepEqual(parsePlanIdentity({ name: "x".repeat(100), icon: "Not Allowed!", color: "red", description: "d".repeat(500) }), { name: "x".repeat(60), icon: "", color: "", description: "d".repeat(280) });
});

test("a plan's identity for export is just its four fields", () => {
  assert.deepEqual(identityOf({ name: "Home", icon: "house", color: "", description: "" }), { name: "Home", icon: "house", color: "", description: "" });
});

test("a plan file carries only the NAME of its home, and a file without one keeps the four-field identity", () => {
  const d = { name: "Cabin", icon: "cabin", color: "", description: "" };
  assert.deepEqual(identityOf(d), d);
  assert.deepEqual(identityOf(d, "Holiday house"), { ...d, home: "Holiday house" });
  assert.equal(parsePlanIdentity({ ...d, home: "  Holiday\n house  " })?.home, "Holiday house");
  assert.equal(parsePlanIdentity({ ...d, home: "x".repeat(200) })?.home?.length, 40);
  assert.equal("home" in (parsePlanIdentity({ ...d, home: 7 }) ?? {}), false);
  assert.equal(JSON.stringify(identityOf(d, "Holiday house")).includes("http"), false, "never an address");
});
