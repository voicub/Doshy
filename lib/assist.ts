// Ask Home Assistant (Assist) from the command box (docs/assist.md): the checks on what is sent, the reading of what comes back, when the box offers the hand-off, the short
// conversation that makes "and the kitchen too" work, and which devices changed afterwards. Pure; the node test runner loads this file directly (.ts imports).
// Home Assistant's REST API (https://developers.home-assistant.io/docs/intent_conversation_api/): POST /api/conversation/process with `text`, `language`, `agent_id`,
// `conversation_id`; the answer is `{ response: { response_type, language, data, speech: { plain: { speech } } }, conversation_id, continue_conversation }`.
import { isRecord } from "./guards.ts";
import type { HAState } from "./ha.ts";

export const MAX_TEXT = 500;
/** An agent backed by a language model can take a while: the server waits this long, and the box shows "thinking" with a Cancel until then. */
export const ASSIST_TIMEOUT_MS = 60_000;
/** Home Assistant forgets a conversation after a few idle minutes; so does the box. */
export const CONVERSATION_IDLE_MS = 5 * 60_000;
export const MAX_TURNS = 6;
const MAX_SPEECH = 2000;
const MAX_TARGETS = 20;

/** What the person chose for "Ask Home Assistant when Doshy does not understand". */
export type AssistMode = "ask" | "never";
export type AssistSettings = {
  handoff: AssistMode;
  /** The conversation agent's id, or "" for Home Assistant's default one. */
  agentId: string;
  /** Read the answer aloud (the browser's own speech, on this device only). */
  speak: boolean;
  /** The one-time explanation was read. */
  explained: boolean;
};
export const ASSIST_DEFAULTS: AssistSettings = { handoff: "ask", agentId: "", speak: false, explained: false };

const AGENT_ID = /^[a-z0-9_.]{1,120}$/;
const CONVERSATION_ID = /^[A-Za-z0-9_.-]{1,128}$/;
const LANGUAGE = /^[a-z]{2,3}([-_][A-Za-z0-9]{2,8})?$/;

export const isAgentId = (v: unknown): v is string => typeof v === "string" && AGENT_ID.test(v);

/** The stored settings, re-checked: anything else is the default (a button first, no speech, the default agent). */
export function cleanAssistSettings(raw: unknown): AssistSettings {
  const r = isRecord(raw) ? raw : {};
  return {
    handoff: r.handoff === "never" ? "never" : "ask",
    agentId: isAgentId(r.agentId) ? r.agentId : "",
    speak: r.speak === true,
    explained: r.explained === true,
  };
}

/** One line of text as the box sends it: control characters and line breaks become spaces, runs of spaces one, and nothing longer than MAX_TEXT. Null for nothing to say. */
export function cleanText(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const t = raw.replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim();
  return t.length > 0 && t.length <= MAX_TEXT ? t : null;
}

export type AssistRequest = { text: string; agentId?: string; conversationId?: string; language?: string };

/**
 * The body of POST /api/ha/assist: `{ confirm: true, text, agent_id?, conversation_id?, language? }`. `confirm` is required because Assist carries the sentence out at once in
 * Home Assistant: nothing but the person's deliberate tap in the box may send it. A bad optional field is refused (not silently dropped), so a wrong agent is never swapped for the default.
 */
export function parseAssistRequest(body: unknown): { ok: true; value: AssistRequest } | { ok: false; error: string } {
  if (!isRecord(body)) return { ok: false, error: "Send JSON like { text }." };
  if (body.confirm !== true) return { ok: false, error: "Assist carries things out at once, so the request has to say confirm: true." };
  if (typeof body.text === "string" && body.text.trim().length > MAX_TEXT) return { ok: false, error: `That is too long for Assist (${MAX_TEXT} letters at most).` };
  const text = cleanText(body.text);
  if (!text) return { ok: false, error: "Type something to ask." };
  const value: AssistRequest = { text };
  if (body.agent_id !== undefined) {
    if (!isAgentId(body.agent_id)) return { ok: false, error: "That is not a valid agent." };
    value.agentId = body.agent_id;
  }
  if (body.conversation_id !== undefined) {
    if (typeof body.conversation_id !== "string" || !CONVERSATION_ID.test(body.conversation_id)) return { ok: false, error: "That is not a valid conversation." };
    value.conversationId = body.conversation_id;
  }
  if (body.language !== undefined) {
    if (typeof body.language !== "string" || !LANGUAGE.test(body.language)) return { ok: false, error: "That is not a valid language." };
    value.language = body.language;
  }
  return { ok: true, value };
}

