import { fetchResourceFile, fetchResources, putResource } from "@/lib/dbApi";
import { floorPhotoIds, withoutFloorPhotos } from "@/lib/floorPhoto";
import { fromBase64, toBase64 } from "@/lib/modelStore";
import type { PlanFileParts } from "@/lib/planFile";
import { FLOOR_PHOTO_NOTES, floorPhotoMimeOf, readFloorPhotos, type FloorPhotoBlocks } from "@/lib/planFloorPhotoFile";
import type { Plan } from "@/lib/types";

/** The textures the plan's rooms use, for its file; null when it uses none. A texture the server cannot give now is left out (the file is still a good plan; opening it says the photo is missing). */
export async function floorPhotosFor(plan: Plan): Promise<FloorPhotoBlocks | null> {
  const blocks: FloorPhotoBlocks = {};
  for (const id of floorPhotoIds(plan)) {
    try {
      const file = await fetchResourceFile(id);
      const mime = file && floorPhotoMimeOf(file.mime);
      if (file && mime) blocks[id] = { mime, b64: toBase64(file.buf) };
    } catch {
      /* this one is left out; the others still go in */
    }
  }
  return Object.keys(blocks).length ? blocks : null;
}

/**
 * A plan file's plan with its floor photos put back on this server (a texture already here is never overwritten). A photo that cannot be restored is taken off its
 * rooms and `note` says why in plain words: the plan must still load.
 */
export async function restoreFloorPhotos(parts: PlanFileParts): Promise<{ plan: Plan; note: string | null }> {
  const used = floorPhotoIds(parts.plan);
  if (!used.length) return { plan: parts.plan, note: null };
  const { found, missing } = readFloorPhotos(parts.floorPhotos, parts.plan);
  const lost = [...missing];
  let note: string | null = missing.length ? FLOOR_PHOTO_NOTES.missing : null;
  try {
    const have = new Set((await fetchResources("floor-photo")).resources.map((r) => r.id));
    for (const f of found) {
      if (have.has(f.id)) continue;
      try {
        await putResource({ id: f.id, kind: "floor-photo", mime: f.mime, name: "Floor photo", meta: { use: "floor-photo" } }, fromBase64(f.b64));
      } catch {
        lost.push(f.id);
        note = FLOOR_PHOTO_NOTES.failed;
      }
    }
  } catch {
    lost.push(...found.map((f) => f.id)); // the server could not even be asked
    note = FLOOR_PHOTO_NOTES.failed;
  }
  return { plan: withoutFloorPhotos(parts.plan, lost), note };
}
