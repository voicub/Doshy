import { api, readJson, reply, replyRaw } from "@/lib/db/http";
import { getPlan, getPlanRev, MAX_PLAN_BYTES, parsePlanBody, planText, putPlan } from "@/lib/db/plans";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The working plan: `{ rev, updatedAt, format, plan }`, or `{ rev: 0, plan: null }` when there is none yet.
 * With `?since=<rev>` and nothing newer, only `{ rev, unchanged: true }` comes back (cheap to poll).
 */
export function GET(req: Request) {
  return api(req, {}, (db) => {
    const since = new URL(req.url).searchParams.get("since");
    const rev = since === null ? null : getPlanRev(db);
    if (rev !== null && Number(since) === rev) return reply({ rev, unchanged: true }); // a poll costs one tiny read, not the plan
    const p = getPlan(db);
    if (!p) return reply({ rev: 0, plan: null });
    return replyRaw(planText(p));
  });
}

/**
 * Body `{ plan, baseRev, format, overwrite? }`. `baseRev` is the revision the caller last saw (0 = none). 200 `{ rev, updatedAt, changed }` when it
 * was the latest; 409 `{ error, code: "conflict", server: { rev, updatedAt, format, plan } }` when someone saved in between (nothing is written).
 */
export function PUT(req: Request) {
  return api(req, { write: true }, async (db) => {
    const r = putPlan(db, parsePlanBody(await readJson(req, MAX_PLAN_BYTES + 4096)));
    if (r.ok) return reply({ rev: r.rev, updatedAt: r.updatedAt, changed: r.changed });
    return replyRaw(`{"error":"Someone saved a newer version of this plan first.","code":"conflict","server":${r.server ? planText(r.server) : "null"}}`, 409);
  });
}
