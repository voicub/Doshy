import test from "node:test";
import assert from "node:assert/strict";
import { CORNERS, dueAt, holdMs, showsScene, slideKey, slidesOf, start, step, tourRooms, type Cursor, type RotationInput } from "./rotation.ts";
import { starterPlan } from "./starterPlan.ts";

const S = 1000;
const input = (over: Partial<RotationInput> = {}): RotationInput => ({ kinds: ["overview", "rooms", "clock", "house"], secs: 20, roomIds: ["a", "b"], alertIds: [], ...over });
/** Runs the schedule forward, calling `step` only when it is due (like the browser does), and returns what was shown in order. */
function run(inp: RotationInput, from: Cursor, until: number): string[] {
  const seen = [slideKey(from.slide)];
  let cur = from;
  for (let guard = 0; guard < 500; guard++) {
    const at = dueAt(cur, inp);
    if (at > until) break;
    cur = step(cur, inp, at);
    if (slideKey(cur.slide) !== seen[seen.length - 1]) seen.push(slideKey(cur.slide));
  }
  return seen;
}

test("a round shows the chosen slides in a fixed order, rooms in tour order", () => {
  assert.deepEqual(slidesOf(input(), 0).map(slideKey), ["overview:0", "room:a", "room:b", "clock", "house"]);
  assert.deepEqual(slidesOf(input({ kinds: ["house", "clock"] }), 0).map(slideKey), ["clock", "house"], "the order does not depend on the order chosen");
});

test("the overview turns from the next corner every round", () => {
  const corners = [0, 1, 2, 3, 4, 5].map((c) => slidesOf(input({ kinds: ["overview"] }), c)[0]);
  assert.deepEqual(corners.map((s) => (s.kind === "overview" ? s.corner : -1)), [0, 1, 2, 3, 0, 1]);
  assert.equal(CORNERS, 4);
});

test("nothing to show falls back to the clock instead of a blank screen", () => {
  assert.deepEqual(slidesOf(input({ kinds: [] }), 0).map(slideKey), ["clock"]);
  assert.deepEqual(slidesOf(input({ kinds: ["rooms"], roomIds: [] }), 0).map(slideKey), ["clock"]);
});

test("a room stays between 8 and 12 seconds whatever the slide time, other slides stay as long as chosen", () => {
  assert.equal(holdMs({ kind: "room", roomId: "a" }, 5), 8 * S);
  assert.equal(holdMs({ kind: "room", roomId: "a" }, 60), 12 * S);
  assert.equal(holdMs({ kind: "room", roomId: "a" }, 10), 10 * S);
  assert.equal(holdMs({ kind: "clock" }, 30), 30 * S);
  assert.equal(holdMs({ kind: "overview", corner: 0 }, 8), 8 * S);
});

test("slides follow one another on their own time and wrap into a new round", () => {
  const inp = input({ secs: 20 });
  const seen = run(inp, start(inp, 0), 400 * S);
  assert.deepEqual(seen.slice(0, 6), ["overview:0", "room:a", "room:b", "clock", "house", "overview:1"]);
});

test("step does nothing before the time is up and returns the same cursor", () => {
  const inp = input();
  const cur = start(inp, 1000);
  assert.equal(step(cur, inp, 1000 + 19 * S), cur);
  assert.notEqual(step(cur, inp, 1000 + 20 * S), cur);
});

test("an alert pre-empts at once, from any slide, and shows its own slide", () => {
  const inp = input();
  const cur = step(start(inp, 0), inp, 20 * S); // on room a
  const hit = step(cur, input({ alertIds: ["leak:x"] }), 21 * S);
  assert.deepEqual(hit.slide, { kind: "alert", alertId: "leak:x" });
  assert.equal(showsScene(hit.slide), false);
});

test("while one alert is active nothing else comes up and nothing is due", () => {
  const withAlert = input({ alertIds: ["leak:x"] });
  const hit = step(start(input(), 0), withAlert, 5 * S);
  assert.equal(step(hit, withAlert, 500 * S), hit);
  assert.equal(dueAt(hit, withAlert), Infinity);
});

