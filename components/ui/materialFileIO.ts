import { fetchResourceFile, fetchResources, putResource } from "@/lib/dbApi";
import { toBase64 } from "@/lib/modelStore";
import type { PlanFileParts } from "@/lib/planFile";
import { materialIds, withoutMaterials } from "@/lib/planMaterials";
import { MATERIAL_NOTES, materialBlock, readMaterials, type MaterialBlocks } from "@/lib/planMaterialsFile";
import type { Plan } from "@/lib/types";

/** The Poly Haven textures the plan uses, for its file; null when it uses none. A texture the server cannot give now is left out (the file is still a good plan; opening it says the texture is missing). */
export async function materialsFor(plan: Plan): Promise<MaterialBlocks | null> {
  const blocks: MaterialBlocks = {};
  for (const id of materialIds(plan)) {
    try {
      const file = await fetchResourceFile(id);
      const block = file && materialBlock(toBase64(file.buf), new Uint8Array(file.buf));
      if (block) blocks[id] = block;
    } catch {
      /* this one is left out; the others still go in */
    }
  }
  return Object.keys(blocks).length ? blocks : null;
}

/**
 * A plan file's plan with its textures put back on this server (a texture already here is never overwritten). A texture that cannot be restored is taken off its
 * surfaces and `note` says why in plain words: the plan must still load.
 */
export async function restoreMaterials(parts: PlanFileParts): Promise<{ plan: Plan; note: string | null }> {
  if (!materialIds(parts.plan).length) return { plan: parts.plan, note: null };
  const { found, missing } = readMaterials(parts.materials, parts.plan);
  const lost = [...missing];
  let note: string | null = missing.length ? MATERIAL_NOTES.missing : null;
  try {
    const have = new Set((await fetchResources("material")).resources.map((r) => r.id));
    for (const f of found) {
      if (have.has(f.id)) continue;
      try {
        await putResource({ id: f.id, kind: "material", mime: "application/octet-stream", name: f.name, meta: f.meta }, f.bytes);
      } catch {
        lost.push(f.id);
        note = MATERIAL_NOTES.failed;
      }
    }
  } catch {
    lost.push(...found.map((f) => f.id)); // the server could not even be asked
    note = MATERIAL_NOTES.failed;
  }
  return { plan: withoutMaterials(parts.plan, lost), note };
}
