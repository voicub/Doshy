import { bytesResponse } from "@/lib/server/bytesResponse";
import { failure, gate, polyHaven } from "@/lib/server/polyhavenService";
import { isAssetId } from "@/lib/polyhaven";
import { sniffImage } from "@/lib/siteTiles";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** A small preview picture: `GET /api/polyhaven/thumb?id=&w=128|256&v=<picture version>`. Kept on disk; with `v` the browser may keep it for a year (a new picture has a new `v`). */
export async function GET(req: Request) {
  const refused = gate(req);
  if (refused) return refused;
  const p = new URL(req.url).searchParams;
  const id = p.get("id");
  const v = p.get("v") ?? undefined;
  const w = p.get("w") === "128" ? 128 : 256;
  if (!isAssetId(id) || (v !== undefined && !/^[a-f0-9]{4,16}$/.test(v))) return Response.json({ error: "That is not a Poly Haven picture." }, { status: 400, headers: { "cache-control": "no-store" } });
  try {
    const bytes = await polyHaven.thumb(id, w, v);
    return bytesResponse(bytes, {
      headers: { "content-type": sniffImage(bytes) ?? "image/webp", "cache-control": v ? "public, max-age=31536000, immutable" : "public, max-age=86400", "x-content-type-options": "nosniff" },
    });
  } catch (e) {
    return failure(e);
  }
}
