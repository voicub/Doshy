import { checkRange, isCalendarEntity } from "@/lib/calendar";
import { refuse } from "@/lib/db/http";
import { errorMessage, isRecord } from "@/lib/guards";
import { ha } from "@/lib/haServer";
import { ttlCache } from "@/lib/server/ttlCache";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CACHE_MS = 20_000;
const MAX_CACHE = 100; // calendar x range
const MAX_ENTITIES = 20;
const MAX_EVENTS = 500;
const FIELDS = ["summary", "description", "location", "uid", "recurrence_id", "rrule"] as const;
type Body = { calendars: Record<string, unknown[]>; failed: string[] };
// One entry per calendar and range: a calendar that fails is not kept (the next look retries it) while the others stay cached, and browsers asking together share one request to HA.
const cache = ttlCache<unknown[]>(CACHE_MS, MAX_CACHE);

/** Only the fields we use, only text and date objects: nothing else HA sends goes on to the browser. */
function pick(raw: unknown): Record<string, unknown> | null {
  if (!isRecord(raw)) return null;
  const r = raw;
  const out: Record<string, unknown> = {};
  for (const f of FIELDS) if (typeof r[f] === "string") out[f] = r[f];
  for (const f of ["start", "end"] as const) {
    const w = r[f];
    if (typeof w === "string") out[f] = w;
    else if (isRecord(w)) {
      const { date, dateTime } = w;
      out[f] = typeof date === "string" ? { date } : typeof dateTime === "string" ? { dateTime } : undefined;
    }
  }
  return out.start === undefined ? null : out;
}

async function one(entity: string, start: string, end: string): Promise<unknown[]> {
  const res = await ha(`calendars/${entity}?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`, { signal: AbortSignal.timeout(10_000) });
  if (!res.ok) throw new Error(`Home Assistant HTTP ${res.status} for ${entity}`);
  const raw: unknown = await res.json();
  return (Array.isArray(raw) ? raw : []).flatMap((e) => pick(e) ?? []).slice(0, MAX_EVENTS);
}

/**
 * Events of one or more HA calendars in a range: `?entity=calendar.a&entity=calendar.b&start=<ISO>&end=<ISO>` (at most 100 days).
 * `{ calendars: { [entity]: events }, failed: [entity] }`: one calendar failing does not hide the others. Cached 20 s; `fresh=1` skips the cache (right after a change).
 */
export async function GET(req: Request) {
  const refused = refuse(req);
  if (refused) return refused;
  const q = new URL(req.url).searchParams;
  const entities = [...new Set(q.getAll("entity").flatMap((e) => e.split(",")))].sort();
  if (!entities.length || entities.length > MAX_ENTITIES || !entities.every(isCalendarEntity)) return Response.json({ error: "entity must be one or more calendar entities" }, { status: 400 });
  const range = checkRange(q.get("start"), q.get("end"));
  if (!range.ok) return Response.json({ error: range.error }, { status: 400 });
  const [start, end] = [new Date(range.start).toISOString(), new Date(range.end).toISOString()];
  const fresh = q.has("fresh");
  const results = await Promise.allSettled(entities.map((e) => cache.get(`${e}|${start}|${end}`, () => one(e, start, end), { fresh })));
  const body: Body = { calendars: {}, failed: [] };
  results.forEach((r, i) => {
    if (r.status === "fulfilled") body.calendars[entities[i]] = r.value;
    else {
      console.error("calendar events:", errorMessage(r.reason));
      body.failed.push(entities[i]);
    }
  });
  return Response.json(body);
}
