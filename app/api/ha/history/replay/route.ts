import { haFailure, haFor, resolveHa, type HaHome } from "@/lib/haServer";
import { historyPaths, parseReplayQuery, shapeReplay } from "@/lib/server/replayHistory";
import { ttlCache } from "@/lib/server/ttlCache";
import type { ReplayHours, ReplayWire } from "@/lib/timeline";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CACHE_MS = 120_000;
const CACHE_MAX = 6; // a few entity lists x two spans: each answer can be a megabyte
const HA_TIMEOUT_MS = 30_000; // a week of a hundred entities takes Home Assistant's recorder a while
const cache = ttlCache<ReplayWire>(CACHE_MS, CACHE_MAX);

async function load(home: HaHome, entities: string[], hours: ReplayHours): Promise<ReplayWire> {
  const to = Date.now();
  const from = to - hours * 3_600_000;
  // one query with attributes (lights, covers, climate...) and one without (the rest), asked together
  const answers = await Promise.all(
    historyPaths(entities, from, to).map(async (path) => {
      const res = await haFor(home)(path, { signal: AbortSignal.timeout(HA_TIMEOUT_MS) });
      if (!res.ok) throw new Error(`Home Assistant HTTP ${res.status}`);
      const body: unknown = await res.json();
      return body;
    }),
  );
  return shapeReplay(answers, entities, from, to, hours);
}

/** Read-only history for the replay scrubber: every entity's changes over the last 24 h or 7 days in one compact answer (see lib/timeline.ts for the format). Cached ~2 min. */
export async function GET(req: Request) {
  const q = parseReplayQuery(new URL(req.url).searchParams);
  if (!q.ok) return Response.json({ error: q.error }, { status: 400 });
  try {
    const home = resolveHa(req);
    return Response.json(await cache.get(`${home.id}|${[...q.entities].sort().join(",")}|${q.hours}`, () => load(home, q.entities, q.hours)));
  } catch (e) {
    return haFailure(e);
  }
}
