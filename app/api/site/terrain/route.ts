import { refuse } from "@/lib/db/http";
import { EXTERNAL_OFF_MESSAGE, externalCacheDir, externalDataEnabled } from "@/lib/server/externalData";
import { SiteError } from "@/lib/siteServer";
import { parseTerrainQuery, terrainFromTiles } from "@/lib/siteTerrainServer";
import { windowLimiter } from "@/lib/siteTiles";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// A cold load downloads up to 9 tiles of about 70 KB each from AWS.
export const maxDuration = 60;

const anyRequest = windowLimiter(60, 60_000);

const fail = (status: number, error: string) => Response.json({ error }, { status, headers: { "cache-control": "no-store" } });

/**
 * `GET /api/site/terrain?lat=&lon=&radius=&n=` answers `{ terrain, zoom, tiles, attribution }`: the ground height around a point from AWS Terrain Tiles as a
 * `SiteTerrain` of n x n nodes (n odd, 33 to 257), metres relative to the ground at the point. The tiles are fetched by this server and cached on disk.
 */
export async function GET(req: Request) {
  const refused = refuse(req);
  if (refused) return refused;
  if (!externalDataEnabled()) return fail(403, EXTERNAL_OFF_MESSAGE);
  if (!anyRequest()) return fail(429, "Too many terrain requests at once. Try again in a moment.");
  const q = parseTerrainQuery(new URL(req.url).searchParams);
  if (typeof q === "string") return fail(400, q);
  try {
    return Response.json(await terrainFromTiles(q, { dir: externalCacheDir("terrain") }), { headers: { "cache-control": "no-store" } });
  } catch (e) {
    if (e instanceof SiteError) return fail(e.status, e.message);
    console.error("site terrain:", e);
    return fail(500, "Something went wrong while loading the ground height.");
  }
}
