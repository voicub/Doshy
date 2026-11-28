// The pure side of drawing a PBR texture (lib/materialRef.ts) in the 3D scene: which maps a graphics tier loads and at what size, the key a loaded set is shared
// under, and how its uvs are turned. The browser side is components/scene/materialTextures.ts. Pure; the node test runner loads it directly (.ts imports).

/** Poly Haven's textures are shipped at 1k: loading more pixels than that would only blur them. */
export const MATERIAL_MAX_PX = 1024;

/** Roughness when the file has no roughness picture: a matte, slightly satin surface. */
export const MATERIAL_ROUGHNESS = 0.85;

/** What a tier does with a material: `fetch` false = draw its average colour only (Eco, Light), otherwise the picture at `size` px, with a normal map when `normal`. */
export type MaterialPlan = { fetch: boolean; size: number; normal: boolean };

/**
 * Textures here cover a metre or two of real surface (a procedural tile covers about as much at the same size), so they are loaded at twice the tier's texture size
 * (Balanced 512, Detailed 1024, Ultra 1024), colour and roughness from Balanced and the normal map only where the tier draws normal maps (`textures` 2).
 */
export function materialPlan(textures: number, textureSize: number): MaterialPlan {
  if (textures <= 0) return { fetch: false, size: 0, normal: false };
  return { fetch: true, size: Math.min(MATERIAL_MAX_PX, textureSize * 2), normal: textures >= 2 };
}

/** The address of one loaded set: the same texture at another size, or with and without its normal map, is another set. */
export const materialKey = (resourceId: string, size: number, normal: boolean): string => `${resourceId}|${size}|${normal ? 1 : 0}`;

/** Turns uv pairs in `uv` by `deg` degrees about the uv origin (a texture repeats, so the pivot only shifts the pattern); `only` limits it to some vertices. No-op at 0 degrees. */
export function turnUvs(uv: Float32Array, deg: number, only?: (vertex: number) => boolean): void {
  if (!deg) return;
  const [c, s] = [Math.cos((deg * Math.PI) / 180), Math.sin((deg * Math.PI) / 180)];
  for (let i = 0; i < uv.length / 2; i++) {
    if (only && !only(i)) continue;
    const [u, v] = [uv[i * 2], uv[i * 2 + 1]];
    uv[i * 2] = u * c - v * s;
    uv[i * 2 + 1] = u * s + v * c;
  }
}

/** Which face of a wall a vertex belongs to, from its normal's z: A is the wall's local +z side, B the -z side; the ends, top and underside (normal across the wall) are neither. */
export const wallSide = (nz: number): "A" | "B" | null => (nz > 0.5 ? "A" : nz < -0.5 ? "B" : null);
