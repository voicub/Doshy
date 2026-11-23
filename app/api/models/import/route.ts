import { failureResponse, fail, importModel, tokenBucket } from "@/lib/modelLibrary";
import { bytesResponse } from "@/lib/server/bytesResponse";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const take = tokenBucket(6);

/** Downloads one Sketchfab model by uid. Body `{ uid }`; replies the glb with its attribution in `x-housey-model`. */
export async function POST(request: Request) {
  if (!take()) return failureResponse(fail("rate_limited", "Too many downloads. Try again in a minute."));
  const body: unknown = await request.json().catch(() => null);
  const uid = body && typeof body === "object" && "uid" in body ? body.uid : undefined;
  const r = await importModel(typeof uid === "string" ? uid : "", { fetch, token: process.env.SKETCHFAB_TOKEN });
  if ("error" in r) return failureResponse(r);
  return bytesResponse(r.glb, { headers: { "Content-Type": "application/octet-stream", "Content-Length": String(r.glb.byteLength), "x-housey-model": r.header, "Cache-Control": "no-store" } });
}
