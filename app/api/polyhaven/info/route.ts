import { failure, gate, noStore, polyHaven } from "@/lib/server/polyhavenService";
import { creditLine, isAssetId, isPhType } from "@/lib/polyhaven";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** One asset's details and its credit line: `GET /api/polyhaven/info?t=models&id=ArmChair_01`. Answers `{ item, credit }`; 404 for an id Poly Haven does not list. */
export async function GET(req: Request) {
  const refused = gate(req);
  if (refused) return refused;
  const p = new URL(req.url).searchParams;
  const type = p.get("t");
  const id = p.get("id");
  if (!isPhType(type) || !isAssetId(id)) return Response.json({ error: "That is not a Poly Haven asset." }, { status: 400, headers: noStore });
  try {
    const item = await polyHaven.item(type, id);
    if (!item) return Response.json({ error: "Poly Haven does not have that asset." }, { status: 404, headers: noStore });
    return Response.json({ item, credit: creditLine(item) }, { headers: noStore });
  } catch (e) {
    return failure(e);
  }
}
