import { haFailure, ha } from "@/lib/haServer";
import { etagMatches, statesSnapshot } from "@/lib/server/haStates";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function loadStates(): Promise<unknown> {
  const res = await ha("states");
  if (!res.ok) throw new Error(`Home Assistant HTTP ${res.status}`);
  return res.json();
}

/**
 * Every entity, cut down to what the dashboard renders (lib/server/haStates.ts). The reply carries an ETag: a poller that sends it back as
 * `If-None-Match` gets an empty 304 while nothing changed. `no-store` keeps the browser from writing a 250 KB copy to disk on every poll.
 */
export async function GET(req: Request) {
  try {
    const { body, etag } = await statesSnapshot(loadStates);
    const headers = { "cache-control": "no-store", etag };
    if (etagMatches(req.headers.get("if-none-match"), etag)) return new Response(null, { status: 304, headers });
    return new Response(body, { headers: { ...headers, "content-type": "application/json" } });
  } catch (e) {
    return haFailure(e);
  }
}
