import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { callService, toggleEntity } from "./ha.ts";
import { REPLAY_OFF, assertLive, isReplaying, rememberPoll, setReplaying, takeLatestPoll } from "./replayGate.ts";

const realFetch = globalThis.fetch;
afterEach(() => {
  setReplaying(false);
  globalThis.fetch = realFetch;
});

test("while replaying, toggleEntity and callService throw before any request leaves", async () => {
  const sent: string[] = [];
  globalThis.fetch = async (url) => {
    sent.push(String(url));
    return Response.json({});
  };
  setReplaying(true);
  await assert.rejects(toggleEntity("light.a"), { message: REPLAY_OFF });
  await assert.rejects(callService({ domain: "light", service: "turn_on", entity_id: "light.a" }), { message: REPLAY_OFF });
  assert.deepEqual(sent, [], "nothing reached the network");
  setReplaying(false);
  await toggleEntity("light.a");
  await callService({ domain: "light", service: "turn_on" });
  assert.equal(sent.length, 2, "live again: both go through");
});

test("the gate flag and the parked poll", () => {
  assert.equal(isReplaying(), false);
  assert.doesNotThrow(assertLive);
  setReplaying(true);
  assert.equal(isReplaying(), true);
  assert.throws(assertLive, { message: REPLAY_OFF });
  const list = [{ entity_id: "light.a", state: "on", attributes: {} }];
  rememberPoll([{ entity_id: "light.a", state: "off", attributes: {} }]);
  rememberPoll(list);
  assert.equal(takeLatestPoll(), list, "the newest poll");
  assert.equal(takeLatestPoll(), null, "handed over once");
});