/** What Home Assistant's conversation API body for a request is. */
export const processBody = (r: AssistRequest): Record<string, string> => ({ text: r.text, ...(r.language ? { language: r.language } : {}), ...(r.agentId ? { agent_id: r.agentId } : {}), ...(r.conversationId ? { conversation_id: r.conversationId } : {}) });

// ---- the answer -----------------------------------------------------------------------------------------------------------------------------------------

export type AssistTarget = { name: string; type: string; id?: string };
/** `done`: it did something (action_done); `answer`: it answered a question (query_answer); `error`: it could not (`code` says why); `unknown`: the answer was not in a shape this knows. */
export type AssistKind = "done" | "answer" | "error" | "unknown";
export type AssistReply = {
  kind: AssistKind;
  /** What the agent said, as plain text (empty when it said nothing). */
  speech: string;
  /** For an error: Home Assistant's code (no_intent_match, no_valid_targets, failed_to_handle, unknown). */
  code?: string;
  success: AssistTarget[];
  failed: AssistTarget[];
  conversationId?: string;
  /** The agent asked something and expects an answer. */
  followUp: boolean;
};

const KIND_OF: Record<string, AssistKind> = { action_done: "done", query_answer: "answer", error: "error" };

const text = (v: unknown, max: number): string => (typeof v === "string" ? v.replace(/[\u0000-\u0008\u000b-\u001f\u007f]+/g, " ").trim().slice(0, max) : "");

function targets(v: unknown): AssistTarget[] {
  if (!Array.isArray(v)) return [];
  return v.slice(0, MAX_TARGETS).flatMap((t): AssistTarget[] => {
    if (!isRecord(t)) return [];
    const name = text(t.name, 80);
    const id = typeof t.id === "string" && AGENT_ID.test(t.id) ? t.id : undefined;
    return name ? [{ name, type: text(t.type, 16) || "custom", ...(id ? { id } : {}) }] : [];
  });
}

/** Speech is plain text, or SSML (tags stripped to the words). */
function speechOf(response: Record<string, unknown>): string {
  const speech = isRecord(response.speech) ? response.speech : {};
  const plain = isRecord(speech.plain) ? text(speech.plain.speech, MAX_SPEECH) : "";
  if (plain) return plain;
  return isRecord(speech.ssml) ? text(speech.ssml.speech, MAX_SPEECH * 2).replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim().slice(0, MAX_SPEECH) : "";
}

/** Home Assistant's `/api/conversation/process` answer as a small checked value. Anything missing is empty; an answer with no `response` at all is `unknown`. */
export function parseConversation(raw: unknown): AssistReply {
  const top = isRecord(raw) ? raw : {};
  const response = isRecord(top.response) ? top.response : null;
  const conversationId = typeof top.conversation_id === "string" && CONVERSATION_ID.test(top.conversation_id) ? top.conversation_id : undefined;
  const followUp = top.continue_conversation === true;
  if (!response) return { kind: "unknown", speech: "", success: [], failed: [], followUp, ...(conversationId ? { conversationId } : {}) };
  const data = isRecord(response.data) ? response.data : {};
  const kind = typeof response.response_type === "string" && Object.hasOwn(KIND_OF, response.response_type) ? KIND_OF[response.response_type] : "unknown";
  const code = typeof data.code === "string" && /^[a-z_]{1,40}$/.test(data.code) ? data.code : undefined;
  return { kind, speech: speechOf(response), success: targets(data.success), failed: targets(data.failed), followUp, ...(code ? { code } : {}), ...(conversationId ? { conversationId } : {}) };
}

/** An `AssistReply` the server sent, checked again in the browser (the shape is ours, but it crossed the network). Null when it is not one. */
export function readAssistReply(v: unknown): AssistReply | null {
  if (!isRecord(v) || typeof v.kind !== "string" || !["done", "answer", "error", "unknown"].includes(v.kind) || typeof v.speech !== "string") return null;
  const conversationId = typeof v.conversationId === "string" && CONVERSATION_ID.test(v.conversationId) ? v.conversationId : undefined;
  const code = typeof v.code === "string" && /^[a-z_]{1,40}$/.test(v.code) ? v.code : undefined;
  return { kind: v.kind as AssistKind, speech: text(v.speech, MAX_SPEECH), success: targets(v.success), failed: targets(v.failed), followUp: v.followUp === true, ...(code ? { code } : {}), ...(conversationId ? { conversationId } : {}) };
}

