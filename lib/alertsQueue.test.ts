import test from "node:test";
import assert from "node:assert/strict";
import type { Alert } from "./alerts.ts";
import { acknowledge, EMPTY_LIFE, focusTarget, queueOf, sameAlerts, snooze, step } from "./alertsQueue.ts";

const alert = (id: string, since = 0): Alert => ({ id, kind: "leak", severity: "critical", entity: id, name: id, since, title: "t", message: id });
const MIN = 60_000;

test("an alert is started once, and is gone when it stops being active", () => {
  const a = alert("a");
  const first = step(EMPTY_LIFE, [a], 0);
  assert.deepEqual(first.started.map((x) => x.id), ["a"]);
  const again = step(first.life, [a], 1000);
  assert.deepEqual(again.started, []);
  assert.deepEqual(again.gone, []);
  const cleared = step(again.life, [], 2000);
  assert.deepEqual(cleared.gone, ["a"]);
});

test("an acknowledged alert leaves the queue, and is new again when it comes back after clearing", () => {
  const a = alert("a");
  let life = step(EMPTY_LIFE, [a], 0).life;
  life = acknowledge(life, ["a"]);
  assert.deepEqual(queueOf(life, [a], 1), []);
  assert.deepEqual(queueOf(step(life, [a], 2).life, [a], 2), [], "still active: stays answered");
  life = step(life, [], 3).life;
  const back = step(life, [a], 4);
  assert.deepEqual(back.started.map((x) => x.id), ["a"]);
  assert.deepEqual(queueOf(back.life, [a], 4).map((x) => x.id), ["a"]);
});

test("a snoozed alert returns when the snooze runs out and it is still active", () => {
  const a = alert("a");
  let life = step(EMPTY_LIFE, [a], 0).life;
  life = snooze(life, ["a"], 10 * MIN);
  assert.deepEqual(queueOf(life, [a], 9 * MIN), []);
  assert.deepEqual(queueOf(life, [a], 10 * MIN).map((x) => x.id), ["a"]);
  const after = step(life, [a], 11 * MIN);
  assert.deepEqual(after.started, [], "waking from a snooze is not a new alert");
  assert.deepEqual(queueOf(after.life, [a], 11 * MIN).map((x) => x.id), ["a"]);
});

test("an alert that clears during a snooze is new when it returns", () => {
  const a = alert("a");
  let life = snooze(step(EMPTY_LIFE, [a], 0).life, ["a"], 10 * MIN);
  life = step(life, [], 2 * MIN).life;
  const back = step(life, [a], 3 * MIN);
  assert.equal(back.started.length, 1);
  assert.deepEqual(queueOf(back.life, [a], 3 * MIN).map((x) => x.id), ["a"]);
});

test("answering one alert leaves the others in the queue", () => {
  const list = [alert("a"), alert("b")];
  const life = acknowledge(step(EMPTY_LIFE, list, 0).life, ["a"]);
  assert.deepEqual(queueOf(life, list, 1).map((x) => x.id), ["b"]);
});

test("sameAlerts notices a change of wording, order or length", () => {
  const a = alert("a");
  assert.equal(sameAlerts([a], [{ ...a }]), true);
  assert.equal(sameAlerts([a], [{ ...a, message: "later" }]), false);
  assert.equal(sameAlerts([a], [a, alert("b")]), false);
});

test("the camera goes to the room of the most serious new alert, and only when it may", () => {
  const inKitchen: Alert = { ...alert("leak"), roomId: "Kitchen" };
  const inHall: Alert = { ...alert("door"), roomId: "Hall", severity: "warning" };
  const ctx = { mode: "focus" as const, live: true, busy: false, current: null, hasRoom: (id: string) => id !== "Gone" };
  assert.equal(focusTarget([inKitchen, inHall], ctx), "Kitchen");
  assert.equal(focusTarget([alert("no-room"), inHall], ctx), "Hall");
  assert.equal(focusTarget([{ ...inKitchen, roomId: "Gone" }], ctx), undefined, "a room that is not in the plan");
  assert.equal(focusTarget([inKitchen], { ...ctx, mode: "banner" }), undefined);
  assert.equal(focusTarget([inKitchen], { ...ctx, mode: "off" }), undefined);
  assert.equal(focusTarget([inKitchen], { ...ctx, live: false }), undefined, "editing");
  assert.equal(focusTarget([inKitchen], { ...ctx, busy: true }), undefined, "mid-drag or a dialog is open");
  assert.equal(focusTarget([inKitchen], { ...ctx, current: "Kitchen" }), undefined, "already there");
});
