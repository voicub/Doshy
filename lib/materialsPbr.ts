// What things are made of, as numbers: the material classes of furniture parts (roughness, metalness, sheen, how big one texture tile is), the guess of a
// class from a colour, the edge-rounding rule and the profiles of turned (lathe) shapes. Pure: the browser side (components/scene/pbr.ts, partGeometry.ts,
// partMaterials.ts) turns these into textures, geometries and materials.
import type { Part } from "./catalog.ts";

/** The material classes a catalog part can name (Part.tex). */
type MatClass = NonNullable<Part["tex"]>;
/** Every procedural texture there is: the part classes plus the building, ground and plant surfaces. */
export type PbrKind = MatClass | "plaster" | "brick" | "tile" | "woodfloor" | "concrete" | "bark" | "leaf" | "carpet" | "paving" | "cobble" | "flagstone";
export const PBR_KINDS: readonly PbrKind[] = ["wood", "fabric", "leather", "metal", "plastic", "ceramic", "stone", "paint", "rubber", "foam", "plaster", "brick", "tile", "woodfloor", "concrete", "bark", "leaf", "carpet", "paving", "cobble", "flagstone"];

/** Metres one texture tile covers (UV 0..1 = one tile). Fine weaves are small so the thread stays visible up close; coarse surfaces are big so they do not visibly repeat. */
export const PBR_TILE_M: Record<PbrKind, number> = {
  wood: 1.2, fabric: 0.2, leather: 0.3, metal: 0.4, plastic: 0.5, ceramic: 0.6, stone: 1.2, paint: 0.5, rubber: 0.3, foam: 0.3,
  plaster: 1, brick: 0.9, tile: 0.6, woodfloor: 1.2, concrete: 2, bark: 0.8, leaf: 0.12, carpet: 1, paving: 0.8, cobble: 0.8, flagstone: 0.8,
};

/** Mean of every roughness map: the material's roughness is the wanted value divided by this, so the map only ever lowers it. */
export const ROUGH_MEAN = 0.85;
/** Mean of every colour map: a greyscale multiplier a little under 1, so the part colour stays the albedo. */
export const ALBEDO_MEAN = 0.93;

/** Roughness 0..1, metalness 0..1, sheen (cloth fuzz) 0..1, clearcoat (glaze) 0..1 of each class. */
type MatSpec = { rough: number; metal: number; sheen: number; clearcoat: number };
export const MAT_CLASSES: Record<MatClass, MatSpec> = {
  wood: { rough: 0.55, metal: 0, sheen: 0, clearcoat: 0 },
  fabric: { rough: 0.95, metal: 0, sheen: 0.55, clearcoat: 0 },
  leather: { rough: 0.5, metal: 0, sheen: 0, clearcoat: 0 },
  metal: { rough: 0.35, metal: 0.9, sheen: 0, clearcoat: 0 },
  plastic: { rough: 0.4, metal: 0, sheen: 0, clearcoat: 0 },
  ceramic: { rough: 0.15, metal: 0, sheen: 0, clearcoat: 0.4 },
  stone: { rough: 0.7, metal: 0, sheen: 0, clearcoat: 0 },
  paint: { rough: 0.85, metal: 0, sheen: 0, clearcoat: 0 },
  rubber: { rough: 0.9, metal: 0, sheen: 0, clearcoat: 0 },
  foam: { rough: 0.95, metal: 0, sheen: 0, clearcoat: 0 },
};

/** Roughness of an untextured part: the one every part has always had. */
export const FLAT_ROUGH = 0.8;

const hsl = (hex: string): [number, number, number] | null => {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  const r = ((n >> 16) & 255) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, d = mx - mn;
  if (d === 0) return [0, 0, l];
  const s = d / (1 - Math.abs(2 * l - 1));
  const h = mx === r ? ((g - b) / d + 6) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h * 60, s, l];
};

/**
 * A part with no `tex`: wood-coloured parts (warm brown, medium saturation) get wood, very light ones paint, everything else plastic. Only a cautious
 * guess (fabric, leather and metal need to be named), it gives unmarked parts a fine surface rather than a wrong one.
 */
export function guessClass(color: string): MatClass {
  const c = hsl(color);
  if (!c) return "plastic";
  const [h, s, l] = c;
  if (h >= 14 && h <= 46 && s >= 0.14 && s <= 0.75 && l >= 0.14 && l <= 0.72) return "wood";
  return l > 0.82 ? "paint" : "plastic";
}

type PartMat = { cls: MatClass; rough: number; metal: number; sheen: number; clearcoat: number; textured: boolean };

/**
 * What a part's material is at a texture level (knobs.textures): 0 = today's flat look (rough 0.8 unless the part says so, never metal), 1 and 2 = its class.
 * `rough`/`metal` on the part always win over the class.
 */
