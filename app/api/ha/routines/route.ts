import { haFailure, haFor, resolveHa } from "@/lib/haServer";
import { parseRoutinesQuery } from "@/lib/server/routineHistory";
import { loadRoutines } from "@/lib/server/routineLoad";
import { ttlCache } from "@/lib/server/ttlCache";
import type { RoutinesWire } from "@/lib/routinesWire";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CACHE_MS = 10 * 60_000; // weeks of history change slowly; "Scan again" in the panel asks for a fresh answer with `fresh=1`
const CACHE_MAX = 4;
const cache = ttlCache<RoutinesWire>(CACHE_MS, CACHE_MAX);

/**
 * Read-only: the state changes of the asked-for devices over the last 7 to 30 days (`entities`, `days`), the home's time zone and place, and what its automations already do
 * (see lib/routinesWire.ts for the format). Cached 10 minutes per home and list of devices.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const q = parseRoutinesQuery(url.searchParams);
  if (!q.ok) return Response.json({ error: q.error }, { status: 400 });
  try {
    const home = resolveHa(req);
    const key = `${home.id}|${[...q.entities].sort().join(",")}|${q.days}`;
    return Response.json(await cache.get(key, () => loadRoutines(haFor(home), q.entities, q.days, Date.now()), { fresh: url.searchParams.get("fresh") === "1" }));
  } catch (e) {
    return haFailure(e);
  }
}
