import { parseDashboardId } from "@/lib/db/dashboards";
import { api, readJson, replyRaw } from "@/lib/db/http";
import { planText, restoreVersion } from "@/lib/db/plans";
import { badRequest, isCount } from "@/lib/db/validate";
import { isRecord } from "@/lib/guards";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Make a saved version of this plan its working plan. Body `{ id }`. Replies with the new working plan (same shape as GET .../plan). */
export function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return api(req, { write: true }, async (db) => {
    const dashboardId = parseDashboardId((await ctx.params).id);
    const body = await readJson(req, 1024);
    if (!isRecord(body) || !isCount(body.id, Number.MAX_SAFE_INTEGER)) throw badRequest("Say which version to restore.");
    return replyRaw(planText(restoreVersion(db, dashboardId, body.id)));
  });
}
