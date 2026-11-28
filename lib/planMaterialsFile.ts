// The Poly Haven textures inside a plan file (`materials`: for each texture id its name and its one file as base64), so a plan exported on one install shows its textured
// floors, walls and ground on another. Same idea and shape as lib/planFloorPhotoFile.ts. This is the checking; reading and writing the bytes is components/ui/materialFileIO.ts.
// A block is only trusted after it is opened as a texture file (lib/polyhavenMaterial.ts) AND its bytes hash to the id the plan names: a file cannot make one id stand for other
// pictures. Pure; the node test runner loads this file directly (.ts imports).
import { isRecord } from "./guards.ts";
import { materialIds } from "./planMaterials.ts";
import { PH_LIMITS } from "./polyhaven.ts";
import { readMaterial } from "./polyhavenMaterial.ts";
import { sha256Hex } from "./sha256.ts";
import type { Plan } from "./types.ts";

/** The server refuses a texture file over its cap; as base64 that is a third longer. */
export const MAX_MATERIAL_B64 = Math.ceil(PH_LIMITS.materialBytes / 3) * 4;

const BASE64 = /^[A-Za-z0-9+/]+={0,2}$/;

export type MaterialBlock = { name: string; b64: string };
/** What goes in a plan file: one block per texture the plan uses, by resource id. */
export type MaterialBlocks = Record<string, MaterialBlock>;

/** Plain words for the person importing, when a texture could not be brought along. The plan itself still loads, those surfaces with their plain look. */
export const MATERIAL_NOTES = {
  missing: "A Poly Haven texture used by this plan was not in the file, so those floors, walls or ground opened with their plain look.",
  failed: "A Poly Haven texture could not be saved on this server, so those floors, walls or ground opened with their plain look.",
} as const;

/** What is put back on the server for one texture: its bytes and the details its file carries. */
export type FoundMaterial = { id: string; bytes: Uint8Array<ArrayBuffer>; name: string; meta: { asset: string; name: string; authors: string[] } };

/** The block for a stored texture file, or null when the bytes are not a texture file. `name` is only to make the plan file readable. */
export function materialBlock(b64: string, bytes: Uint8Array): MaterialBlock | null {
  const read = readMaterial(bytes);
  return read ? { name: read.info.name, b64 } : null;
}

/** One block of a plan file for resource `id`, checked: base64 within the cap, a readable texture file, and bytes whose SHA-256 is the id. Null for anything else. */
export function readMaterialBlock(id: string, block: unknown): FoundMaterial | null {
  if (!isRecord(block) || typeof block.b64 !== "string") return null;
  const b64 = block.b64;
  if (b64.length === 0 || b64.length > MAX_MATERIAL_B64 || b64.length % 4 !== 0 || !BASE64.test(b64)) return null;
  const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  if (bytes.length > PH_LIMITS.materialBytes || `mat-${sha256Hex(bytes).slice(0, 24)}` !== id) return null;
  const read = readMaterial(bytes);
  if (!read) return null;
  const { asset, name, authors } = read.info;
  return { id, bytes, name, meta: { asset, name, authors } };
}

/**
 * The textures to put back for a plan file: only ids the plan itself uses (a file cannot smuggle in other resources), each block checked. An id the plan uses but the file has
 * no good block for is in `missing`.
 */
export function readMaterials(blocks: unknown, plan: Pick<Plan, "rooms" | "walls" | "ground" | "paths">): { found: FoundMaterial[]; missing: string[] } {
  const found: FoundMaterial[] = [];
  const missing: string[] = [];
  for (const id of materialIds(plan)) {
    const ok = isRecord(blocks) && Object.hasOwn(blocks, id) ? readMaterialBlock(id, blocks[id]) : null;
    if (ok) found.push(ok);
    else missing.push(id);
  }
  return { found, missing };
}
