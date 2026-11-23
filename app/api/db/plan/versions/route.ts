import { api, readJson, reply } from "@/lib/db/http";
import { listVersions, MAX_PLAN_BYTES, parseVersionBody, saveVersion, saveVersionOf } from "@/lib/db/plans";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Saved versions of the plan, newest first: `{ versions: [{ id, label, manual, rev, savedAt, changedAt, bytes, summary }] }`. An empty label means an automatic one. */
export function GET(req: Request) {
  return api(req, {}, (db) => reply({ versions: listVersions(db) }));
}

/** "Save version now". Body `{ label? }`. With `{ label, plan, format }` that plan (not the working one) is kept as the version. */
export function POST(req: Request) {
  return api(req, { write: true }, async (db) => {
    const { label, plan } = parseVersionBody(await readJson(req, MAX_PLAN_BYTES + 4096));
    return reply({ version: plan ? saveVersionOf(db, plan, label) : saveVersion(db, label) }, 201);
  });
}
