import { api, readJson, reply } from "@/lib/db/http";
import { advisorSettings, saveAdvisorSettings } from "@/lib/server/advisorSettings";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(req: Request) {
  return api(req, {}, (db) => reply(advisorSettings(db)));
}
export async function PUT(req: Request) {
  return api(req, { write: true }, async (db) => reply(saveAdvisorSettings(db, await readJson(req, 16_384))));
}
