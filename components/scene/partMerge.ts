import type { BufferGeometry, Material } from "three";
import { bakeParts, sharedGroups, type Placement } from "@/lib/partBake";
import { disposeLater } from "@/lib/disposeLater";

// Static parts of one piece that share a material are baked into one geometry (lib/partBake.ts), so the piece costs a draw call per material instead of one per part.
// The baked geometry depends only on the piece's definition and the tier's rounding and texture level, so every copy of a piece shares it. Cached by the definition's
// parts array, bounded like the part geometries (the oldest are disposed: a mesh still holding one just re-uploads it).

const MAX_BAKED = 300;
const cache = new Map<object, Map<string, BufferGeometry | null>>();

type Baked = { geometry: BufferGeometry; material: Material };
export type BakePlan = { baked: Baked[]; covered: readonly boolean[] };

/** Can this part join a baked mesh? It stands still and its material does not read the mesh's own axes: textured materials map in the shader from the part's own box (pbr.ts), so a baked mesh would unwrap them wrongly, and see-through ones sort per mesh. */
export const canBake = (material: Material | null | undefined, still: boolean): material is Material => !!material && still && !material.transparent && !("map" in material && material.map);

function bakedOf(owner: object, places: readonly Placement[], indices: number[], geos: BufferGeometry[], tag: string): BufferGeometry | null {
  let byKey = cache.get(owner);
  if (!byKey) {
    byKey = new Map();
    cache.set(owner, byKey);
    if (cache.size > MAX_BAKED) {
      const oldest = cache.keys().next().value;
      if (oldest !== undefined) {
        for (const g of cache.get(oldest)?.values() ?? []) g?.dispose();
        cache.delete(oldest);
      }
    }
  }
  const key = `${tag}|${indices.join(",")}`;
  if (byKey.has(key)) return byKey.get(key) ?? null;
  const geometry = bakeParts(indices.map((i) => places[i]), geos);
  byKey.set(key, geometry);
  return geometry;
}

/**
 * One baked mesh per material that two or more parts share. `owner` is the piece's definition (the cache key: its parts array); `places[i]`, `geos[i]` and `mats[i]` belong to
 * part i; `mats[i]` is null when the part must stay its own mesh (a plant, a glowing or moving part, a part hidden at this tier). `tag` names what else the geometries depend
 * on (the tier's rounding and texture flag; a bone). `covered[i]` is true for parts that went into a baked mesh: the caller skips them.
 */
export function planBake(owner: object, places: readonly Placement[], geos: readonly (BufferGeometry | null)[], mats: readonly (Material | null)[], tag: string): BakePlan {
  const covered = places.map(() => false);
  const baked: Baked[] = [];
  const usable = mats.map((m, i) => (m && geos[i] ? m : null));
  for (const group of sharedGroups(usable)) {
    const material = usable[group[0]];
    const geometry = material ? bakedOf(owner, places, group, group.flatMap((i) => geos[i] ?? []), tag) : null;
    if (!material || !geometry) continue;
    baked.push({ geometry, material });
    for (const i of group) covered[i] = true;
  }
  return { baked, covered };
}

/** Retire every baked geometry: a tier change makes the roundings and textures they were made with stale. */
export function disposeBaked() {
  for (const byKey of cache.values()) disposeLater(byKey.values());
  cache.clear();
}
