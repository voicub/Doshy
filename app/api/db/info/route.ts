import { api, reply } from "@/lib/db/http";
import { dbInfo } from "@/lib/db/info";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Numbers for the Data panel (see `DbInfo`). Also answers "is the database reachable?". */
export function GET(req: Request) {
  return api(req, {}, (db) => reply(dbInfo(db)));
}
