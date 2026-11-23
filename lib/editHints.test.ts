import assert from "node:assert/strict";
import test from "node:test";
import { touchHint } from "./editHints.ts";

test("placing a piece names it", () => {
  assert.match(touchHint({ view: "furniture", tool: "add:sofa", placingLabel: "Sofa", selected: false }), /Sofa/);
});

test("a drag in progress gives a different hint per gesture", () => {
  const hint = (gesture: "move" | "elev") => touchHint({ view: "furniture", tool: "select", selected: true, gesture });
  assert.notEqual(hint("move"), hint("elev"));
});

test("every plan tool has a hint and an unknown tool falls back to select", () => {
  for (const t of ["select", "wall", "room", "door", "window", "pillar", "paint", "stairwell", "garden"]) assert.ok(touchHint({ view: "plan", tool: t, selected: false }).length > 0);
  assert.equal(touchHint({ view: "plan", tool: "nope", selected: false }), touchHint({ view: "plan", tool: "select", selected: false }));
});

test("Home Assistant mode hints differ before and after selecting", () => {
  assert.notEqual(touchHint({ view: "ha", tool: "select", selected: false }), touchHint({ view: "ha", tool: "select", selected: true }));
});
