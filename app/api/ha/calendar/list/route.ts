import { isCalendarEntity } from "@/lib/calendar";
import { refuse } from "@/lib/db/http";
import { errorMessage, isRecord } from "@/lib/guards";
import { ha } from "@/lib/haServer";
import { ttlCache } from "@/lib/server/ttlCache";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_CALENDARS = 50;
type Entry = { entity_id: string; name: string };
const cache = ttlCache<Entry[]>(20_000, 1);

async function load(): Promise<Entry[]> {
  const res = await ha("calendars", { signal: AbortSignal.timeout(8000) });
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
    return Response.json({ calendars: await cache.get("list", load) });
  } catch (e) {
    console.error("calendar list:", errorMessage(e));
    return Response.json({ calendars: [], error: true });
  }
}
