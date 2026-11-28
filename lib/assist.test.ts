import { test } from "node:test";
import assert from "node:assert/strict";
import { ASSIST_DEFAULTS, changedEntities, changedSentence, cleanAssistSettings, cleanText, parseAgents, parseAssistRequest, parseConversation, readAssistReply, processBody, errorWords } from "./assist.ts";

test("Assist settings and sentences sanitize persisted and untrusted input", () => {
  assert.deepEqual(cleanAssistSettings(null), ASSIST_DEFAULTS);
  assert.deepEqual(cleanAssistSettings({ handoff: "never", agentId: "conversation.local", speak: true, explained: true }), { handoff: "never", agentId: "conversation.local", speak: true, explained: true });
  assert.deepEqual(cleanAssistSettings({ handoff: "automatic", agentId: "../bad", speak: 1, explained: "true" }), ASSIST_DEFAULTS);
  assert.equal(cleanText("  hello\n \tworld  "), "hello world");
  for (const value of [null, {}, "", "  ", "x".repeat(501)]) assert.equal(cleanText(value), null);
});
test("Assist request refuses invalid optional context rather than silently changing agent", () => {
  for (const value of [null, [], { confirm: false, text: "hello" }, { confirm: true, text: 1 }, { confirm: true, text: "" }, { confirm: true, text: "hello", language: "../en" }, { confirm: true, text: "hello", conversation_id: "../abc" }, { confirm: true, text: "hello", agent_id: "" }]) assert.equal(parseAssistRequest(value).ok, false);
  const parsed = parseAssistRequest({ confirm: true, text: " hi ", agent_id: "conversation.local", conversation_id: "01ABC-def", language: "en-US" });
  assert.equal(parsed.ok, true);
  if (parsed.ok) assert.deepEqual(processBody(parsed.value), { text: "hi", agent_id: "conversation.local", conversation_id: "01ABC-def", language: "en-US" });
  assert.deepEqual(processBody({ text: "hi" }), { text: "hi" });
});
test("response parser handles action, answer, errors, unknowns and bounded plain or SSML speech", () => {
  const raw = { response: { response_type: "action_done", speech: { plain: { speech: "Done" } }, data: { success: [{ name: "Hall", type: "entity", id: "light.hall" }, null, { name: "" }], failed: [{ name: "Curtain", type: "entity" }], code: "failed_to_handle" } }, conversation_id: "abc", continue_conversation: true };
  const reply = parseConversation(raw);
  assert.deepEqual(reply, { kind: "done", speech: "Done", success: [{ name: "Hall", type: "entity", id: "light.hall" }], failed: [{ name: "Curtain", type: "entity" }], code: "failed_to_handle", conversationId: "abc", followUp: true });
  assert.deepEqual(readAssistReply(reply), reply);
  for (const response_type of ["constructor", "toString", "invalid", null]) assert.equal(parseConversation({ response: { response_type } }).kind, "unknown");
  const ssml = parseConversation({ response: { response_type: "query_answer", speech: { ssml: { speech: "<speak>Hello <break/>world</speak>" } } } });
  assert.equal(ssml.kind, "answer"); assert.equal(ssml.speech, "Hello world");
  assert.equal(parseConversation({ response: { response_type: "error", data: { code: "../bad" } }, conversation_id: "../bad" }).code, undefined);
  assert.equal(parseConversation({ response: { speech: { plain: { speech: "x".repeat(3000) } } } }).speech.length, 2000);
  assert.equal(parseConversation({ response: {} }).speech, "");
  assert.equal(parseConversation(null).kind, "unknown");
  for (const raw of [null, {}, { kind: "unexpected", speech: "hi" }, { kind: "done", speech: 1 }]) assert.equal(readAssistReply(raw), null);
  assert.ok(errorWords("no_intent_match")); assert.ok(errorWords("no_valid_targets")); assert.ok(errorWords("unknown")); assert.equal(errorWords(undefined), ""); assert.equal(errorWords("unrecognised"), "");
});
test("agent lists discard malformed and duplicate entries, and cap returned agents", () => {
  assert.deepEqual(parseAgents(null), []);
  assert.deepEqual(parseAgents({ agents: [null, { id: "../x", name: "bad" }, { id: "b", name: "Zulu" }, { id: "a", name: "Alpha" }, { id: "b", name: "duplicate" }, { id: "c" }] }), [{ id: "a", name: "Alpha" }, { id: "c", name: "c" }, { id: "b", name: "Zulu" }]);
  assert.equal(parseAgents({ agents: Array.from({ length: 100 }, (_, n) => ({ id: `agent_${n}`, name: `Agent ${n}` })) }).length, 40);
});
test("state diff ignores newly discovered/passive entities, compares actuator attributes and bounds toast names", () => {
  const state = (entity_id: string, attributes = {}) => ({ entity_id, state: "on", attributes });
  const before = { "light.hall": state("light.hall", { brightness: 2 }), "sensor.temp": state("sensor.temp"), "light.same": state("light.same"), "light.rgb": state("light.rgb", { rgb_color: [1, 2, 3] as [number, number, number] }) };
  const after = { ...before, "light.hall": state("light.hall", { brightness: 100 }), "sensor.temp": { ...before["sensor.temp"], state: "off" }, "light.new": state("light.new"), "light.rgb": state("light.rgb", { rgb_color: [3, 2, 1] as [number, number, number] }) };
  assert.deepEqual(changedEntities(before, after), ["light.hall", "light.rgb"]);
  assert.equal(changedSentence(["Hall", "Kitchen"]), "Home Assistant changed: Hall, Kitchen");
  assert.equal(changedSentence(["A", "B", "C"], 2), "Home Assistant changed: A, B and 1 more");
});
