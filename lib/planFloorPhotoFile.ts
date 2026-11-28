// The floor photo textures inside a plan file (`floorPhotos`: for each texture id its type and bytes as base64), so a plan exported on one install shows its photo floors
// on another. Same idea as the floor plan picture (lib/planTraceFile.ts). This is the checking; reading and writing the bytes is components/ui/floorPhotoFileIO.ts. Pure.
// The node test runner loads this file directly: .ts import extensions.
import { MAX_FLOOR_PHOTO_BYTES, floorPhotoIds } from "./floorPhoto.ts";
import { isRecord } from "./guards.ts";
import type { Plan } from "./types.ts";

/** What the resource store accepts for a floor texture (lib/db/resources.ts). */
export const FLOOR_PHOTO_MIMES = ["image/webp", "image/png"] as const;
export type FloorPhotoMime = (typeof FLOOR_PHOTO_MIMES)[number];
/** The server refuses a texture over its cap; as base64 that is a third longer. */
export const MAX_FLOOR_PHOTO_B64 = Math.ceil(MAX_FLOOR_PHOTO_BYTES / 3) * 4;

const BASE64 = /^[A-Za-z0-9+/]+={0,2}$/;

export type FloorPhotoBlock = { mime: FloorPhotoMime; b64: string };
/** What goes in a plan file: one block per texture the plan's rooms use, by texture id. */
export type FloorPhotoBlocks = Record<string, FloorPhotoBlock>;

/** Plain words for the person importing, when a floor photo could not be brought along. The plan itself still loads, those rooms with their plain floor. */
export const FLOOR_PHOTO_NOTES = {
  missing: "A floor photo used by this plan was not in the file, so those rooms opened with their plain floor.",
  failed: "A floor photo could not be saved on this server, so those rooms opened with their plain floor.",
} as const;

/** The image type of a `content-type` header (parameters and case ignored), or null when it is not one a floor texture can be. */
export function floorPhotoMimeOf(header: string | null | undefined): FloorPhotoMime | null {
  const base = header?.split(";")[0].trim().toLowerCase();
  return FLOOR_PHOTO_MIMES.find((m) => m === base) ?? null;
}

/** One block of a plan file, checked: its type is one we store, the bytes are base64 and not over the cap. Null for anything else. */
export function readFloorPhotoBlock(block: unknown): FloorPhotoBlock | null {
  if (!isRecord(block)) return null;
  const mime = floorPhotoMimeOf(typeof block.mime === "string" ? block.mime : null);
  const b64 = block.b64;
  if (!mime || typeof b64 !== "string" || b64.length === 0 || b64.length > MAX_FLOOR_PHOTO_B64 || b64.length % 4 !== 0 || !BASE64.test(b64)) return null;
  return { mime, b64 };
}

/**
 * The textures to put back for a plan file's rooms: only ids the plan itself uses (a file cannot smuggle in other resources), each id a safe resource id, each block
 * checked. An id the plan uses but the file has no good block for is in `missing`.
 */
export function readFloorPhotos(blocks: unknown, plan: Pick<Plan, "rooms">): { found: ({ id: string } & FloorPhotoBlock)[]; missing: string[] } {
  const found: ({ id: string } & FloorPhotoBlock)[] = [];
  const missing: string[] = [];
  for (const id of floorPhotoIds(plan)) {
    const block = isRecord(blocks) && Object.hasOwn(blocks, id) ? readFloorPhotoBlock(blocks[id]) : null;
    if (block) found.push({ id, ...block });
    else missing.push(id);
  }
  return { found, missing };
}
