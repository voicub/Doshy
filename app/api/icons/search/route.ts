import { searchTerm } from "@/lib/mdi";
import { MAX_SEARCH } from "@/lib/server/mdiIcons";
import { failure, gate, mdiIcons, noStore } from "@/lib/server/mdiService";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Search the icons: `GET /api/icons/search?q=lamp&limit=48` gives `{ names: ["lamp", "desk-lamp", ...] }`, best first. The drawings come from /api/icons/mdi. */
export async function GET(req: Request) {
  const refused = gate(req);
  if (refused) return refused;
  const p = new URL(req.url).searchParams;
  const term = searchTerm(p.get("q"));
  if (!term) return Response.json({ error: "Type at least two letters to search." }, { status: 400, headers: noStore });
  const limit = Math.min(MAX_SEARCH, Math.max(1, Math.floor(Number(p.get("limit")) || 48)));
  try {
    return Response.json({ names: await mdiIcons.search(term, limit) }, { headers: { "cache-control": "private, max-age=3600" } });
  } catch (e) {
    return failure(e);
  }
}
