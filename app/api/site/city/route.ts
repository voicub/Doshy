import { refuse } from "@/lib/db/http";
import { bytesResponse } from "@/lib/server/bytesResponse";
import { parseCityQuery } from "@/lib/siteCity";
import { cityModel } from "@/lib/siteCityServer";
import { CITY_META_HEADER } from "@/lib/siteCityTypes";
import { SiteError } from "@/lib/siteServer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// A cold run downloads up to 25 tiles and builds the mesh (the tool is stopped after 120 s); the answer is cached for 30 days afterwards.
export const maxDuration = 300;

const fail = (status: number, error: string) => Response.json({ error }, { status, headers: { "cache-control": "no-store" } });

/**
 * `GET /api/site/city?lat=&lon=&tiles=3|5&terrain=0|1&roads=0|1` answers the Vectiler OBJ of the tiles around a point, gzip as stored (content-encoding),
 * with `x-city-meta` saying where it sits. `&fresh=1` skips the cache, but only when the dashboard itself asks (a browser on the same origin).
 */
export async function GET(req: Request) {
  const refused = refuse(req);
  if (refused) return refused;
  const q = parseCityQuery(new URL(req.url).searchParams);
  if (typeof q === "string") return fail(400, q);
  const explicit = req.headers.get("sec-fetch-site") === "same-origin" || req.headers.get("origin") !== null;
  try {
    const { gz, meta } = await cityModel({ ...q, fresh: q.fresh && explicit });
    return bytesResponse(gz, {
      headers: {
        "content-type": "text/plain; charset=utf-8",
        "content-encoding": "gzip",
        "cache-control": "no-store",
        "x-content-type-options": "nosniff",
        [CITY_META_HEADER]: JSON.stringify(meta),
      },
    });
  } catch (e) {
    if (e instanceof SiteError) return fail(e.status, e.message);
    console.error("site city:", e);
    return fail(500, "Something went wrong while building the city model.");
  }
}
