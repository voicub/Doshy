import { parseDashboardId, requireDashboard } from "@/lib/db/dashboards";
import { api, readJson, reply } from "@/lib/db/http";
import { MAX_PLAN_BYTES } from "@/lib/db/planDoc";
import { listVersions, parseVersionBody, saveVersion, saveVersionOf } from "@/lib/db/plans";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/** Saved versions of this plan, newest first: `{ versions: [{ id, label, manual, rev, savedAt, changedAt, bytes, summary }] }`. An empty label means an automatic one. */
export function GET(req: Request, ctx: Ctx) {
  return api(req, {}, async (db) => {
    const id = parseDashboardId((await ctx.params).id);
    requireDashboard(db, id);
    return reply({ versions: listVersions(db, id) });
  });
}

/** "Save version now". Body `{ label? }`. With `{ label, plan, format }` that plan (not the working one) is kept as the version. */
export function POST(req: Request, ctx: Ctx) {
  return api(req, { write: true }, async (db) => {
    const id = parseDashboardId((await ctx.params).id);
    const { label, plan } = parseVersionBody(await readJson(req, MAX_PLAN_BYTES + 4096));
    return reply({ version: plan ? saveVersionOf(db, id, plan, label) : saveVersion(db, id, label) }, 201);
  });
}
