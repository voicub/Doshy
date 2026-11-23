import { api, reply } from "@/lib/db/http";
import { deleteResource, getResource, getResourceInfo } from "@/lib/db/resources";
import { HttpError } from "@/lib/db/errors";
import { bytesResponse } from "@/lib/server/bytesResponse";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

const notHere = () => new HttpError(404, "not_found", "That file is not here.");

/**
 * The file itself, with its stored type. The ETag is the content hash. `?h=<hash>` (from the list) pins the URL to those exact contents, so the reply
 * may be cached for a year; without it the browser revalidates each time (a 304 costs nothing: the contents are only read when they are sent).
 */
export function GET(req: Request, ctx: Ctx) {
  return api(req, {}, async (db) => {
    const id = (await ctx.params).id;
    const pin = new URL(req.url).searchParams.get("h");
    const headersFor = (hash: string) => ({
      etag: `"${hash}"`,
      "cache-control": pin === hash ? "private, max-age=31536000, immutable" : "private, no-cache",
      "x-content-type-options": "nosniff",
      "content-security-policy": "sandbox; default-src 'none'", // an uploaded file is data, never a page
    });
    const known = getResourceInfo(db, id);
    if (!known) throw notHere();
    if (req.headers.get("if-none-match") === `"${known.hash}"`) return new Response(null, { status: 304, headers: headersFor(known.hash) });
    const r = getResource(db, id);
    if (!r) throw notHere(); // deleted since the look above
    return bytesResponse(r.data, { headers: { ...headersFor(r.info.hash), "content-type": r.info.mime, "content-length": String(r.info.size) } });
  });
}

export function DELETE(req: Request, ctx: Ctx) {
  return api(req, { write: true }, async (db) => {
    if (!deleteResource(db, (await ctx.params).id)) throw notHere();
    return reply({ ok: true });
  });
}
