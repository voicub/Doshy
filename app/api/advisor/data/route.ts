import { api, reply } from "@/lib/db/http";
import { haFetchFor } from "@/lib/haServer";
import { advisorQueryPlace, createAdvisorDataService } from "@/lib/server/advisorData";
import { advisorSettings, advisorToken } from "@/lib/server/advisorSettings";
import { externalDataEnabled } from "@/lib/server/externalData";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const load = createAdvisorDataService(fetch);
export async function GET(req: Request) {
  return api(req, {}, async (db) => reply(await load(advisorSettings(db).settings, haFetchFor(req), advisorToken(db), { external: externalDataEnabled(), forecastService: process.env.NODE_ENV === "production", place: advisorQueryPlace(new URL(req.url).searchParams) })));
}