export function resolveMat(p: Pick<Part, "c" | "tex" | "rough" | "metal">, level: 0 | 1 | 2): PartMat {
  const cls = p.tex ?? guessClass(p.c);
  if (level === 0) return { cls, rough: p.rough ?? FLAT_ROUGH, metal: 0, sheen: 0, clearcoat: 0, textured: false };
  const k = MAT_CLASSES[cls];
  return { cls, rough: p.rough ?? k.rough, metal: p.metal ?? k.metal, sheen: k.sheen, clearcoat: k.clearcoat, textured: true };
}

// ---- edges ------------------------------------------------------------------------------------------------------------

const AUTO_BEVEL_MAX = 0.04; // metres
const AUTO_BEVEL_SHARE = 0.2; // of the thinnest side
const MIN_BEVEL = 0.005; // below this it would be invisible: keep the edge sharp
const MAX_BEVEL_SHARE = 0.48; // two bevels may not meet through the part

/**
 * Edge radius (metres) for a box (`dims` = x,y,z) or a cylinder (`dims` = diameter, height). 0 = sharp: no rounding at this tier, `bevel: 0`, glass, glow,
 * or too thin to show it.
 */
export function bevelRadius(dims: readonly number[], explicit: number | undefined, segments: number, flat: boolean): number {
  if (segments <= 0 || flat || explicit === 0) return 0;
  const thin = Math.min(...dims);
  const r = Math.min(explicit ?? Math.min(AUTO_BEVEL_MAX, AUTO_BEVEL_SHARE * thin), MAX_BEVEL_SHARE * thin);
  return r >= MIN_BEVEL ? r : 0;
}

// ---- turned shapes ----------------------------------------------------------------------------------------------------

export type Profile = [number, number][];

/** A lathe profile ([radius, height] from the base up) fitted to the part: widest radius -> s[0] / 2, height -> s[1], centred on y = 0, closed to the axis at both ends. */
export function lathePoints(lathe: readonly (readonly [number, number])[], s: readonly [number, number, number]): Profile {
  const pts = lathe.filter((q) => q.length === 2 && Number.isFinite(q[0]) && Number.isFinite(q[1]));
  if (pts.length < 2) return [];
  const maxR = Math.max(...pts.map((q) => q[0])), minY = Math.min(...pts.map((q) => q[1])), maxY = Math.max(...pts.map((q) => q[1]));
  const rs = maxR > 0 ? s[0] / 2 / maxR : 0;
  const hs = maxY > minY ? s[1] / (maxY - minY) : 0;
  const out: Profile = pts.map(([r, y]) => [Math.max(0, r) * rs, (y - minY) * hs - s[1] / 2]);
  const first = out[0], last = out[out.length - 1];
  if (first[0] > 0) out.unshift([0, first[1]]);
  if (last[0] > 0) out.push([0, last[1]]);
  return out;
}

/** A cylinder (radius, height, centred) as a lathe profile with `r`-radius rounded rims of `segments` steps; r = 0 gives the plain sharp-rimmed profile. */
export function cylinderPoints(radius: number, height: number, r: number, segments: number): Profile {
  const h = height / 2;
  if (r <= 0) return [[0, -h], [radius, -h], [radius, h], [0, h]];
  const pts: Profile = [[0, -h]];
  for (let i = 0; i <= segments; i++) {
    const a = (i / segments) * (Math.PI / 2);
    pts.push([radius - r + r * Math.sin(a), -h + r - r * Math.cos(a)]);
  }
  for (let i = 0; i <= segments; i++) {
    const a = (i / segments) * (Math.PI / 2);
    pts.push([radius - r + r * Math.cos(a), h - r + r * Math.sin(a)]);
  }
  pts.push([0, h]);
  return pts;
}

// ---- cache keys ---------------------------------------------------------------------------------------------------------

const f = (n: number) => Math.round(n * 10000);
/** Number of variants of one geometry (each gets another shift of the texture so identical legs do not show the same grain). */
export const GRAIN_SEEDS = 4;

/** Everything about a part's shape that decides its geometry; equal keys share one geometry. */
export function geometryKey(p: Pick<Part, "s" | "shape" | "lathe">, r: number, segments: number, seed: number | null): string {
  const shape = p.shape ?? "box";
  const dims = `${f(p.s[0])},${f(p.s[1])},${f(p.s[2])}`;
  const profile = shape === "lathe" ? (p.lathe ?? []).map((q) => `${f(q[0])}:${f(q[1])}`).join(";") : "";
  return `${shape}|${dims}|${f(r)}|${segments}|${profile}|${seed ?? "-"}`;
}
