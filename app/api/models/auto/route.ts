import { isRecord } from "@/lib/guards";
import { autoImport, fail, failureResponse, isUid, needsToken, tokenBucket } from "@/lib/modelLibrary";
import { bytesResponse } from "@/lib/server/bytesResponse";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const take = tokenBucket(12);

/** Downloads the best matching real model for a catalogue car (needs SKETCHFAB_TOKEN). Body `{ carId, skip?: uid[], heavy? }`; replies the glb with its attribution in `x-housey-model`. */
export async function POST(request: Request) {
  const token = process.env.SKETCHFAB_TOKEN;
  if (!token) return failureResponse(needsToken());
  if (!take()) return failureResponse(fail("rate_limited", "Too many automatic searches. Try again in a minute."));
  const sent: unknown = await request.json().catch(() => null);
  const { carId, skip, heavy }: Record<string, unknown> = isRecord(sent) ? sent : {};
  if (typeof carId !== "string" || !/^car_[a-z0-9_]+$/.test(carId)) return failureResponse(fail("bad_request", "That car is not in the catalogue."));
  if (skip !== undefined && (!Array.isArray(skip) || skip.length > 20 || !skip.every(isUid))) return failureResponse(fail("bad_request", "That list of models to skip does not look right."));
  const r = await autoImport(carId, { fetch, token }, { heavy: heavy === true, skip });
  if ("error" in r) return failureResponse(r);
  return bytesResponse(r.glb, { headers: { "Content-Type": "application/octet-stream", "Content-Length": String(r.glb.byteLength), "x-housey-model": r.header, "Cache-Control": "no-store" } });
}
