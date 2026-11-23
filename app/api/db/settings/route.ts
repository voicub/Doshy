import { api, readJson, reply } from "@/lib/db/http";
import { HttpError } from "@/lib/db/errors";
import { getSettings, setSettings } from "@/lib/db/settings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BODY = 1024 * 1024;

/** Every setting in one read: `{ settings: { [key]: { value, updatedAt } } }`. */
export function GET(req: Request) {
  return api(req, {}, (db) => reply({ settings: getSettings(db) }));
}

/** Body `{ settings: { [key]: value } }`: set many keys at once (all or nothing). */
export function PUT(req: Request) {
  return api(req, { write: true }, async (db) => {
    const body = await readJson(req, MAX_BODY);
    if (!body || typeof body !== "object" || !("settings" in body)) throw new HttpError(400, "bad_request", "Expected { settings: { ... } }.");
    return reply({ changed: setSettings(db, body.settings) });
  });
}
