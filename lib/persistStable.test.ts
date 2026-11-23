import assert from "node:assert/strict";
import { test } from "node:test";
import { createChangeOnlyStorage } from "./persistStable.ts";

test("an unchanged slice is not serialised again, a changed one is", () => {
  const writes: string[] = [];
  const storage = createChangeOnlyStorage<{ plan: object; view: string }>(() => ({ getItem: () => null, setItem: (_k, v) => void writes.push(v), removeItem: () => undefined }))!;
  const plan = { walls: [1, 2, 3] };
  storage.setItem("k", { state: { plan, view: "live" }, version: 1 });
  storage.setItem("k", { state: { plan, view: "live" }, version: 1 }); // a poll: fresh partialize object, same fields
  assert.equal(writes.length, 1);
  storage.setItem("k", { state: { plan, view: "plan" }, version: 1 });
  storage.setItem("k", { state: { plan: { walls: [1, 2, 3] }, view: "plan" }, version: 1 }); // a new plan object is a change even if equal in content
  storage.setItem("k", { state: { plan: { walls: [1, 2, 3] }, view: "plan" }, version: 2 });
  assert.equal(writes.length, 4);
});
