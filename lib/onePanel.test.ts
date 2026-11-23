import assert from "node:assert/strict";
import test from "node:test";
import { newestOpen, othersOf, type PanelKey } from "./onePanel.ts";

const set = (...k: PanelKey[]) => new Set<PanelKey>(k);

test("nothing new opened means nothing to close", () => {
  assert.equal(newestOpen(set("stats"), set("stats")), null);
  assert.equal(newestOpen(set("stats"), set()), null);
  assert.equal(newestOpen(set(), set()), null);
});

test("the panel opened last wins over the one already open", () => {
  assert.equal(newestOpen(set("stats"), set("stats", "left")), "left");
  assert.deepEqual(othersOf(set("stats", "left"), "left"), ["stats"]);
});

test("several opening at once: the last one listed wins", () => {
  assert.equal(newestOpen(set(), set("menu", "catalog")), "catalog");
});

test("a panel that stays open while another closes is not newly opened", () => {
  assert.equal(newestOpen(set("stats", "left"), set("left")), null);
});
