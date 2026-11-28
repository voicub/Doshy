import { parseDashboardId, parsePatchBody, patchDashboard, softDeleteDashboard } from "@/lib/db/dashboards";
import { api, readJson, reply } from "@/lib/db/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/** Body: any of `{ name, icon, color, description }`. `{ dashboard }`; 409 `name_taken`. */
export function PATCH(req: Request, ctx: Ctx) {
  return api(req, { write: true }, async (db) => {
    const id = parseDashboardId((await ctx.params).id);
    return reply({ dashboard: patchDashboard(db, id, parsePatchBody(await readJson(req, 4096))) });
  });
}

/** Delete (kept for 7 days, see `POST .../undelete`). 409 `is_default` for the home plan, `last_plan` for the only plan. */
export function DELETE(req: Request, ctx: Ctx) {
  return api(req, { write: true }, async (db) => {
    softDeleteDashboard(db, parseDashboardId((await ctx.params).id));
    return reply({ ok: true });
  });
}
