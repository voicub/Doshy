// GET /api/ha/states as a plain Request -> Response function, so tests can call it without Next. app/api/ha/states/route.ts only forwards.
import { haFailure, haFor, noteHome, resolveHa } from "../haServer.ts";
import { etagMatches, statesSnapshot } from "./haStates.ts";

/**
 * Every entity of the home this request is about (`X-Doshy-Home`, else the built-in home), cut down to what the dashboard renders (lib/server/haStates.ts). The reply carries an ETag: a poller
 * that sends it back as `If-None-Match` gets an empty 304 while nothing changed. `no-store` keeps the browser from writing a 250 KB copy to disk on every poll.
 * This is also the poll that tells the Homes list whether an extra home answers.
 */
export async function statesReply(req: Request): Promise<Response> {
  try {
    const home = resolveHa(req);
    const fetchHa = haFor(home);
    const loadStates = async (): Promise<unknown> => {
      try {
        const res = await fetchHa("states");
        if (!res.ok) throw new Error(`Home Assistant HTTP ${res.status}`);
        const list: unknown = await res.json();
        noteHome(req, home, null);
        return list;
      } catch (e) {
        noteHome(req, home, e);
        throw e;
      }
    };
    const { body, etag } = await statesSnapshot(home.id, loadStates);
    const headers = { "cache-control": "no-store", etag };
    if (etagMatches(req.headers.get("if-none-match"), etag)) return new Response(null, { status: 304, headers });
    return new Response(body, { headers: { ...headers, "content-type": "application/json" } });
  } catch (e) {
    return haFailure(e);
  }
}
