import assert from "node:assert/strict";
import { test } from "node:test";
import { asPersisted, decidePlan, decidePoll, diffPieces, mergePieces, parsePersisted, putField, retryDelay, takeField } from "./dbMerge.ts";

const stored = (state: object, version = 3) => JSON.stringify({ state, version });

test("a persisted value is read only when it has the { state, version } shape", () => {
  assert.deepEqual(parsePersisted(stored({ a: 1 })), { state: { a: 1 }, version: 3 });
  for (const bad of [null, undefined, "", "not json", "[]", "null", '{"state":{}}', '{"state":[],"version":1}', '{"state":{},"version":"1"}']) assert.equal(parsePersisted(bad), null, String(bad));
  assert.equal(asPersisted({ state: {}, version: 0 })?.version, 0);
  assert.equal(asPersisted({ state: 1, version: 0 }), null);
});

test("the plan is taken out of a persisted value and put back byte for byte", () => {
  const plan = { walls: [{ id: "w1" }], items: [], x: 1.5, nested: { é: "ü" } };
  const text = stored({ plan, view: "plan", activeLevel: "g" }, 7);
  const { rest, value } = takeField(text, "plan")!;
  assert.deepEqual(value, plan);
  assert.deepEqual(rest, { state: { view: "plan", activeLevel: "g" }, version: 7 });
  assert.equal(putField(rest, "plan", JSON.parse(JSON.stringify(value))), text, "the rebuilt text is exactly what was taken apart, even after the server's JSON round trip");
  assert.equal(JSON.stringify(JSON.parse(JSON.stringify(value))), JSON.stringify(plan), "survives the server's JSON round trip");
});

test("putField without settings from the server still produces a loadable value, and a given version wins", () => {
  assert.deepEqual(parsePersisted(putField(null, "plan", { a: 1 }, 5)), { state: { plan: { a: 1 } }, version: 5 });
  assert.equal(parsePersisted(putField({ state: { view: "live" }, version: 2 }, "plan", {}, 9))?.version, 9);
  assert.equal(parsePersisted(putField({ state: {}, version: 2 }, "plan", {}))?.version, 2);
  assert.equal(takeField("garbage", "plan"), null);
});

const plan = (o: Partial<Parameters<typeof decidePlan>[0]>) => decidePlan({ serverRev: 5, localRev: 5, hasLocal: true, dirty: false, sameContent: () => false, ...o });

test("start-up: an empty server takes this device's plan (the one-time move), or nothing happens", () => {
  assert.equal(plan({ serverRev: 0, localRev: null }), "upload");
  assert.equal(plan({ serverRev: 0, localRev: null, hasLocal: false }), "none");
  assert.equal(plan({ serverRev: 0, localRev: 4, dirty: true }), "upload", "a wiped server gets this device's plan back");
});

test("start-up: the server's plan is taken when this device has none or is simply behind", () => {
  assert.equal(plan({ hasLocal: false, localRev: null }), "apply");
  assert.equal(plan({ serverRev: 9, localRev: 5 }), "apply");
  assert.equal(plan({ serverRev: 2, localRev: 5 }), "apply", "a restored backup can have a lower revision");
  assert.equal(plan({}), "same");
});

test("start-up: unsaved edits are sent when the revision matches, otherwise the user chooses", () => {
  assert.equal(plan({ dirty: true }), "push");
  assert.equal(plan({ dirty: true, serverRev: 6 }), "conflict");
  assert.equal(plan({ dirty: true, localRev: null }), "conflict");
});

test("start-up: a plan this device never synced is compared with the server's before anyone is asked", () => {
  assert.equal(plan({ localRev: null, sameContent: () => true }), "adopt");
  assert.equal(plan({ localRev: null, sameContent: () => false }), "conflict");
  assert.equal(plan({ localRev: null, dirty: true, sameContent: () => true }), "adopt", "re-saved but unchanged is not an edit");
  assert.equal(plan({ localRev: null, sameContent: () => false, serverPristine: () => true }), "keep-local", "a never-synced plan is not replaced by the untouched starter");
  assert.equal(plan({ localRev: null, sameContent: () => false, localPristine: () => true }), "apply", "an untouched starter has nothing to lose");
  assert.equal(plan({ localRev: null, dirty: true, sameContent: () => false, serverPristine: () => false, localPristine: () => false }), "conflict", "two real plans: the user decides");
});

