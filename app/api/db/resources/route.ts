import { api, contentType, readBody, reply } from "@/lib/db/http";
import { listResources, MAX_FLOOR_PHOTO_BYTES, MAX_META_BYTES, MAX_RESOURCE_BYTES, putResource, resourceTotals } from "@/lib/db/resources";
import { badRequest } from "@/lib/db/validate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Resources without their contents, newest first: `{ resources, totals }`. `?kind=model|piece|image|city|floor-photo` filters; `?kind=piece&inline=1` adds each piece's parsed JSON as `json`. */
export function GET(req: Request) {
  return api(req, {}, (db) => {
    const q = new URL(req.url).searchParams;
    const kind = q.get("kind") ?? undefined;
    return reply({ resources: listResources(db, { kind, inline: q.get("inline") === "1" }), totals: resourceTotals(db) });
  });
}

/**
 * Store a file. The body is the file itself, sent with its own type (`model/gltf-binary`, `application/json` for a piece, `image/png`...).
 * Query: `id`, `kind`, `name?`, `meta?` (a small JSON object). The same contents under another id are stored once. 201 `{ resource }`.
 */
export function POST(req: Request) {
  return api(req, { write: true }, async (db) => {
    const q = new URL(req.url).searchParams;
    const id = q.get("id");
    const kind = q.get("kind");
    if (!id || !kind) throw badRequest("Say which resource this is (id and kind).");
    const rawMeta = q.get("meta");
    let meta: unknown;
    try {
      meta = rawMeta && rawMeta.length <= MAX_META_BYTES ? JSON.parse(rawMeta) : undefined;
    } catch {
      throw badRequest("The details sent with the file are not valid.");
    }
    const mime = contentType(req, ["model/gltf-binary", "model/gltf+json", "application/octet-stream", "application/json", "image/png", "image/jpeg", "image/webp", "image/gif"]);
    const data = await readBody(req, kind === "floor-photo" ? MAX_FLOOR_PHOTO_BYTES : MAX_RESOURCE_BYTES); // a floor texture is small: stop reading a bigger body early
    return reply({ resource: putResource(db, { id, kind, name: q.get("name"), mime, meta, data }) }, 201);
  });
}
