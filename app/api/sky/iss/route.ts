import { refuse } from "@/lib/db/http";
import { fetchIss } from "@/lib/server/iss";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const headers = { "cache-control": "no-store" };

/**
 * `GET /api/sky/iss` answers `{ fix, prevFix, fetchedAt }` (the station's position now and 30 seconds earlier, see lib/iss.ts for the fields), or `{ disabled: true }` when
 * this server may not download from the internet (DOSHY_EXTERNAL_DATA=0), or `{ unavailable: true }` when the position service cannot be reached. Always 200 with a tiny body
 * unless the request is not from this dashboard (403). Many browsers share one upstream request every 10 seconds.
 */
export async function GET(req: Request) {
  const refused = refuse(req);
  if (refused) return refused;
  try {
    return Response.json(await fetchIss(fetch), { headers });
  } catch {
    return Response.json({ unavailable: true }, { headers });
  }
}
