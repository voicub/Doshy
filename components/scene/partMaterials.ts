import { Color, MeshPhysicalMaterial, MeshStandardMaterial, type Material } from "three";
import type { Part } from "@/lib/catalog";
import { PBR_TILE_M, ROUGH_MEAN, resolveMat } from "@/lib/materialsPbr";
import { useQuality, knobsOf, type Knobs } from "@/lib/quality";
import { applyWorldUV, pbrTexture } from "./pbr";
import { disposePartGeometries } from "./partGeometry";
import { disposeBaked } from "./partMerge";
import { disposeLater } from "@/lib/disposeLater";

export const AWAY_OPACITY = 0.22; // a car whose device_tracker says not_home stands as a ghost
export const GLASS_OPACITY = 0.3; // glass parts (railings, windows of garden pieces): see-through with a reflective sheen

// One material per (class, colour, glass, ghost, tier look), shared by every part that looks the same: a scene of ~1000 pieces needs a few dozen, not thousands.
// Glow parts are the exception (their emissive is driven per piece): the caller keeps its own material for those.

const MAX_MATERIALS = 300;
const cache = new Map<string, Material>();
const WHITE = new Color("#ffffff");
const GLOSSY = 0.12; // roughness below this: a clean surface

function build(p: Part, color: string, ghost: boolean, k: Pick<Knobs, "textures" | "textureSize">): Material {
  const common = { color, emissive: "#000000", transparent: ghost || !!p.glass, opacity: ghost ? AWAY_OPACITY : p.glass ? GLASS_OPACITY : 1, depthWrite: !ghost && !p.glass };
  if (p.glass) return new MeshStandardMaterial({ ...common, roughness: 0.05, metalness: 0.15, envMapIntensity: 2.2 });
  const m = resolveMat(p, k.textures);
  if (!m.textured) return new MeshStandardMaterial({ ...common, roughness: m.rough, metalness: 0 });
  if (m.rough < GLOSSY) return new MeshStandardMaterial({ ...common, roughness: m.rough, metalness: m.metal }); // mirror, glass and lacquer: no micro texture to roughen them
  const physical = k.textures === 2 && (m.sheen > 0 || m.clearcoat > 0);
  const maps = pbrTexture(m.cls, k.textureSize, { normal: k.textures === 2 });
  const opts = { ...common, roughness: Math.min(1, m.rough / ROUGH_MEAN), metalness: m.metal, map: maps.map, roughnessMap: maps.roughnessMap, ...(maps.normalMap && { normalMap: maps.normalMap }) }; // three warns about a key that is present but undefined
  const mat = physical ? new MeshPhysicalMaterial(opts) : new MeshStandardMaterial(opts);
  if (mat instanceof MeshPhysicalMaterial) {
    mat.sheen = m.sheen;
    mat.sheenRoughness = 0.5;
    mat.sheenColor = new Color(color).lerp(WHITE, 0.5);
    mat.clearcoat = m.clearcoat;
    mat.clearcoatRoughness = 0.12;
  }
  applyWorldUV(mat, PBR_TILE_M[m.cls]);
  return mat;
}

/** The shared material of a non-glow part painted `color`; `ghost` = the away look of a car or pet whose tracker says not home. */
export function partMaterial(p: Part, color: string, ghost: boolean, k: Pick<Knobs, "textures" | "textureSize">): Material {
  const m = resolveMat(p, k.textures);
  const key = `${m.cls}|${color}|${m.rough}|${m.metal}|${p.glass ? "g" : ""}|${ghost ? "a" : ""}|${k.textures}|${k.textureSize}`;
  const hit = cache.get(key);
  if (hit) {
    cache.delete(key);
    cache.set(key, hit);
    return hit;
  }
  const mat = build(p, color, ghost, k);
  cache.set(key, mat);
  if (cache.size > MAX_MATERIALS) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) {
      cache.get(oldest)?.dispose();
      cache.delete(oldest);
    }
  }
  return mat;
}

/** A tier change makes every cached geometry and material stale (other bevel, textures, size): retire them (freed once the meshes that still hold them are gone) and let the scene re-render with the new knobs. */
function disposePartCaches() {
  disposeLater(cache.values());
  cache.clear();
  disposePartGeometries();
  disposeBaked();
}

if (typeof window !== "undefined") {
  let tier = useQuality.getState().tier;
  useQuality.subscribe((s) => {
    if (s.tier === tier) return;
    const a = knobsOf(tier), b = knobsOf(s.tier);
    tier = s.tier;
    if (a.bevelSegments !== b.bevelSegments || a.textures !== b.textures || a.textureSize !== b.textureSize) disposePartCaches();
  });
}
