import assert from "node:assert/strict";
import { test } from "node:test";
import { INDEX_KEY, LEGACY_KEY, SLOTS, countsOf, listStash, markSeen, mirrorLegacy, planCounts, readStash, stashPlan, unseenStash, type Store } from "./planStash.ts";

/** A fake localStorage; `limit` makes it throw like a full one. */
function fakeStore(limit = Infinity): Store & { map: Map<string, string> } {
  const map = new Map<string, string>();
  const size = () => [...map.values()].reduce((n, v) => n + v.length, 0);
  return {
    map,
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => {
      if (size() - (map.get(k)?.length ?? 0) + v.length > limit) throw new Error("QuotaExceededError");
      map.set(k, v);
    },
    removeItem: (k) => void map.delete(k),
  };
}

const persisted = (marker: string, items = 3, version = 15) => JSON.stringify({ state: { plan: { walls: [{}, {}], rooms: [], openings: [], items: Array.from({ length: items }, (_, i) => ({ id: `${marker}${i}` })) }, view: "plan" }, version });

test("counts come from the plan inside a persisted value, and nothing else is accepted", () => {
  assert.deepEqual(countsOf(persisted("a", 5)), { items: 5, walls: 2, rooms: 0 });
  assert.deepEqual(planCounts({ items: [1], walls: "x" }), { items: 1, walls: 0, rooms: 0 });
  for (const bad of ["", "nope", "{}", '{"state":{}}', '{"state":{"plan":5}}', "null"]) assert.equal(countsOf(bad), null, bad);
});

test("a stashed plan is kept byte for byte with its time, reason and counts", () => {
  const s = fakeStore();
  const text = persisted("x", 101);
  const e = stashPlan(s, text, "before loading", 1000)!;
  assert.deepEqual({ at: e.at, reason: e.reason, items: e.items, walls: e.walls }, { at: 1000, reason: "before loading", items: 101, walls: 2 });
  assert.equal(readStash(s, e.slot), text);
  assert.equal(listStash(s)[0].slot, e.slot);
});

test("only the newest 10 are kept, the newest first, and each lives in its own housey-plan-before-load-N key", () => {
  const s = fakeStore();
  for (let i = 1; i <= 14; i++) stashPlan(s, persisted(`p${i}-`), "r", i * 1000);
  const list = listStash(s);
  assert.equal(list.length, SLOTS);
  assert.deepEqual(list.map((e) => e.at), [14, 13, 12, 11, 10, 9, 8, 7, 6, 5].map((n) => n * 1000));
  const keys = [...s.map.keys()].filter((k) => k.startsWith(`${LEGACY_KEY}-`) && k !== INDEX_KEY).sort();
  assert.equal(keys.length, SLOTS);
  assert.ok(list.every((e) => typeof e.slot === "number" && e.slot >= 1 && e.slot <= SLOTS));
  assert.match(readStash(s, list[0].slot)!, /p14-0/, "the newest text is in the newest entry");
  assert.ok(![...s.map.values()].some((v) => v.includes("p1-0")), "the oldest was rotated out");
});

test("the same plan twice in a row is not stashed twice", () => {
  const s = fakeStore();
  assert.ok(stashPlan(s, persisted("a"), "r"));
  assert.equal(stashPlan(s, persisted("a"), "r"), null);
  assert.equal(listStash(s).length, 1);
  assert.equal(stashPlan(s, "not a plan", "r"), null);
});

test("when storage is full the oldest entries make room: the newest plan is always kept", () => {
  const one = persisted("q", 20).length;
  const s = fakeStore(one * 3 + 400);
  for (let i = 1; i <= 6; i++) assert.ok(stashPlan(s, persisted(`z${i}`, 20), "r", i), `stash ${i}`);
  const list = listStash(s);
  assert.ok(list.length >= 1 && list.length <= 3);
  assert.equal(list[0].at, 6);
  assert.match(readStash(s, list[0].slot)!, /z60/);
  const tiny = fakeStore(10);
  assert.equal(stashPlan(tiny, persisted("big"), "r"), null, "a plan that cannot fit at all is reported as not stashed, without throwing");
});

test("the older single slot is copied into the rotating stash, never changed, and listed only once", () => {
  const s = fakeStore();
  const mine = persisted("owner", 103);
  s.setItem(LEGACY_KEY, mine);
  assert.deepEqual(listStash(s).map((e) => [e.slot, e.items]), [["legacy", 103]], "visible before it is copied");
  const copy = mirrorLegacy(s)!;
  assert.equal(copy.at, null);
  assert.equal(readStash(s, copy.slot), mine);
  assert.equal(s.getItem(LEGACY_KEY), mine, "the old key is untouched");
  assert.equal(mirrorLegacy(s), null, "copied once");
  assert.deepEqual(listStash(s).map((e) => e.slot), [copy.slot], "not listed twice");
  for (let i = 0; i < 12; i++) stashPlan(s, persisted(`n${i}-`), "r", i + 1); // the copy rotates out like any other...
  assert.equal(s.getItem(LEGACY_KEY), mine, "...and the old key is still there");
  assert.equal(listStash(s).at(-1)?.slot, "legacy", "so the owner's plan is listed again from the old key");
});

test("the banner offers the newest kept plan that differs from the plan on screen and was not dealt with", () => {
  const s = fakeStore();
  const active = persisted("now");
  assert.equal(unseenStash(s, active), null, "nothing kept, no banner");
  const kept = stashPlan(s, persisted("before"), "before loading", 5)!;
  assert.equal(unseenStash(s, active)?.slot, kept.slot);
  assert.equal(unseenStash(s, persisted("before")), null, "the kept plan is already the one on screen");
  markSeen(s, kept);
  assert.equal(unseenStash(s, active), null, "dismissed or restored: no banner, but it stays in the list");
  assert.equal(listStash(s).length, 1);
});

test("the banner needs nothing but localStorage (works with the server unreachable)", () => {
  const s = fakeStore();
  s.setItem(LEGACY_KEY, persisted("owner", 103));
  assert.equal(unseenStash(s, persisted("starter", 101))?.items, 103);
});
