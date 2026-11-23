import test from "node:test";
import assert from "node:assert/strict";
import { HISTORY_LIMIT, beginEdit, commitPlan, endEdit, keepSel, redoStep, undoStep, type HistoryState } from "./history.ts";
import type { Plan } from "./types.ts";

const plan = (n: number): Plan => ({ walls: [], openings: [], rooms: [], items: Array.from({ length: n }, (_, i) => ({ id: `i${i}`, kind: "k", x: 0, y: 0, rot: 0, w: 1, d: 1, h: 1 })) });
const fresh = (): HistoryState => ({ plan: plan(0), past: [], future: [], gesture: false });
/** Apply a partial result the way zustand's set() does. */
const apply = (s: HistoryState, p: Partial<HistoryState>): HistoryState => ({ ...s, ...p });

test("a discrete change is one undo step and clears redo", () => {
  let s = fresh();
  const p0 = s.plan;
  s = apply(s, commitPlan(s, plan(1)));
  s = apply(s, commitPlan(s, plan(2)));
  assert.equal(s.past.length, 2);
  s = apply(s, undoStep(s));
  assert.equal(s.plan.items.length, 1);
  assert.equal(s.future.length, 1);
  s = apply(s, commitPlan(s, plan(5)));
  assert.equal(s.future.length, 0);
  s = apply(s, undoStep(s));
  s = apply(s, undoStep(s));
  assert.equal(s.plan, p0);
  assert.deepEqual(undoStep(s), {}); // nothing left to undo
});

test("redo replays what undo took back", () => {
  let s = fresh();
  s = apply(s, commitPlan(s, plan(1)));
  s = apply(s, commitPlan(s, plan(2)));
  s = apply(s, undoStep(s));
  s = apply(s, undoStep(s));
  s = apply(s, redoStep(s));
  assert.equal(s.plan.items.length, 1);
  s = apply(s, redoStep(s));
  assert.equal(s.plan.items.length, 2);
  assert.deepEqual(redoStep(s), {});
});

test("a whole drag is exactly one undo step", () => {
  let s = fresh();
  s = apply(s, commitPlan(s, plan(1)));
  s = apply(s, beginEdit(s));
  for (let n = 2; n < 40; n++) s = apply(s, commitPlan(s, plan(n))); // 38 pointer moves
  s = apply(s, endEdit(s));
  assert.equal(s.gesture, false);
  assert.equal(s.past.length, 2);
  s = apply(s, undoStep(s));
  assert.equal(s.plan.items.length, 1); // back to before the drag in one step
});

test("a gesture that changed nothing leaves no step and keeps redo", () => {
  let s = fresh();
  s = apply(s, commitPlan(s, plan(1)));
  s = apply(s, undoStep(s));
  assert.equal(s.future.length, 1);
  s = apply(s, beginEdit(s));
  s = apply(s, endEdit(s));
  assert.equal(s.past.length, 0);
  assert.equal(s.future.length, 1);
});

test("a gesture that changes something drops redo", () => {
  let s = fresh();
  s = apply(s, commitPlan(s, plan(1)));
  s = apply(s, undoStep(s));
  s = apply(s, beginEdit(s));
  s = apply(s, commitPlan(s, plan(3)));
  assert.equal(s.future.length, 0);
});

test("committing the same plan again is not a step", () => {
  let s = fresh();
  s = apply(s, commitPlan(s, s.plan));
  assert.equal(s.past.length, 0);
});

test("history is capped", () => {
  let s = fresh();
  for (let n = 1; n <= HISTORY_LIMIT + 25; n++) s = apply(s, commitPlan(s, plan(n)));
  assert.equal(s.past.length, HISTORY_LIMIT);
  for (let n = 0; n < HISTORY_LIMIT + 10; n++) s = apply(s, undoStep(s));
  assert.equal(s.plan.items.length, 25); // the 25 oldest steps are gone
  assert.equal(s.future.length, HISTORY_LIMIT);
});

test("selection is dropped when undo removes what it points at", () => {
  const p = plan(2);
  assert.deepEqual(keepSel({ type: "item", id: "i1" }, p), { type: "item", id: "i1" });
  assert.equal(keepSel({ type: "item", id: "gone" }, p), null);
  assert.equal(keepSel({ type: "wall", id: "i1" }, p), null);
  assert.equal(keepSel(null, p), null);
});
