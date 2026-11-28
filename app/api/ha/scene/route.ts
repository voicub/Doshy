import { refuse } from "@/lib/db/http";
import { haFailure, haFetchFor } from "@/lib/haServer";
import { tokenBucket } from "@/lib/modelLibrary";
import { runBatch } from "@/lib/server/haBatch";
import { forgetStates } from "@/lib/server/haStates";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BODY = 64 * 1024;
// A scene is a handful of taps, not a loop: 30 runs a minute is far more than a person makes and stops a stuck client from hammering Home Assistant.
const take = tokenBucket(30);

/**
 * Runs a scene: `{ actions: [{ domain, service, entity_id, data? }] }`, at most 40, each held to the rules of /api/ha/service. A bad action refuses the whole
 * batch (400); otherwise the reply is `{ ok, results: [{ ok, error? }] }`, one entry per action, so a failure is reported where it happened.
 */
export async function POST(req: Request) {
  const refused = refuse(req);
  if (refused) return refused;
  if (!take()) return Response.json({ error: "Too many scenes at once. Try again in a moment." }, { status: 429 });
  if (!(req.headers.get("content-type") ?? "").toLowerCase().startsWith("application/json")) return Response.json({ error: "Send JSON." }, { status: 415 });
  const text = await req.text().catch(() => "");
  if (text.length > MAX_BODY) return Response.json({ error: "That request is too large." }, { status: 413 });
  let body: unknown = null;
  try {
    body = JSON.parse(text);
  } catch {
    /* checked as a bad batch below */
  }
  let r;
  try {
    r = await runBatch(body, haFetchFor(req));
  } catch (e) {
    return haFailure(e);
  }
  forgetStates(); // the dashboard re-reads shortly after: that read must not get a copy from before the scene
  return Response.json(r.body, { status: r.status });
}
