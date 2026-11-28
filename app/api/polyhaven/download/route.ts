import { bytesResponse } from "@/lib/server/bytesResponse";
import { failure, gate, noStore, polyHaven } from "@/lib/server/polyhavenService";
import { isAssetId, type HdriRes } from "@/lib/polyhaven";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const KINDS = ["hdri", "material", "model"] as const;

/**
 * The file for one asset, fetched from Poly Haven by this server and kept on disk: `GET /api/polyhaven/download?kind=hdri|material|model&id=<asset id>[&res=1k|2k]`.
 * hdri: the Radiance `.hdr` (1k or 2k). material: Doshy's one-file texture (lib/polyhavenMaterial.ts, colour + roughness + normal at 1k). model: one `.glb` with its
 * pictures packed in (1k textures). The browser then stores it as a resource of its own, so it keeps working without Poly Haven.
 */
export async function GET(req: Request) {
  const refused = gate(req);
  if (refused) return refused;
  const p = new URL(req.url).searchParams;
  const kind = KINDS.find((k) => k === p.get("kind"));
  const id = p.get("id");
  const res: HdriRes | undefined = p.get("res") === "2k" ? "2k" : p.get("res") === "1k" || p.get("res") === null ? "1k" : undefined;
  if (!kind || !isAssetId(id) || !res) return Response.json({ error: "That download is not valid." }, { status: 400, headers: noStore });
  try {
    const { bytes, mime } = await polyHaven.download(kind, id, res);
    return bytesResponse(bytes, { headers: { "content-type": mime, "cache-control": "no-store", "x-content-type-options": "nosniff" } });
  } catch (e) {
    return failure(e);
  }
}
