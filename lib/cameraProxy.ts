import { createHash } from "node:crypto";

// Pure parts of GET /api/ha/camera (a read-only snapshot proxy): what to accept, how often, how much. No I/O except hashing.

export const CAMERA_ENTITY = /^camera\.[a-z0-9_]+$/;
/** HA answers with a still image; anything else (or anything bigger) is refused. */
export const IMAGE_TYPE = /^image\/(jpeg|png|webp|gif)(;|$)/i;
export const MAX_BYTES = 4 * 1024 * 1024;
export const TIMEOUT_MS = 8000;
/** One snapshot of one camera per this long, however many tabs ask. */
export const MIN_GAP_MS = 800;
/** All cameras together. */
export const MAX_PER_MINUTE = 120;
const MINUTE = 60_000;
const MAX_TRACKED = 256;

type Verdict = { ok: true } | { ok: false; retryAfter: number };

/** In-memory rate limiter: a minimum gap per camera and a ceiling per minute overall. `retryAfter` is in whole seconds. */
export function makeLimiter(now: () => number = Date.now) {
  const last = new Map<string, number>();
  let recent: number[] = [];
  return (entity: string): Verdict => {
    const t = now();
    recent = recent.filter((x) => t - x < MINUTE);
    const gap = t - (last.get(entity) ?? -Infinity);
    if (gap < MIN_GAP_MS) return { ok: false, retryAfter: Math.max(1, Math.ceil((MIN_GAP_MS - gap) / 1000)) };
    if (recent.length >= MAX_PER_MINUTE) return { ok: false, retryAfter: Math.max(1, Math.ceil((MINUTE - (t - recent[0])) / 1000)) };
    if (last.size >= MAX_TRACKED) for (const [k, v] of last) if (t - v > MINUTE) last.delete(k);
    last.set(entity, t);
    recent.push(t);
    return { ok: true };
  };
}

/** Strong validator for a snapshot: equal pictures, equal tag (so an unchanged still costs the browser no download). */
export const etagOf = (bytes: Uint8Array) => `"${createHash("sha1").update(bytes).digest("base64url")}"`;
