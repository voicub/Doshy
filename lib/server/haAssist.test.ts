import { test } from "node:test";
import assert from "node:assert/strict";
import { assistHandler, processAssist } from "./haAssist.ts";
import { parseConversation, offersAssist, conversationFor, nextConversation, withTurn, MAX_TURNS, changedEntities } from "../assist.ts";
import { parseCommand } from "../commandParse.ts";
import { PLAN, STATES } from "../sceneFixture.ts";
import { sceneDevices } from "../sceneDevices.ts";

const request = (body: unknown, headers: Record<string, string> = {}) => new Request("http://doshy.local/api/ha/assist", { method: "POST", headers: { host: "doshy.local", "content-type": "application/json", ...headers }, body: JSON.stringify(body) });
test("Assist requires explicit consent, same origin and bounded valid JSON before HA is called", async () => {
  let calls = 0;
  const handle = assistHandler(async () => { calls++; return Response.json({}); });
  for (const body of [{ text: "hello" }, { confirm: true, text: "x".repeat(501) }, { confirm: true, text: "hi", agent_id: "../x" }, { confirm: true, text: "hi", conversation_id: "../x" }]) assert.equal((await handle(request(body))).status, 400);
  assert.equal((await handle(request({ confirm: true, text: "hello" }, { origin: "https://evil.test" }))).status, 403);
  assert.equal((await handle(request({ confirm: true, text: "x".repeat(9000) }))).status, 413);
  assert.equal(calls, 0);
});
test("fake HA receives checked agent, language, follow-up and a 60-second abort signal", async () => {
  const reply = await processAssist({ text: "hello", agentId: "conversation.local", language: "en", conversationId: "abc" }, async (path, init) => {
    assert.equal(path, "conversation/process"); assert.equal(init?.method, "POST"); assert.ok(init?.signal);
    assert.deepEqual(JSON.parse(String(init?.body)), { text: "hello", agent_id: "conversation.local", language: "en", conversation_id: "abc" });
    return Response.json({ response: { response_type: "action_done", speech: { plain: { speech: "Done" } }, data: { success: [{ name: "Hall", type: "entity", id: "light.hall" }] } }, conversation_id: "next" });
  });
  assert.equal(reply.kind, "done"); assert.equal(reply.speech, "Done"); assert.equal(reply.conversationId, "next");
});
test("HA HTTP failures are plain and never echo the token or text", async () => {
  for (const status of [401, 404, 500]) await assert.rejects(processAssist({ text: "private" }, async () => new Response("secret", { status })), /Home Assistant|Assist/);
});
test("Assist rate limit is 20 per minute and resets deterministically", async () => {
  let now = 0;
  const handle = assistHandler(async () => Response.json({ response: { response_type: "query_answer" } }), () => now);
  for (let n = 0; n < 20; n++) assert.equal((await handle(request({ confirm: true, text: "hi" }))).status, 200);
  assert.equal((await handle(request({ confirm: true, text: "hi" }))).status, 429);
  now = 60_001;
  assert.equal((await handle(request({ confirm: true, text: "hi" }))).status, 200);
});
test("reply shapes, hand-off safety and conversation expiry", () => {
  for (const [response_type, kind] of [["action_done", "done"], ["query_answer", "answer"], ["error", "error"], ["other", "unknown"]]) assert.equal(parseConversation({ response: { response_type } }).kind, kind);
  assert.equal(parseConversation(null).kind, "unknown");
  assert.equal(offersAssist({ kind: "run" }, "ask", "hi"), false);
  assert.equal(offersAssist({ kind: "no", refused: true }, "ask", "hi"), false);
  assert.equal(offersAssist({ kind: "no" }, "never", "hi"), false);
  assert.equal(offersAssist({ kind: "no" }, "ask", "hi"), true);
  const reply = parseConversation({ conversation_id: "abc" });
  const conversation = nextConversation(reply, "agent", 0);
  assert.equal(conversationFor(conversation, "agent", 1), "abc");
  assert.equal(conversationFor(conversation, "other", 1), undefined);
  assert.equal(conversationFor(conversation, "agent", 300_001), undefined);
  assert.equal(withTurn(Array.from({ length: 20 }, () => ({ said: "hi", reply })), { said: "last", reply }).length, MAX_TURNS);
  const before = { "light.hall": { entity_id: "light.hall", state: "off", attributes: {} } };
  assert.deepEqual(changedEntities(before, { "light.hall": { ...before["light.hall"], state: "on" } }), ["light.hall"]);
});

test("local parser confirmations and hard refusals cannot become an Assist hand-off", () => {
  const context = { rooms: PLAN.rooms, devices: sceneDevices(PLAN, STATES), contacts: [], scenes: [], states: STATES };
  const action = parseCommand("turn off the bedroom lights", context);
  assert.equal(action.kind, "run");
  assert.equal(offersAssist(action, "ask", "turn off the bedroom lights"), false);
  for (const text of ["unlock the front door", "open the garage", "disarm the alarm"]) {
    const reply = parseCommand(text, context);
    assert.equal(reply.kind, "no");
    assert.equal(offersAssist(reply, "ask", text), false);
  }
  assert.equal(offersAssist(parseCommand("please tell me a story", context), "ask", "please tell me a story"), true);
});
