import { parseDashboardId, undeleteDashboard } from "@/lib/db/dashboards";
import { api, reply } from "@/lib/db/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Bring a deleted plan back (within 7 days of deleting it). `{ dashboard }`; 410 `gone` when it was deleted longer ago. */
export function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return api(req, { write: true }, async (db) => reply({ dashboard: undeleteDashboard(db, parseDashboardId((await ctx.params).id)) }));
}
