import { ShaderMaterial } from "three";
import { CATALOG, type Def } from "@/lib/catalog";
import { domainOf } from "@/lib/ha";
import type { Item } from "@/lib/types";

/** Every point-light shadow costs one texture unit in every lit material's shader (16 is the WebGL floor; the sun, wall textures and the env map use the rest). */
const MAX_POINT_SHADOWS = 9;
/** A lit lamp re-renders its shadow map every this many frames (live view, scene static) or this many (editing views, furniture being dragged). Each lamp starts at a random phase so the passes spread over the frames. */
export const SHADOW_EVERY = 20;
export const SHADOW_EVERY_EDIT = 5;
export const SHADOW_MAP = 384;

/** Depth material that writes nothing. Assigned as `customDistanceMaterial` an object casts no shadow into point lights (a lamp's own shade, the desk its LED sits in);
 *  assigned as `customDepthMaterial` it casts none into the sun. */
export const NO_SHADOW = new ShaderMaterial({
  vertexShader: "void main() { gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
  fragmentShader: "void main() { discard; }",
});

/** Real light fixtures cast a pool and a point light; other appliances only light their own glow parts. */
export const emitsLight = (entity: string | undefined, def: Def, kind: string): boolean => {
  const domain = entity ? domainOf(entity) : undefined;
  return domain === "light" || ((domain === "switch" || domain === "media_player") && !!def.light && kind !== "echo_dot");
};

const cache = new WeakMap<Item[], { ids: Set<string>; rank: Map<string, number> }>();

/** Lamps that can carry a real point light, ceiling fixtures first (they light whole rooms), then the others. */
function ranked(items: Item[]) {
  let r = cache.get(items);
  if (r) return r;
  const order = items
    .flatMap((it) => {
      const def = CATALOG[it.kind];
      if (!def || !emitsLight(it.entity, def, it.kind)) return [];
      const y = (((def.light?.y ?? def.h * 0.8) * it.h) / def.h) + (it.elev ?? 0);
      return [{ id: it.id, ceiling: y > 1.8 }];
    })
    .sort((a, b) => Number(b.ceiling) - Number(a.ceiling));
  r = { ids: new Set(order.slice(0, MAX_POINT_SHADOWS).map((o) => o.id)), rank: new Map(order.map((o, i) => [o.id, i])) };
  cache.set(items, r);
  return r;
}

/** Which lamps get a shadow-casting point light: ceiling fixtures first, up to MAX_POINT_SHADOWS. */
export const pointShadowIds = (items: Item[]): Set<string> => ranked(items).ids;

/** A lamp's place in line for a real point light (0 = first; Infinity = not a lamp). The tiers hand real lights only to the first few (`pointLights`). */
export const lampRank = (items: Item[], id: string): number => ranked(items).rank.get(id) ?? Infinity;
