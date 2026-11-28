import { DataTexture, LinearFilter, LinearMipmapLinearFilter, RGBAFormat, RepeatWrapping, SRGBColorSpace, UnsignedByteType, type Texture } from "three";
import { fetchResourceFile } from "@/lib/dbApi";
import { disposeLater } from "@/lib/disposeLater";
import { createNormalJob, estimateRoughness, type Pixels } from "@/lib/floorPhotoPixels";

// The textures of the floor photos (lib/floorPhoto.ts), one set per stored picture and tier size, shared by every room that wears it. Loading is lazy and in small steps:
// fetch, decode, one canvas draw at the tier's size, then the normal map in time slices (a few ms per timer tick), so no frame is held up. Sets are counted: the last
// room to leave frees them. Only Balanced and above ever get here; Eco and Light use the colour kept in the plan and never fetch the picture.

export type PhotoMaps = { map: Texture; normalMap?: Texture; roughness: number };

const SLICE_MS = 6; // work per timer tick
const TICK_MS = 10; // pause between ticks: the frame in between draws normally
const RELIEF = 2; // normal map strength (lib/floorPhotoPixels.ts createNormalJob): clearly visible grain and grout, never harsh
const ANISOTROPY = 8;

type Entry = { refs: number; maps: PhotoMaps | null; listeners: Set<(m: PhotoMaps) => void>; dead: boolean };
const cache = new Map<string, Entry>();

const pause = (ms = 0) => new Promise<void>((resolve) => setTimeout(resolve, ms));

function texture(data: Uint8ClampedArray | Uint8Array, size: number, colour: boolean): Texture {
  const t = new DataTexture(new Uint8Array(data.buffer, data.byteOffset, data.byteLength), size, size, RGBAFormat, UnsignedByteType);
  t.wrapS = t.wrapT = RepeatWrapping;
  t.magFilter = LinearFilter;
  t.minFilter = LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  t.anisotropy = ANISOTROPY;
  if (colour) t.colorSpace = SRGBColorSpace;
  t.needsUpdate = true;
  return t;
}

/** The stored picture drawn at `size` x `size`. Null when the server no longer has it or the browser cannot decode it. The bitmap and canvas are released before returning. */
async function pixelsOf(id: string, size: number): Promise<Pixels | null> {
  const file = await fetchResourceFile(id);
  if (!file) return null;
  const bmp = await createImageBitmap(new Blob([file.buf], { type: file.mime }));
  try {
    await pause();
    const canvas = document.createElement("canvas");
    [canvas.width, canvas.height] = [size, size];
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return null;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(bmp, 0, 0, size, size); // the stored texture is square: this is a plain scale to the tier's size
    const { data } = ctx.getImageData(0, 0, size, size);
    [canvas.width, canvas.height] = [0, 0];
    return { data, w: size, h: size };
  } finally {
    bmp.close();
  }
}

async function build(id: string, size: number, normal: boolean, entry: Entry): Promise<PhotoMaps | null> {
  const pixels = await pixelsOf(id, size);
  if (!pixels || entry.dead) return null;
  const roughness = estimateRoughness(pixels);
  let normalMap: Texture | undefined;
  if (normal) {
    const job = createNormalJob(pixels, RELIEF);
    while (job.run(SLICE_MS, () => performance.now())) {
      await pause(TICK_MS);
      if (entry.dead) return null;
    }
    normalMap = texture(job.data, size, false);
  }
  // texture rows run from v = 0 up, like the pixel rows: the picture lands the way it was photographed, seen from above with the plan's top (north) up
  return { map: texture(pixels.data, size, true), ...(normalMap ? { normalMap } : {}), roughness };
}

/**
 * Asks for the textures of floor photo `id` at `size` px (`normal`: with a normal map). `onReady` is called with them when they are there (at once when they already
 * are), at most once. The returned function gives them back: the last one to do so frees them. A picture that cannot be loaded never calls `onReady`.
 */
export function acquireFloorPhoto(id: string, size: number, normal: boolean, onReady: (m: PhotoMaps) => void): () => void {
  const key = `${id}|${size}|${normal ? 1 : 0}`;
  let entry = cache.get(key);
  if (!entry) {
    const fresh: Entry = { refs: 0, maps: null, listeners: new Set(), dead: false };
    entry = fresh;
    cache.set(key, fresh);
    const forget = () => {
      if (cache.get(key) === fresh) cache.delete(key); // a failure is not remembered: the next room to ask tries again
    };
    build(id, size, normal, fresh)
      .then((maps) => {
        if (!maps) return forget();
        if (fresh.dead) return disposeLater([maps.map, maps.normalMap], 0); // everyone left while it was being made
        fresh.maps = maps;
        for (const l of fresh.listeners) l(maps);
        fresh.listeners.clear();
      })
      .catch(forget); // a decode or network failure: the rooms keep their colour
  }
  entry.refs++;
  if (entry.maps) onReady(entry.maps);
  else entry.listeners.add(onReady);
  const held = entry;
  let given = false;
  return () => {
    if (given) return;
    given = true;
    held.listeners.delete(onReady);
    if (--held.refs > 0) return;
    held.dead = true;
    if (cache.get(key) === held) cache.delete(key);
    if (held.maps) disposeLater([held.maps.map, held.maps.normalMap]); // the room that wore them may still draw one more frame
  };
}