test("when the alert clears, the rotation resumes on the slide it interrupted with a fresh timer", () => {
  const inp = input();
  let cur = start(inp, 0);
  cur = step(cur, inp, 20 * S); // room a
  const interrupted = slideKey(cur.slide);
  cur = step(cur, input({ alertIds: ["smoke:k"] }), 25 * S);
  cur = step(cur, inp, 90 * S);
  assert.equal(slideKey(cur.slide), interrupted);
  assert.equal(cur.since, 90 * S);
  assert.equal(step(cur, inp, 90 * S + 7 * S), cur, "it gets its full time again");
});

test("a second alert does not lose the place to resume at", () => {
  const inp = input();
  let cur = step(start(inp, 0), inp, 20 * S);
  const interrupted = slideKey(cur.slide);
  cur = step(cur, input({ alertIds: ["a:1"] }), 21 * S);
  cur = step(cur, input({ alertIds: ["b:2", "a:1"] }), 22 * S);
  assert.deepEqual(cur.slide, { kind: "alert", alertId: "a:1" }, "the alert on screen stays up; the new one takes its turn");
  cur = step(cur, input({ alertIds: ["b:2", "a:1"] }), 22 * S + 20 * S);
  assert.deepEqual(cur.slide, { kind: "alert", alertId: "b:2" });
  cur = step(cur, inp, 30 * S);
  assert.equal(slideKey(cur.slide), interrupted);
});

test("several alerts take turns, each for a slide time", () => {
  const two = input({ alertIds: ["a:1", "b:2"], secs: 10 });
  let cur = step(start(input(), 0), two, 0);
  assert.deepEqual(cur.slide, { kind: "alert", alertId: "a:1" });
  assert.equal(dueAt(cur, two), 10 * S);
  cur = step(cur, two, 10 * S);
  assert.deepEqual(cur.slide, { kind: "alert", alertId: "b:2" });
  cur = step(cur, two, 20 * S);
  assert.deepEqual(cur.slide, { kind: "alert", alertId: "a:1" });
});

test("an alert that was answered hands over to the next one at once", () => {
  const two = input({ alertIds: ["a:1", "b:2"] });
  let cur = step(start(input(), 0), two, 0);
  cur = step(cur, input({ alertIds: ["b:2"] }), 3 * S);
  assert.deepEqual(cur.slide, { kind: "alert", alertId: "b:2" });
});

test("starting with an alert already active shows it and remembers the first slide", () => {
  const withAlert = input({ alertIds: ["gas:1"] });
  const cur = start(withAlert, 0);
  assert.deepEqual(cur.slide, { kind: "alert", alertId: "gas:1" });
  assert.equal(slideKey(step(cur, input(), 1 * S).slide), "overview:0");
});

test("a room that is deleted, or a kind that is switched off, leaves the screen at once", () => {
  const inp = input();
  let cur = step(start(inp, 0), inp, 20 * S);
  assert.deepEqual(cur.slide, { kind: "room", roomId: "a" });
  cur = step(cur, input({ roomIds: ["b"] }), 22 * S);
  assert.deepEqual(cur.slide, { kind: "room", roomId: "b" }, "the next slide at this place");
  const clock = step(start(input({ kinds: ["clock", "house"] }), 0), input({ kinds: ["house"] }), 1 * S);
  assert.equal(slideKey(clock.slide), "house");
});

test("a fallback clock is stable: it is not replaced over and over while it waits", () => {
  const inp = input({ kinds: ["rooms"], roomIds: [] });
  const cur = start(inp, 0);
  assert.equal(slideKey(cur.slide), "clock");
  assert.equal(step(cur, inp, 5 * S), cur);
});

test("the tour visits every room of the starter plan once, an open-plan space as one stop", () => {
  const plan = starterPlan();
  const separate = tourRooms(plan, false);
  assert.equal(new Set(separate).size, separate.length, "no room twice");
  assert.equal(separate.length, plan.rooms.filter((r) => !r.parent).length, "every room that is not an alcove");
  assert.ok(tourRooms(plan, true).length <= separate.length);
  assert.deepEqual(tourRooms({ ...plan, rooms: [] }, true), []);
});
