// The browser's half of "use a Poly Haven texture": fetch the chosen texture through this server, keep it as a resource and make the plan's reference to it. The reference
// carries the colour Eco and Light draw instead of the picture, worked out ONCE here (the stored file is never decoded again for it). Browser module (canvas, fetch);
// the maths it uses is tested (lib/floorPhotoPixels.ts `averageColour`, lib/planMaterials.ts `initialScaleM`).
import { fetchResources } from "./dbApi";
import { averageColour } from "./floorPhotoPixels";
import { MATERIAL_DEFAULT_AVG, type MaterialRef } from "./materialRef";
import { initialScaleM } from "./planMaterials";
import type { PhItem } from "./polyhaven";
import { downloadAsset, keepAsResource } from "./polyhavenClient";
import { readMaterial } from "./polyhavenMaterial";

/** The colour picture is shrunk to this many pixels a side before it is averaged: a 1k JPEG averaged pixel by pixel costs a megapixel loop for the same colour. */
const SAMPLE = 16;

/** The average colour of the colour picture ("#rrggbb"), or the neutral grey when this browser cannot decode it (the texture still works; only Eco and Light look plainer). */
async function averageOf(jpeg: Uint8Array): Promise<string> {
  try {
    const bitmap = await createImageBitmap(new Blob([jpeg.slice()], { type: "image/jpeg" }));
    try {
      const canvas = document.createElement("canvas");
      canvas.width = SAMPLE;
      canvas.height = SAMPLE;
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      if (!ctx) return MATERIAL_DEFAULT_AVG;
      ctx.drawImage(bitmap, 0, 0, SAMPLE, SAMPLE);
      const { data } = ctx.getImageData(0, 0, SAMPLE, SAMPLE);
      canvas.width = 0; // free the pixels now
      return averageColour({ data, w: SAMPLE, h: SAMPLE });
    } finally {
      bitmap.close();
    }
  } catch {
    return MATERIAL_DEFAULT_AVG;
  }
}

const names = new Map<string, string>();
let loading: Promise<void> | null = null;

/** The name a stored texture was kept under (for the inspector), or null when the server has no such texture. One list is fetched and remembered. */
export async function materialNameOf(resourceId: string): Promise<string | null> {
  if (!names.has(resourceId)) {
    loading ??= fetchResources("material")
      .then((r) => r.resources.forEach((x) => names.set(x.id, x.name)))
      .catch(() => undefined)
      .finally(() => {
        loading = null;
      });
    await loading;
  }
  return names.get(resourceId) ?? null;
}

/**
 * Downloads `item`'s texture, keeps it as a resource (the same texture is stored once) and returns the reference to wear: its real size from the file (else the listing's, else
 * 1 m), no turn, and the average colour. Throws a plain sentence when the download or the file fails (the browse dialog shows it).
 */
export async function useTexture(item: PhItem): Promise<MaterialRef> {
  const bytes = await downloadAsset("material", item.id);
  const read = readMaterial(new Uint8Array(bytes));
  if (!read) throw new Error("Poly Haven sent a texture this app could not read.");
  const resourceId = await keepAsResource("material", item, bytes);
  names.set(resourceId, read.info.name);
  return { resourceId, scaleM: initialScaleM(read.info.scaleM, item.dims), rotation: 0, avg: await averageOf(read.maps.diff) };
}
