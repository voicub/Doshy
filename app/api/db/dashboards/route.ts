import { createHash } from "node:crypto";
import { createDashboard, listDashboards, parseCreateBody } from "@/lib/db/dashboards";
import { api, readJson, reply } from "@/lib/db/http";
import { MAX_PLAN_BYTES } from "@/lib/db/planDoc";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Every plan that is not deleted, in the owner's order, with what the switcher and manager show (never a plan's text):
 * `{ defaultId, dashboards: [{ id, name, icon, color, description, sort, createdAt, updatedAt, thumbRev, rev, format, bytes, summary }] }`.
 * Carries an ETag: a poll that finds nothing changed gets an empty 304.
 */
export function GET(req: Request) {
  return api(req, {}, (db) => {
    const text = JSON.stringify(listDashboards(db));
    const etag = `"${createHash("sha1").update(text).digest("base64url")}"`;
    if (req.headers.get("if-none-match") === etag) return new Response(null, { status: 304, headers: { etag, "cache-control": "no-store" } });
    return new Response(text, { headers: { "content-type": "application/json", "cache-control": "no-store", etag } });
  });
}

/**
 * Create a plan: `{ name, icon?, color?, description?, plan?, format? }` (blank, template or imported: `plan` is its first working plan) or
 * `{ fromId, name? }` (a copy of another plan's working plan). 201 `{ dashboard }`; 409 `name_taken`, `too_many` (24 plans).
 */
export function POST(req: Request) {
  return api(req, { write: true }, async (db) => reply({ dashboard: createDashboard(db, parseCreateBody(await readJson(req, MAX_PLAN_BYTES + 4096))) }, 201));
}
