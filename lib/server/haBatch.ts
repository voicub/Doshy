// POST /api/ha/scene: run a list of service calls (a scene). Everything is checked first (lib/sceneRun.ts), then the calls go out together and each one reports
// for itself, so a lamp that is offline does not stop the curtains. `fetchHa` is `ha` from lib/haServer.ts in production and a fake in tests.
import { errorMessage } from "../guards.ts";
import { checkBatch, type KnownStates } from "../sceneRun.ts";
import { shapeStates } from "./haStates.ts";
import type { HaFetch } from "./haCall.ts";

export type CallResult = { ok: boolean; error?: string };
export type BatchReply = { status: number; body: { ok: boolean; results: CallResult[] } | { error: string } };

/** Every entity with the attributes the validators read; throws when Home Assistant cannot be asked. */
async function knownStates(fetchHa: HaFetch): Promise<KnownStates> {
  const res = await fetchHa("states");
  if (!res.ok) throw new Error(`Home Assistant answered HTTP ${res.status}`);
  const out: KnownStates = {};
  for (const s of shapeStates(await res.json())) out[s.entity_id] = { state: s.state, attributes: s.attributes };
  return out;
}

export async function runBatch(body: unknown, fetchHa: HaFetch): Promise<BatchReply> {
  let known: KnownStates;
  try {
    known = await knownStates(fetchHa);
  } catch (e) {
    return { status: 502, body: { error: `Home Assistant could not be asked: ${errorMessage(e)}` } };
  }
  const checked = checkBatch(body, known);
  if (!checked.ok) return { status: 400, body: { error: checked.error } };
  const results = await Promise.all(
    checked.calls.map(async (c): Promise<CallResult> => {
      if (!known[c.entity]) return { ok: false, error: `${c.entity} is not known to Home Assistant any more` };
      try {
        const res = await fetchHa(`services/${c.domain}/${c.service}`, { method: "POST", body: JSON.stringify(c.data) });
        return res.ok ? { ok: true } : { ok: false, error: `Home Assistant refused it (HTTP ${res.status})` };
      } catch (e) {
        return { ok: false, error: errorMessage(e) };
      }
    }),
  );
  return { status: 200, body: { ok: results.every((r) => r.ok), results } };
}
