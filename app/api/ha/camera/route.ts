import { CAMERA_ENTITY, IMAGE_TYPE, MAX_BYTES, TIMEOUT_MS, etagOf, makeLimiter } from "@/lib/cameraProxy";
import { readCapped } from "@/lib/server/readCapped";
import { bytesResponse } from "@/lib/server/bytesResponse";
import { ha } from "@/lib/haServer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const limit = makeLimiter();
// Cameras are private: no disk cache anywhere on the way, nothing sniffed into another type, never embedded by another origin.
const PRIVATE = { "Cache-Control": "no-store, private", Pragma: "no-cache", "X-Content-Type-Options": "nosniff", "Cross-Origin-Resource-Policy": "same-origin" };

/**
 * One still of a camera, fetched with the server's token (the token never reaches the browser). GET only: this route cannot move or control a camera.
 * Rate limited; answers 304 when the picture has not changed since the browser's `If-None-Match`.
 */
export async function GET(req: Request) {
  const entity = new URL(req.url).searchParams.get("entity") ?? "";
  if (!CAMERA_ENTITY.test(entity)) return Response.json({ error: "invalid entity" }, { status: 400, headers: PRIVATE });
  const gate = limit(entity);
  if (!gate.ok) return Response.json({ error: "too many requests" }, { status: 429, headers: { ...PRIVATE, "Retry-After": String(gate.retryAfter) } });
  try {
    const res = await ha(`camera_proxy/${entity}`, { signal: AbortSignal.timeout(TIMEOUT_MS) });
    const type = res.headers.get("content-type") ?? "";
    if (!res.ok || !res.body || !IMAGE_TYPE.test(type)) return new Response(null, { status: 404, headers: PRIVATE });
    const length = Number(res.headers.get("content-length") ?? 0);
    const bytes = length > MAX_BYTES ? null : await readCapped(res.body, MAX_BYTES, length);
    if (!bytes) return Response.json({ error: "picture too large" }, { status: 502, headers: PRIVATE });
    const etag = etagOf(bytes);
    const headers = { ...PRIVATE, ETag: etag, "Content-Type": type.split(";")[0] };
    if (req.headers.get("if-none-match") === etag) return new Response(null, { status: 304, headers });
    return bytesResponse(bytes, { headers });
  } catch {
    // never echo the upstream error: it can carry the Home Assistant address
    return Response.json({ error: "camera unavailable" }, { status: 502, headers: PRIVATE });
  }
}
