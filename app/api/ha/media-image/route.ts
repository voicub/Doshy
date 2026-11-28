import { haFailure, haFor, resolveHa } from "@/lib/haServer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ENTITY = /^media_player\.[a-z0-9_]+$/;
const PICTURE = /^\/api\/(media_player_proxy|image_proxy)\/[A-Za-z0-9_.\-]+(\?[A-Za-z0-9_.\-=&%]*)?$/;

/** Artwork of a media_player, fetched with the server's token. Only HA's own proxy paths are followed. The home comes from `?home=` too: an <img> cannot send the header. */
export async function GET(req: Request) {
  const entity = new URL(req.url).searchParams.get("entity") ?? "";
  if (!ENTITY.test(entity)) return Response.json({ error: "invalid entity" }, { status: 400 });
  try {
    const fetchHa = haFor(resolveHa(req, { fromQuery: true }));
    const st = await fetchHa(`states/${entity}`);
    if (!st.ok) return new Response(null, { status: 404 });
    const body: unknown = await st.json();
    const attrs = body && typeof body === "object" && "attributes" in body && body.attributes && typeof body.attributes === "object" ? body.attributes : {};
    const picture = "entity_picture" in attrs ? attrs.entity_picture : undefined;
    if (typeof picture !== "string" || !PICTURE.test(picture)) return new Response(null, { status: 404 });
    const img = await fetchHa(picture.slice("/api/".length));
    if (!img.ok || !img.body) return new Response(null, { status: 404 });
    const type = img.headers.get("content-type") ?? "";
    if (!type.startsWith("image/")) return new Response(null, { status: 404 });
    return new Response(img.body, { headers: { "Content-Type": type, "Cache-Control": "private, max-age=30" } });
  } catch (e) {
    return haFailure(e);
  }
}
