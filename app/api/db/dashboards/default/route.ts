import { parseIdBody, setDefaultDashboard } from "@/lib/db/dashboards";
import { api, readJson, reply } from "@/lib/db/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Make a plan the home plan (what a device without a choice shows, and the only plan the curtain automation reads). Body `{ id }`. */
export function PUT(req: Request) {
  return api(req, { write: true }, async (db) => {
    setDefaultDashboard(db, parseIdBody(await readJson(req, 1024)));
    return reply({ ok: true });
  });
}
