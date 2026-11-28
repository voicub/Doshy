import { assertHomesEditable, homeSecret, isHomeId, noteHomeResult, parseToken } from "@/lib/db/connections";
import { badRequest } from "@/lib/db/validate";
import { api, readJson, reply } from "@/lib/db/http";
import { isRecord } from "@/lib/guards";
import { probeHome } from "@/lib/server/haProbe";
import { parseHaUrl } from "@/lib/server/haUrl";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Try a Home Assistant: either a new one (`{ url, token }`) or a saved one (`{ id }`, and optionally `{ url }` to try another address, which needs `{ token }` too: a saved token is never sent
 * to an address it was not saved for). Answers `{ ok: true, version, locationName }` or `{ ok: false, error }` with the reason in plain words; HTTP 400 only for a request that makes no sense.
 */
export function POST(req: Request) {
  return api(req, { connect: true }, async (db) => {
    assertHomesEditable();
    const body = await readJson(req, 8192);
    if (!isRecord(body)) throw badRequest("Send the address and token as JSON.");
    const id = body.id === undefined ? null : body.id;
    if (id !== null && !isHomeId(id)) throw badRequest("That home is not set up (any more).");
    let baseUrl: string;
    let token: string;
    if (id === null) {
      baseUrl = parseHaUrl(body.url);
      token = parseToken(body.token);
    } else {
      const saved = homeSecret(db, id);
      baseUrl = body.url === undefined ? saved.baseUrl : parseHaUrl(body.url);
      if (body.token === undefined && new URL(baseUrl).origin !== new URL(saved.baseUrl).origin) throw badRequest("Enter the token again to try a different address.");
      token = body.token === undefined ? saved.token : parseToken(body.token);
    }
    const result = await probeHome(baseUrl, token);
    if (id !== null && body.url === undefined && body.token === undefined) noteHomeResult(db, id, result.ok ? null : result.error);
    return reply(result);
  });
}
