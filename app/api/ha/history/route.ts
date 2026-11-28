import { haFailure, haFor, resolveHa, type HaHome } from "@/lib/haServer";
import { ttlCache } from "@/lib/server/ttlCache";
import { parseHistory, type Series } from "@/lib/stats";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ENTITY = /^[a-z0-9_]+\.[a-z0-9_]+$/;
const ATTR = /^[a-z0-9_]+$/;
const MAX_ENTITIES = 24;
const MAX_ATTRS = 6;
const CACHE_MS = 30_000;
const CACHE_MAX = 60;
const HA_TIMEOUT_MS = 30_000; // a week of 24 entities can take Home Assistant's recorder a while

type Payload = { from: number; to: number; series: Record<string, Series> };
const cache = ttlCache<Payload>(CACHE_MS, CACHE_MAX);

const bad = (error: string) => Response.json({ error }, { status: 400 });
const intParam = (v: string | null, def: number) => (v === null ? def : /^\d+$/.test(v) ? Number(v) : NaN);

async function load(home: HaHome, entities: string[], attrs: string[], hours: number, points: number): Promise<Payload> {
  const to = Date.now();
  const from = to - hours * 3_600_000;
  const q = new URLSearchParams({ end_time: new Date(to).toISOString(), significant_changes_only: "0" });
  // filter_entity_id keeps its literal commas (ids are validated above); minimal_response/no_attributes are bare flags
  let url = `history/period/${new Date(from).toISOString()}?filter_entity_id=${entities.join(",")}&minimal_response&${q}`;
  if (!attrs.length) url += "&no_attributes";
  const res = await haFor(home)(url, { signal: AbortSignal.timeout(HA_TIMEOUT_MS) });
  if (!res.ok) throw new Error(`Home Assistant HTTP ${res.status}`);
  return { from, to, series: parseHistory(await res.json(), from, to, points, attrs) };
}

/** Read-only history: numeric entities bucket-averaged, the rest as state changes, `attrs` as `entity|attr` change series. Cached ~30 s. */
export async function GET(req: Request) {
  const sp = new URL(req.url).searchParams;
  const entities = [...new Set((sp.get("entities") ?? "").split(",").filter(Boolean))];
  const attrs = [...new Set((sp.get("attrs") ?? "").split(",").filter(Boolean))];
  const hours = intParam(sp.get("hours"), 24);
  const points = intParam(sp.get("points"), 240);
  if (!entities.length) return bad("entities is required");
  if (entities.length > MAX_ENTITIES) return bad(`at most ${MAX_ENTITIES} entities`);
  if (!entities.every((e) => ENTITY.test(e))) return bad("invalid entity id");
  if (attrs.length > MAX_ATTRS || !attrs.every((a) => ATTR.test(a))) return bad("invalid attrs");
  if (!(hours >= 1 && hours <= 168)) return bad("hours must be 1..168");
  if (!(points >= 20 && points <= 500)) return bad("points must be 20..500");

  try {
    const home = resolveHa(req);
    const key = `${home.id}|${[...entities].sort().join(",")}|${[...attrs].sort().join(",")}|${hours}|${points}`;
    return Response.json(await cache.get(key, () => load(home, entities, attrs, hours, points)));
  } catch (e) {
    return haFailure(e);
  }
}
