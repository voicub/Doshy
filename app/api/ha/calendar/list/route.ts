import { isCalendarEntity } from "@/lib/calendar";
import { MAX_HOMES } from "@/lib/db/connections";
import { HttpError } from "@/lib/db/errors";
import { refuse } from "@/lib/db/http";
import { errorMessage, isRecord } from "@/lib/guards";
import { haFailure, haFetchFor, HOME_HEADER } from "@/lib/haServer";
import type { HaFetch } from "@/lib/server/haCall";
import { ttlCache } from "@/lib/server/ttlCache";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_CALENDARS = 50;
type Entry = { entity_id: string; name: string };
const cache = ttlCache<Entry[]>(20_000, MAX_HOMES + 1); // one entry per home

async function load(fetchHa: HaFetch): Promise<Entry[]> {
  const res = await fetchHa("calendars", { signal: AbortSignal.timeout(8000) });
  if (res.status === 404) return []; // the calendar integration is not installed in HA
  if (!res.ok) throw new Error(`Home Assistant HTTP ${res.status}`);
  const raw: unknown = await res.json();
  const list: Entry[] = [];
  for (const c of Array.isArray(raw) ? raw : []) {
    if (!isRecord(c) || !isCalendarEntity(c.entity_id)) continue;
    const { entity_id, name } = c;
    list.push({ entity_id, name: typeof name === "string" && name.trim() ? name.trim().slice(0, 100) : entity_id });
  }
  return list.slice(0, MAX_CALENDARS);
}

/** Home Assistant's calendars: `{ calendars: [{ entity_id, name }] }`. Empty when HA has no calendar set up; `error: true` when it cannot be asked. Cached 20 s. */
export async function GET(req: Request) {
  const refused = refuse(req);
  if (refused) return refused;
  try {
    const fetchHa = haFetchFor(req);
    return Response.json({ calendars: await cache.get(req.headers.get(HOME_HEADER) || "main", () => load(fetchHa)) });
  } catch (e) {
    if (e instanceof HttpError) return haFailure(e);
    console.error("calendar list:", errorMessage(e));
    return Response.json({ calendars: [], error: true });
  }
}
