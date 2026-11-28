import { refuse } from "@/lib/db/http";
import { EXTERNAL_OFF_MESSAGE, externalCacheDir, externalDataEnabled } from "@/lib/server/externalData";
import { SiteError } from "@/lib/siteServer";
import { overtureBuildings, parseOvertureQuery } from "@/lib/siteOvertureServer";
import { windowLimiter } from "@/lib/siteTiles";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// A cold load reads up to 9 tiles out of Overture's archive with a few range requests each.
export const maxDuration = 90;

const anyRequest = windowLimiter(30, 60_000);

const fail = (status: number, error: string) => Response.json({ error }, { status, headers: { "cache-control": "no-store" } });

/**
 * `GET /api/site/overture?lat=&lon=&radius=` answers `{ release, buildings, tiles, failed, withHeight, attribution }`: the buildings around a point from Overture Maps'
 * current release as `SiteBuilding`s (metres about the point, x east, y south). The tiles are read by this server (HTTP range requests into Overture's PMTiles
 * archive) and cached on disk.
 */
export async function GET(req: Request) {
  const refused = refuse(req);
  if (refused) return refused;
  if (!externalDataEnabled()) return fail(403, EXTERNAL_OFF_MESSAGE);
  if (!anyRequest()) return fail(429, "Too many building requests at once. Try again in a moment.");
  const q = parseOvertureQuery(new URL(req.url).searchParams);
  if (typeof q === "string") return fail(400, q);
  try {
    return Response.json(await overtureBuildings(q, { dir: externalCacheDir("overture") }), { headers: { "cache-control": "no-store" } });
  } catch (e) {
    if (e instanceof SiteError) return fail(e.status, e.message);
    console.error("site overture:", e);
    return fail(500, "Something went wrong while loading the Overture Maps buildings.");
  }
}
