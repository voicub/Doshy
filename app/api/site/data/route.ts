import { refuse } from "@/lib/db/http";
import { SiteError, parseSiteQuery, siteData } from "@/lib/siteServer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// A cold fetch asks OpenStreetMap, which can take a minute: the answer is cached for 30 days afterwards.
export const maxDuration = 200;

const fail = (status: number, error: string) => Response.json({ error }, { status, headers: { "cache-control": "no-store" } });

/**
 * `GET /api/site/data?lat=&lon=&radius=` answers `SiteData` (lib/siteTypes.ts): the buildings, trees, areas and roads around a point from OpenStreetMap and the
 * ground height from Open-Meteo, in metres about the point. `&fresh=1` skips the cache, but only when the dashboard itself asks (a browser on the same origin).
 */
export async function GET(req: Request) {
  const refused = refuse(req);
  if (refused) return refused;
  const url = new URL(req.url);
  const q = parseSiteQuery(url.searchParams);
  if (typeof q === "string") return fail(400, q);
  const explicit = req.headers.get("sec-fetch-site") === "same-origin" || req.headers.get("origin") !== null;
  try {
    return Response.json(await siteData({ ...q, fresh: q.fresh && explicit }), { headers: { "cache-control": "no-store" } });
  } catch (e) {
    if (e instanceof SiteError) return fail(e.status, e.message);
    console.error("site data:", e);
    return fail(500, "Something went wrong while loading the surroundings.");
  }
}
