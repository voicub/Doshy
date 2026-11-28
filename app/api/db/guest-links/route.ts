import { api, readJson, reply } from "@/lib/db/http";
import { parseDashboardId } from "@/lib/db/dashboards";
import { createLink, listLinks, parseNewLink } from "@/lib/server/guestLinks";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** The owner's list of a plan's guest links (`?dashboard=<id>`): label, expiry, last used. Never a token or a hash: the address exists in the clear only when it is made. */
export function GET(req: Request) {
  return api(req, {}, (db) => reply({ links: listLinks(db, parseDashboardId(new URL(req.url).searchParams.get("dashboard") ?? "")) }));
}

/** Make a link: `{ dashboardId, label?, pin?, expires: "1h" | "1d" | "7d" | "never", live?, location? }` -> 201 `{ link, token }` (the token is shown once). Same-origin only, like every /api/db write. */
export function POST(req: Request) {
  return api(req, { write: true }, async (db) => reply(await createLink(db, parseNewLink(await readJson(req, 4096))), 201));
}
