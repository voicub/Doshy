import { LinearFilter, MeshStandardMaterial, Vector2, type Texture } from "three";
import { tiledTexture } from "@/lib/textures";
import type { Knobs } from "@/lib/quality";
import type { Surface } from "@/lib/shellLook";
import { pbrTexture } from "./pbr";

/** The roughness map holds a multiplier whose mean is about this, so the material's own roughness is the wanted value divided by it. */
const ROUGH_MEAN = 0.85;

let stripeMap: Texture | null = null;
/** The striped-wallpaper pattern, one metre a tile, smoothed (the voxel textures are nearest-filtered). Shared, never disposed: one per page. */
function stripes(): Texture {
  if (!stripeMap) {
    stripeMap = tiledTexture("stripes", 1, 1);
    stripeMap.magFilter = LinearFilter;
  }
  return stripeMap;
}

/** What a surface gives a <meshStandardMaterial>: the roughness always, the texture maps when the tier draws textures. */
export type SurfaceProps = { roughness: number; map?: Texture; normalMap?: Texture; normalScale?: Vector2; roughnessMap?: Texture };

/** Props for a <meshStandardMaterial>: the surface's texture maps at this tier (none at textures 0) and the roughness to pair with them. */
export function surfaceProps(surf: Surface, k: Knobs, rough: number): SurfaceProps {
  if (k.textures === 0) return { roughness: rough };
  const t = pbrTexture(surf.kind, k.textureSize, { ...surf.opts, normal: k.textures === 2 });
  const b = surf.bump ?? 1;
  return { map: surf.stripes ? stripes() : t.map, ...(t.normalMap && { normalMap: t.normalMap }), normalScale: new Vector2(b, b), roughnessMap: t.roughnessMap, roughness: t.roughnessMap ? Math.min(1, rough / ROUGH_MEAN) : rough };
}

const MAX_CACHED = 240;
const cache = new Map<string, MeshStandardMaterial>();

/**
 * One shared material per surface, tint and tier: every wall and trim of a look reuses it (the uvs are in metres, so it never needs a per-wall texture).
 * `end` is for faces that are normally buried inside a neighbouring wall (a wall's two end faces, its underside): pushed back in depth so a corner where
 * two walls overlap never z-fights. Materials are never disposed by users; the oldest half goes when the cache is full (three re-uploads on next use).
 */
export function sharedMaterial(key: string, make: () => MeshStandardMaterial): MeshStandardMaterial {
  let m = cache.get(key);
  if (!m) {
    if (cache.size >= MAX_CACHED) {
      for (const k of [...cache.keys()].slice(0, MAX_CACHED / 2)) {
        cache.get(k)?.dispose();
        cache.delete(k);
      }
    }
    m = make();
    cache.set(key, m);
  }
  return m;
}

/** Forgets one shared material and frees it: for materials that wear textures with a life of their own (components/scene/materialTextures.ts), which go when their last user leaves. */
export function dropSharedMaterial(key: string): void {
  cache.get(key)?.dispose();
  cache.delete(key);
}

export function surfaceMaterial(surf: Surface, tint: string, rough: number, k: Knobs, end = false): MeshStandardMaterial {
  const key = `${surf.kind}|${JSON.stringify(surf.opts ?? 0)}|${surf.bump ?? 1}|${surf.stripes ?? 0}|${tint}|${rough}|${k.textureSize}|${k.textures}|${end}`;
  return sharedMaterial(key, () => new MeshStandardMaterial({ color: tint, ...surfaceProps(surf, k, rough), ...(end ? { polygonOffset: true, polygonOffsetFactor: 2, polygonOffsetUnits: 4 } : {}) }));
}

const PUSH_BACK = { polygonOffset: true, polygonOffsetFactor: 2, polygonOffsetUnits: 4 } as const;

/** A plain painted material (skirting, casings, mouldings, a wall face with no texture, the wall cap). */
export const flatMaterial = (color: string, rough = 0.55, end = false) => sharedMaterial(`flat|${color}|${rough}|${end}`, () => new MeshStandardMaterial({ color, roughness: rough, ...(end ? PUSH_BACK : {}) }));
