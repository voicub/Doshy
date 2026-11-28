import { getThumb, MAX_THUMB_BYTES, parseDashboardId, setThumb } from "@/lib/db/dashboards";
import { HttpError } from "@/lib/db/errors";
import { api, contentType, readBody, reply } from "@/lib/db/http";
import { bytesResponse } from "@/lib/server/bytesResponse";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/**
 * The plan's thumbnail (WebP). `?v=<thumbRev>` (from the list) pins the URL to that exact image, so it may be cached for a year; without it the
 * browser revalidates. 404 when the plan has no thumbnail yet (the UI shows an icon tile).
 */
export function GET(req: Request, ctx: Ctx) {
  return api(req, {}, async (db) => {
    const thumb = getThumb(db, parseDashboardId((await ctx.params).id));
    if (!thumb) throw new HttpError(404, "not_found", "This plan has no thumbnail yet.");
    const pinned = new URL(req.url).searchParams.get("v") === String(thumb.rev);
    return bytesResponse(thumb.data, { headers: { "content-type": "image/webp", "cache-control": pinned ? "private, max-age=31536000, immutable" : "private, no-cache", "x-content-type-options": "nosniff" } });
  });
}

/** Body: the WebP bytes (at most 64 KB, sent as image/webp). `{ thumbRev }`. */
export function PUT(req: Request, ctx: Ctx) {
  return api(req, { write: true }, async (db) => {
    const id = parseDashboardId((await ctx.params).id);
    contentType(req, ["image/webp"]);
    return reply({ thumbRev: setThumb(db, id, await readBody(req, MAX_THUMB_BYTES + 1)) });
  });
}
