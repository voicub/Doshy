import { parseOrderBody, setDashboardOrder } from "@/lib/db/dashboards";
import { api, readJson, reply } from "@/lib/db/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** The order to show the plans in. Body `{ ids }`: those first, in that order; any plan not listed follows. */
export function PUT(req: Request) {
  return api(req, { write: true }, async (db) => {
    setDashboardOrder(db, parseOrderBody(await readJson(req, 4096)));
    return reply({ ok: true });
  });
}