const ERROR_WORDS: Record<string, string> = {
  no_intent_match: "Assist did not understand that sentence.",
  no_valid_targets: "Assist could not find that room or device, or it is not shared with Assist in Home Assistant.",
  failed_to_handle: "Assist understood, but could not do it.",
  unknown: "Something went wrong inside Home Assistant.",
};
/** A plain sentence for an error answer's code (the agent's own words are shown too). Empty when there is no known code. */
export const errorWords = (code: string | undefined): string => (code ? (ERROR_WORDS[code] ?? "") : "");

/** The agents Home Assistant lists (`conversation/agent/list` answers `{ agents: [{ id, name, supported_languages }] }`): valid ones only, sorted by name. */
export type AssistAgent = { id: string; name: string };
export function parseAgents(raw: unknown): AssistAgent[] {
  const list = isRecord(raw) && Array.isArray(raw.agents) ? raw.agents : [];
  const out: AssistAgent[] = [];
  for (const a of list) {
    if (!isRecord(a) || !isAgentId(a.id) || out.some((o) => o.id === a.id)) continue;
    out.push({ id: a.id, name: text(a.name, 60) || a.id });
  }
  return out.slice(0, 40).sort((a, b) => a.name.localeCompare(b.name));
}

// ---- when the box offers Assist ---------------------------------------------------------------------------------------------------------------------------

/** The part of the command box's reply this needs (lib/commandParse.ts `Reply`). */
type BoxReply = { kind: string; refused?: true };

/**
 * Does the box offer "Ask Home Assistant Assist" for this text? Only when Doshy's own parser could not understand it (a `no` that is not a refusal: Doshy will not do locks,
 * alarms, garage doors or system settings, and does not offer to pass those on either), the person has not chosen "Never", and the text is something Assist could take.
 * It is only ever an offer: nothing is sent until the person taps it.
 */
export function offersAssist(reply: BoxReply | null, mode: AssistMode, typed: string): boolean {
  return mode === "ask" && reply?.kind === "no" && reply.refused !== true && cleanText(typed) !== null;
}

// ---- the conversation ------------------------------------------------------------------------------------------------------------------------------------

export type Conversation = { id: string; agentId: string; at: number };
export type Turn = { said: string; reply: AssistReply };

/** The conversation id to send with the next sentence: the same agent, and not idle for too long; otherwise a fresh conversation (undefined). */
export const conversationFor = (c: Conversation | null, agentId: string, now: number): string | undefined => (c && c.agentId === agentId && now - c.at <= CONVERSATION_IDLE_MS ? c.id : undefined);

/** The conversation after an answer: the id Home Assistant gave (a fresh one when it gave none, so a stale id is never reused). */
export const nextConversation = (reply: AssistReply, agentId: string, now: number): Conversation | null => (reply.conversationId ? { id: reply.conversationId, agentId, at: now } : null);

/** The last few turns, newest last. */
export const withTurn = (turns: readonly Turn[], turn: Turn): Turn[] => [...turns, turn].slice(-MAX_TURNS);

// ---- what changed ----------------------------------------------------------------------------------------------------------------------------------------

/** Entities that report the world, not something Assist switches: their changes are not "what Home Assistant did". */
const QUIET = new Set(["sensor", "binary_sensor", "sun", "weather", "person", "device_tracker", "update", "zone", "proximity", "calendar", "event", "image", "todo", "tts", "stt", "conversation", "number_none"]);
const WATCHED = ["brightness", "color_temp_kelvin", "current_position", "temperature", "volume_level", "percentage", "preset_mode", "hvac_action"] as const;

const domain = (id: string) => id.slice(0, id.indexOf("."));
const rgb = (s: HAState) => JSON.stringify(s.attributes.rgb_color ?? null);

/** The entities whose state (or brightness, position, target temperature, colour, volume...) differs between two lists of states: what Home Assistant just changed. Only entities in both lists. */
export function changedEntities(before: Readonly<Record<string, HAState>>, after: Readonly<Record<string, HAState>>): string[] {
  const out: string[] = [];
  for (const [id, now] of Object.entries(after)) {
    const was = before[id];
    if (!was || QUIET.has(domain(id)) || was === now) continue;
    if (was.state !== now.state || rgb(was) !== rgb(now) || WATCHED.some((k) => was.attributes[k] !== now.attributes[k])) out.push(id);
  }
  return out;
}

/** "Home Assistant changed: Hall light, Hall curtain and 3 more". */
export function changedSentence(names: readonly string[], show = 4): string {
  const shown = names.slice(0, show).join(", ");
  return `Home Assistant changed: ${shown}${names.length > show ? ` and ${names.length - show} more` : ""}`;
}
