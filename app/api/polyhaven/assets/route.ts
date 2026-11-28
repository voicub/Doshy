import { failure, gate, noStore, polyHaven } from "@/lib/server/polyhavenService";
import { isPhType, MAX_QUERY_CHARS, PH_FILTERS, queryItems } from "@/lib/polyhaven";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * One page of Poly Haven's listing: `GET /api/polyhaven/assets?t=hdris|textures|models&q=&f=<chip id>&page=0&limit=48`. The full listing (about 1 MB a type) is
 * fetched at most every 6 hours by the server and searched here, so the browser only ever receives a page. Answers `{ items, total, page, limit }`.
 */
export async function GET(req: Request) {
  const refused = gate(req);
  if (refused) return refused;
  const p = new URL(req.url).searchParams;
  const type = p.get("t");
  if (!isPhType(type)) return Response.json({ error: "Say which kind of asset: hdris, textures or models." }, { status: 400, headers: noStore });
  const q = p.get("q") ?? "";
  const filter = p.get("f") ?? undefined;
  if (q.length > MAX_QUERY_CHARS || (filter !== undefined && !PH_FILTERS[type].some((f) => f.id === filter))) return Response.json({ error: "That search is not valid." }, { status: 400, headers: noStore });
  const page = Number(p.get("page") ?? 0);
  const limit = Number(p.get("limit") ?? 48);
  if (!Number.isFinite(page) || !Number.isFinite(limit)) return Response.json({ error: "That page is not valid." }, { status: 400, headers: noStore });
  try {
    return Response.json(queryItems(await polyHaven.list(type), type, { q, filter, page, limit }), { headers: noStore });
  } catch (e) {
    return failure(e);
  }
}
