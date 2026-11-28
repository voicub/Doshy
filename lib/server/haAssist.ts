import { ASSIST_TIMEOUT_MS, parseAssistRequest, parseConversation, processBody, type AssistReply, type AssistRequest } from "../assist.ts";
import { checkSameOrigin, readJson, reply } from "../db/http.ts";
import { HttpError } from "../db/errors.ts";
import { tokenBucket } from "../modelLibrary.ts";
import { readCapped } from "./readCapped.ts";
import type { HaFetch } from "./haCall.ts";

/** Conversation intents execute immediately. Never log the sentence, token or upstream body. */
export async function processAssist(value: AssistRequest, fetchHa: HaFetch, signal?: AbortSignal): Promise<AssistReply> {
  const timeout = AbortSignal.timeout(ASSIST_TIMEOUT_MS);
  const res = await fetchHa("conversation/process", { method: "POST", body: JSON.stringify(processBody(value)), signal: signal ? AbortSignal.any([signal, timeout]) : timeout });
  if (!res.ok) {
    if (res.status === 401 || res.status === 403) throw new HttpError(502, "ha_auth", "Home Assistant refused the token.");
    if (res.status === 404) throw new HttpError(502, "assist_missing", "Assist is not set up in Home Assistant, or that agent is unavailable.");
    throw new HttpError(502, "assist_failed", "Home Assistant could not answer. Check that the chosen Assist agent is available.");
  }
  const bytes = res.body ? await readCapped(res.body, 128 * 1024) : null;
  if (!bytes) throw new HttpError(502, "assist_bad_reply", "Home Assistant sent an unreadable Assist answer.");
  let raw: unknown;
  try { raw = JSON.parse(new TextDecoder().decode(bytes)); } catch { throw new HttpError(502, "assist_bad_reply", "Home Assistant sent an unreadable Assist answer."); }
  return parseConversation(raw);
}

/** Shared route boundary, injected fetch for fake-HA tests; one bounded bucket per handler/server, not per arbitrary client key. */
export function assistHandler(fetchHa: HaFetch, now: () => number = Date.now) {
  const take = tokenBucket(20, now);
  return async (req: Request, forRequest?: HaFetch): Promise<Response> => {
    try {
      checkSameOrigin(req);
      if (process.env.DOSHY_GUEST_ONLY === "1") return reply({ error: "Assist is unavailable in guest mode." }, 403);
      const parsed = parseAssistRequest(await readJson(req, 4096));
      if (!parsed.ok) return reply({ error: parsed.error }, 400);
      if (!take()) return reply({ error: "Too many Assist requests. Wait a moment and try again." }, 429);
      return reply(await processAssist(parsed.value, forRequest ?? fetchHa, req.signal));
    } catch (e) {
      if (e instanceof HttpError) return reply({ error: e.message, code: e.code }, e.status);
      return reply({ error: req.signal.aborted ? "Assist was cancelled. Home Assistant may already have carried it out." : "Home Assistant did not answer. Check its connection and Assist settings." }, 502);
    }
  };
}
