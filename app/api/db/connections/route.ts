import { MAIN_NAME, assertHomesEditable, createHome, homesLockedReason, listHomes, parseNewHome } from "@/lib/db/connections";
import { api, readJson, reply } from "@/lib/db/http";
import { haConfigured } from "@/lib/server/curtainAutomation";
import { assertHostAllowed } from "@/lib/server/haUrl";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The homes (Home Assistants) this Doshy can show: `{ main: { name, configured }, homes: [{ id, name, url, hint, createdAt, lastOkAt, lastError, needsToken, plans }], locked }`.
 * `main` is the one from the server's own settings (HA_URL / HA_TOKEN or the add-on). There is never a token in this answer, not even a sealed one: only `hint`, the last 4 characters.
 */
export function GET(req: Request) {
  return api(req, {}, (db) => reply({ main: { name: MAIN_NAME, configured: haConfigured() }, homes: listHomes(db), locked: homesLockedReason() }));
}

/** Add a home: `{ name, url, token }` -> 201 `{ home }`. Same-origin only, at most 10 tries a minute, refused when the server has switched extra homes off. */
export function POST(req: Request) {
  return api(req, { connect: true }, async (db) => {
    assertHomesEditable();
    const input = parseNewHome(await readJson(req, 8192));
    await assertHostAllowed(input.url);
    return reply({ home: createHome(db, input) }, 201);
  });
}
