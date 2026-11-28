import { haFailure, haFor, resolveHa } from "@/lib/haServer";
import { parseAnomalyQuery } from "@/lib/server/anomalyHistory";
import { loadAnomalies } from "@/lib/server/anomalyLoad";
import { ttlCache } from "@/lib/server/ttlCache";
import type { AnomalyWire } from "@/lib/anomalyWire";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CACHE_MS = 15 * 60_000; // weeks of history change slowly; "Check now" in the panel asks for a fresh answer with `fresh=1`
const CACHE_MAX = 4;
const cache = ttlCache<AnomalyWire>(CACHE_MS, CACHE_MAX);

/**
 * Read-only: one number per hour for each asked-for sensor over the last 7 to 30 days (`entities`, `days`), when Home Assistant last heard from each, and the home's time zone
 * (see lib/anomalyWire.ts for the format). Cached 15 minutes per home and list of sensors.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const q = parseAnomalyQuery(url.searchParams);
  if (!q.ok) return Response.json({ error: q.error }, { status: 400 });
  try {
    const home = resolveHa(req);
    const key = `${home.id}|${[...q.entities].sort().join(",")}|${q.days}`;
    return Response.json(await cache.get(key, () => loadAnomalies(haFor(home), q.entities, q.days, Date.now()), { fresh: url.searchParams.get("fresh") === "1" }));
  } catch (e) {
    return haFailure(e);
  }
}
