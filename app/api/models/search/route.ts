import { fail, failureResponse, searchModels, tokenBucket } from "@/lib/modelLibrary";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const take = tokenBucket(60);

/** Searches Sketchfab for downloadable models: `?q=&cursor=&heavy=1`. */
export async function GET(request: Request) {
  if (!take()) return failureResponse(fail("rate_limited", "Too many searches. Try again in a minute."));
  const sp = new URL(request.url).searchParams;
  const r = await searchModels({ q: sp.get("q") ?? "", cursor: sp.get("cursor") ?? undefined, heavy: sp.get("heavy") === "1" }, { fetch, token: process.env.SKETCHFAB_TOKEN });
  if ("error" in r) return failureResponse(r);
  return Response.json(r, { headers: { "Cache-Control": "no-store" } });
}
