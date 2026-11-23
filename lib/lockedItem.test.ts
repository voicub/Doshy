import test from "node:test";
import assert from "node:assert/strict";
import { commitPlan, undoStep, redoStep, type HistoryState } from "./history.ts";
import { checkPlan, getPlan, putPlan } from "./db/plans.ts";
import { tempDb } from "./db/testDb.ts";
import type { Item, Plan } from "./types.ts";

const item = (extra: Partial<Item> = {}): Item => ({ id: "rug", kind: "rug", x: 1, y: 2, rot: 0, w: 2, d: 1.4, h: 0.02, ...extra });
const plan = (items: Item[]): Plan => ({ walls: [], openings: [], rooms: [], items });
/** What the store's `patch("item", id, p)` does to the list. */
const patched = (p: Plan, id: string, change: Partial<Item>): Plan => ({ ...p, items: p.items.map((o) => (o.id === id ? { ...o, ...change } : o)) });
const apply = (s: HistoryState, r: Partial<HistoryState>): HistoryState => ({ ...s, ...r });

test("locking is one undo step and undo/redo restore the flag", () => {
  let s: HistoryState = { plan: plan([item()]), past: [], future: [], gesture: false };
  s = apply(s, commitPlan(s, patched(s.plan, "rug", { locked: true })));
  assert.equal(s.plan.items[0].locked, true);
  assert.equal(s.past.length, 1);
  s = apply(s, commitPlan(s, patched(s.plan, "rug", { locked: undefined })));
  assert.equal(s.plan.items[0].locked, undefined);
  s = apply(s, undoStep(s));
  assert.equal(s.plan.items[0].locked, true);
  s = apply(s, undoStep(s));
  assert.equal(s.plan.items[0].locked, undefined);
  s = apply(s, redoStep(s));
  assert.equal(s.plan.items[0].locked, true);
});

test("a locked item survives the server round trip, unlocked items carry no flag", () => {
  const p = plan([item({ locked: true }), item({ id: "sofa", kind: "sofa" })]);
  const t = tempDb();
  try {
    const { json } = checkPlan(p);
    putPlan(t.db, { json, baseRev: 0, format: 3 });
    const got = JSON.parse(getPlan(t.db)!.json) as Plan;
    assert.deepEqual(got.items.map((i) => i.locked), [true, undefined]);
  } finally {
    t.cleanup();
  }
});
