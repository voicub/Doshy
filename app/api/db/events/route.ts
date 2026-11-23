import { checkRange } from "@/lib/calendar";
import { addEvent, listEvents } from "@/lib/db/events";
import { api, readJson, reply } from "@/lib/db/http";
import { badRequest } from "@/lib/db/validate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BODY = 16 * 1024;

/** The dashboard calendar's events in a range (`?start=<ISO>&end=<ISO>`, at most 100 days), in Home Assistant's event shape: `{ events }`. */
export function GET(req: Request) {
  return api(req, {}, (db) => {
    const q = new URL(req.url).searchParams;
    const r = checkRange(q.get("start"), q.get("end"));
    if (!r.ok) throw badRequest(r.error);
    return reply({ events: listEvents(db, r.start, r.end) });
  });
}

/** Body `{ title, allDay, start, end, description, location }` (see lib/calendar.ts `checkEventInput`). 201 `{ event }`. */
export function POST(req: Request) {
  return api(req, { write: true }, async (db) => reply({ event: addEvent(db, await readJson(req, MAX_BODY)) }, 201));
}