test("a plan on this device is never silently replaced: the only decision that takes the server's plan over a local one is a device that was in sync, or has nothing real to lose", () => {
  const decisions = new Set<string>();
  for (const localRev of [null, 3, 5, 9]) for (const dirty of [false, true]) for (const same of [false, true]) for (const sp of [false, true]) for (const lp of [false, true]) {
    const d = decidePlan({ serverRev: 5, localRev, hasLocal: true, dirty, sameContent: () => same, serverPristine: () => sp, localPristine: () => lp });
    if (d === "apply") assert.ok((localRev !== null && !dirty) || (localRev === null && !same && !sp && lp), `apply for rev ${localRev} dirty ${dirty}`);
    decisions.add(d);
  }
  assert.ok(decisions.has("conflict") && decisions.has("keep-local") && decisions.has("apply"));
  assert.equal(plan({ localRev: null, dirty: true, sameContent: () => false }), "conflict");
  let asked = 0;
  plan({ localRev: 5, sameContent: () => (asked++, true) });
  plan({ hasLocal: false, localRev: null, sameContent: () => (asked++, true) });
  assert.equal(asked, 0, "the (expensive) comparison runs only when it decides something");
});

test("polling: newer plans are taken only when this device has nothing unsaved and is not saving", () => {
  const poll = (o: Partial<Parameters<typeof decidePoll>[0]>) => decidePoll({ serverRev: 6, localRev: 5, dirty: false, busy: false, staleAnswer: false, ...o });
  assert.equal(poll({}), "apply");
  assert.equal(poll({ serverRev: 5 }), "ignore");
  assert.equal(poll({ dirty: true }), "conflict");
  assert.equal(poll({ busy: true }), "ignore", "never replace the plan while a save is in flight");
  assert.equal(poll({ staleAnswer: true }), "ignore", "an answer older than this device's own last save");
  assert.equal(poll({ localRev: null }), "apply");
});

const p = (kind: string, name = kind) => ({ kind, name });
const kinds = (list: { kind: string }[]) => list.map((x) => x.kind);

test("pieces, not edited here: the server wins, pieces only this device has are kept, ones deleted elsewhere go", () => {
  const merged = mergePieces([p("a", "old"), p("mine"), p("gone")], [p("a", "new"), p("b")], new Set(["a", "gone"]), false);
  assert.deepEqual(merged, [p("a", "new"), p("mine"), p("b")]);
});

test("pieces, edited here: this device wins, the server's new pieces come in, local deletions stay deleted", () => {
  const server = [p("a", "server"), p("b"), p("deleted-here"), p("new-there")];
  const merged = mergePieces([p("a", "local"), p("mine")], server, new Set(["a", "b", "deleted-here"]), true);
  assert.deepEqual(merged, [p("a", "local"), p("mine"), p("new-there")]);
  assert.deepEqual(kinds(mergePieces([p("a"), p("gone-there")], [p("a")], new Set(["a", "gone-there"]), true)), ["a"], "deleted on the server by another device");
});

test("pieces: a cleared local copy never deletes the server's pieces", () => {
  const merged = mergePieces([], [p("a"), p("b")], new Set(["a", "b"]), false);
  assert.deepEqual(kinds(merged), ["a", "b"]);
});

test("pieces: the diff sends what changed and deletes what is gone", () => {
  const onServer = new Map([["a", JSON.stringify(p("a"))], ["b", JSON.stringify(p("b"))], ["c", JSON.stringify(p("c"))]]);
  const d = diffPieces([p("a"), p("b", "renamed"), p("d")], onServer);
  assert.deepEqual(kinds(d.put), ["b", "d"]);
  assert.deepEqual(d.remove, ["c"]);
  assert.deepEqual(diffPieces([p("a")], new Map([["a", JSON.stringify(p("a"))]])), { put: [], remove: [] });
});

test("retry waits grow 1 s, 2 s, 4 s and stop at 30 s", () => {
  assert.deepEqual([0, 1, 2, 3, 4, 5, 6, 40].map(retryDelay), [1000, 2000, 4000, 8000, 16000, 30000, 30000, 30000]);
  assert.equal(retryDelay(-3), 1000);
});
