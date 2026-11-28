// The floor plan image inside a plan file (`traceImage`: its type and bytes as base64), so a plan exported on one install shows its underlay on another.
// This is the checking; reading and writing the bytes is components/ui/planIO.ts. Pure. The node test runner loads this file directly: .ts import extensions.
import { isRecord } from "./guards.ts";
import { sanitizeTrace } from "./trace.ts";

/** What the resource store accepts for an image (lib/db/resources.ts), which is also what the editor stores. */
export const TRACE_MIMES = ["image/png", "image/jpeg", "image/webp", "image/gif"] as const;
export type TraceMime = (typeof TRACE_MIMES)[number];
/** The server refuses a file over 25 MB; as base64 that is a third longer. */
export const MAX_TRACE_B64 = Math.ceil((25 * 1024 * 1024) / 3) * 4;

const BASE64 = /^[A-Za-z0-9+/]+={0,2}$/;

export type TraceImageBlock = { mime: TraceMime; b64: string };

/** Plain words for the person importing, when the plan's picture could not be brought along. The plan itself still loads, without the picture. */
export const TRACE_NOTES = {
  missing: "The floor plan picture under this plan was not in the file, so the plan opened without it.",
  failed: "The floor plan picture could not be saved on this server, so the plan opened without it.",
} as const;

/** The image type of a `content-type` header (parameters and case ignored), or null when it is not one a trace image can be. */
export function traceMimeOf(header: string | null | undefined): TraceMime | null {
  const base = header?.split(";")[0].trim().toLowerCase();
  return TRACE_MIMES.find((m) => m === base) ?? null;
}

/**
 * The picture to put back for a plan file's `trace`: its stored id (always the plan's own `trace.resourceId`, which is a safe resource id, and
 * is `trace-` + 24 hex digits when the editor made it) and the checked block. Null when the plan has no usable trace or the block is not a picture.
 */
export function readTraceImage(block: unknown, trace: unknown): ({ id: string } & TraceImageBlock) | null {
  const t = sanitizeTrace(trace);
  if (!t || !isRecord(block)) return null;
  const mime = traceMimeOf(typeof block.mime === "string" ? block.mime : null);
  const b64 = block.b64;
  if (!mime || typeof b64 !== "string" || b64.length === 0 || b64.length > MAX_TRACE_B64 || b64.length % 4 !== 0 || !BASE64.test(b64)) return null;
  return { id: t.resourceId, mime, b64 };
}
