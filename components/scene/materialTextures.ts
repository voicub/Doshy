import { DataTexture, LinearFilter, LinearMipmapLinearFilter, RGBAFormat, RepeatWrapping, SRGBColorSpace, UnsignedByteType, type Texture } from "three";
import { fetchResourceFile } from "@/lib/dbApi";
import { fetchGuestModel } from "@/lib/guestApi";
import { guestTokenOf, onGuestPage } from "@/lib/guestMode";
import { disposeLater } from "@/lib/disposeLater";
import { materialKey } from "@/lib/materialLook";
import { readMaterial } from "@/lib/polyhavenMaterial";
import { dropSharedMaterial } from "./shellMaterials";

// The textures of the Poly Haven materials (lib/materialRef.ts, stored by lib/polyhavenMaterial.ts), one set per stored material and tier size, shared by every floor, wall
// and garden surface that wears it. Like components/scene/floorPhotoTextures.ts it is lazy and in small steps: fetch, take the file apart, then each JPEG decoded and drawn
// once at the tier's size (a pause between pictures so a frame draws in between). Sets are counted: the last user to leave frees them. Only Balanced and above ever get
// here; Eco and Light draw the colour kept in the plan and never fetch the file.

export type MaterialTextures = {
  /** Which loaded set this is: wall materials built from it are shared under it (`setMaterialKey`). */
  setId: number;
  map: Texture;
  roughnessMap?: Texture;
  normalMap?: Texture;
};

const TICK_MS = 10; // pause between pictures: the frame in between draws normally
const ANISOTROPY = 8;

type Entry = { refs: number; set: MaterialTextures | null; listeners: Set<(m: MaterialTextures) => void>; dead: boolean };
const cache = new Map<string, Entry>();
let nextSet = 1;

/** The shared wall material of a loaded set (components/scene/materialSurfaces.ts); it goes when the set does. */
export const setMaterialKey = (setId: number): string => `mat|${setId}`;

const pause = (ms = 0) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** One picture as a texture at `size` px. Drawn upside down so the top row of the picture is the last texel row: three's v runs up, so it lands the way three's own loaders put it (a normal map's green keeps pointing up). */
async function decode(ctx: CanvasRenderingContext2D, jpeg: Uint8Array, size: number, colour: boolean): Promise<Texture> {
  const bmp = await createImageBitmap(new Blob([jpeg.slice()], { type: "image/jpeg" }));
  try {
    ctx.setTransform(1, 0, 0, -1, 0, size);
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(bmp, 0, 0, size, size); // Poly Haven's pictures are square: a plain scale to the tier's size
    const { data } = ctx.getImageData(0, 0, size, size);
    const t = new DataTexture(new Uint8Array(data.buffer, data.byteOffset, data.byteLength), size, size, RGBAFormat, UnsignedByteType);
    t.wrapS = t.wrapT = RepeatWrapping;
    t.magFilter = LinearFilter;
    t.minFilter = LinearMipmapLinearFilter;
    t.generateMipmaps = true;
    t.anisotropy = ANISOTROPY;
    if (colour) t.colorSpace = SRGBColorSpace;
    t.needsUpdate = true;
    return t;
  } finally {
    bmp.close();
  }
}

/** The stored file's bytes: from this server's database, or on the guest page (/view/<token>) from the link's own route, which serves the materials the shared plan wears. */
async function fileOf(id: string): Promise<{ buf: ArrayBuffer } | null | undefined> {
  if (!onGuestPage()) return fetchResourceFile(id);
  const token = guestTokenOf(location.pathname);
  return token ? fetchGuestModel(token, id) : null;
}

/** The stored material as textures; null when the server no longer has it, the file is not a material or the browser cannot decode it. The canvas is released before returning. */
async function build(id: string, size: number, normal: boolean, entry: Entry): Promise<Omit<MaterialTextures, "setId"> | null> {
  const file = await fileOf(id);
  const material = file && readMaterial(new Uint8Array(file.buf));
  if (!material || entry.dead) return null;
  const canvas = document.createElement("canvas");
  [canvas.width, canvas.height] = [size, size];
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;
  const { diff, rough, nor } = material.maps;
  /** A further picture, after a pause; undefined when there is none or everyone left in the meantime. */
  const more = async (jpeg: Uint8Array | undefined) => {
    if (!jpeg) return undefined;
    await pause(TICK_MS);
    return entry.dead ? undefined : decode(ctx, jpeg, size, false);
  };
  try {
    const map = await decode(ctx, diff, size, true);
    const roughnessMap = await more(rough);
    const normalMap = await more(normal ? nor : undefined);
    if (entry.dead) return null;
    return { map, ...(roughnessMap ? { roughnessMap } : {}), ...(normalMap ? { normalMap } : {}) };
  } finally {
    [canvas.width, canvas.height] = [0, 0];
  }
}

const disposables = (s: MaterialTextures) => [s.map, s.roughnessMap, s.normalMap, { dispose: () => dropSharedMaterial(setMaterialKey(s.setId)) }];

/**
 * Asks for the textures of material `id` at `size` px (`normal`: with its normal map). `onReady` is called with them when they are there (at once when they already are),
 * at most once. The returned function gives them back: the last one to do so frees them. A material that cannot be loaded never calls `onReady`.
 */
export function acquireMaterial(id: string, size: number, normal: boolean, onReady: (m: MaterialTextures) => void): () => void {
  const key = materialKey(id, size, normal);
  let entry = cache.get(key);
  if (!entry) {
    const fresh: Entry = { refs: 0, set: null, listeners: new Set(), dead: false };
    entry = fresh;
    cache.set(key, fresh);
    const forget = () => {
      if (cache.get(key) === fresh) cache.delete(key); // a failure is not remembered: the next surface to ask tries again
    };
    build(id, size, normal, fresh)
      .then((maps) => {
        if (!maps) return forget();
        const set = { setId: nextSet++, ...maps };
        if (fresh.dead) return disposeLater(disposables(set), 0); // everyone left while it was being made
        fresh.set = set;
        for (const l of fresh.listeners) l(set);
        fresh.listeners.clear();
      })
      .catch(forget); // a decode or network failure: the surfaces keep their colour
  }
  entry.refs++;
  if (entry.set) onReady(entry.set);
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
    if (held.set) disposeLater(disposables(held.set)); // the surface that wore them may still draw one more frame
  };
}
