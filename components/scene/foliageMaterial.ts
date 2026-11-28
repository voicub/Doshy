import { Color, DoubleSide, MeshDepthMaterial, MeshStandardMaterial, RGBADepthPacking, ShaderChunk, Vector2, Vector4, type DataTexture, type WebGLProgramParametersWithUniforms } from "three";
import { knobsOf, useQuality, type Tier } from "@/lib/quality";
import { foliageAtlas, repaintAtlas } from "./foliageAtlas";

/**
 * One material for all vegetation. Geometry is season-agnostic (lib/vegetation.ts); this shader decides per vertex, from the
 * `kind` / random / sway attributes, what colour it has this season, whether its leaf is still on the tree (cards shrink toward their
 * centre as the canopy thins), how much snow lies on it (up-facing normals) and how the wind moves it. All inputs are shared
 * uniforms written once per frame / season change by FoliageDriver, so a whole garden costs a few draw calls and no CPU per instance.
 */
const col = () => new Color();
export const FOLIAGE = {
  uTime: { value: 0 },
  /** 0..1 bend amount: windBend(speed, gust) */
  uWindBend: { value: 0 },
  /** unit direction the wind blows towards, world x / z */
  uWindDir: { value: new Vector2(1, 0) },
  /** monotonic wind phase (advances with the wind speed) */
  uWindPhase: { value: 0 },
  /** 0 under prefers-reduced-motion: static lean only, no oscillation */
  uWindOsc: { value: 1 },
  uLeaf: { value: [col(), col(), col()] },
  uConifer: { value: [col(), col(), col()] },
  uGrass: { value: [col(), col(), col()] },
  uFlower: { value: [col(), col(), col(), col()] },
  uLitter: { value: [col(), col(), col()] },
  uBush: { value: col() },
  /** the second shrub leaf colour (used when uDetail is 1) */
  uBushAlt: { value: col() },
  uHedge: { value: col() },
  uLeafy: { value: 1 },
  uBloom: { value: 0 },
  uBlossom: { value: 0 },
  uFruit: { value: 0 },
  uMush: { value: 0 },
  uLitterShare: { value: 0 },
  uSnow: { value: 0 },
  /** 0.55..1 how thick the lawn's grass tufts stand (thin after winter): the share of tufts kept besides the snow's thinning */
  uGrow: { value: 1 },
  /** 1 on the denser foliage tiers: bark relief and leaf translucency (set by FoliageDriver) */
  uDetail: { value: 0 },
};

const COMMON = /* glsl */ `
attribute vec4 aPart;
attribute vec3 aCenter;
#ifdef USE_INSTANCING
attribute vec4 iRand;
#else
uniform vec4 iRand;
#endif
uniform float uTime, uWindBend, uWindPhase, uWindOsc;
uniform vec2 uWindDir;
uniform float uLeafy, uBloom, uBlossom, uFruit, uMush, uLitterShare, uSnow, uGrow;
// 0 bark 1 broadleaf 2 conifer 3 blossom 4 fruit 5 grass 6 bush 7 flower 8 rock/soil 9 litter 10 hedge 11 stem 12 mushroom 13 patch 14 bloom
float vegKeep(float k, float r) {
  if (k < 0.5) return 1.0;
  if (k < 1.5) return clamp((uLeafy - 0.6 * r) / 0.3, 0.0, 1.0);
  if (k < 2.5) return 1.0;
  if (k < 3.5) return clamp((uBlossom - 0.8 * r) / 0.2, 0.0, 1.0);
  if (k < 4.5) return clamp((uFruit - 0.9 * r) / 0.2, 0.0, 1.0);
  if (k < 5.5) return r < (1.0 - 0.4 * uSnow) * uGrow ? 1.0 : 0.0;
  if (k < 6.5) return 1.0;
  if (k < 7.5) return clamp((uBloom - 0.9 * r) / 0.2, 0.0, 1.0);
  if (k < 8.5) return 1.0;
  if (k < 9.5) return r < uLitterShare ? 1.0 : 0.0;
  if (k < 10.5) return 1.0;
  if (k < 11.5) return clamp((uBloom - 0.9 * r) / 0.2, 0.0, 1.0);
  if (k < 12.5) return clamp((uMush - 0.5 * r) / 0.4, 0.0, 1.0);
  if (k < 13.5) return uMush * (1.0 - uSnow);
  if (k < 14.5) return clamp((uBloom - 0.9 * r) / 0.2, 0.0, 1.0);
  return 1.0; // 15: houseplant, artificial plant: always in leaf
}
`;

/** Leaf drop, then wind. Runs on `transformed` (object space, before the instance matrix). */
const GEOM = /* glsl */ `
float vKd = aPart.x;
float vRnd = fract(aPart.y + iRand.y);
float vKeep = vegKeep(vKd, vRnd);
if (vKd > 0.5) transformed = aCenter + (transformed - aCenter) * vKeep;
#ifdef USE_INSTANCING
mat3 vIm = mat3(instanceMatrix);
#else
mat3 vIm = mat3(1.0);
#endif
mat3 vWm = mat3(modelMatrix) * vIm;
float vS2 = max(dot(vWm[0], vWm[0]), 1e-6);
vec3 vWo = vec3(uWindDir.x, 0.0, uWindDir.y) * vWm / vS2; // world wind direction in object space (rotation + uniform scale)
vec3 vWd = normalize(vWo + vec3(1e-5));
vec3 vAcross = vec3(-vWd.z, 0.0, vWd.x);
float vSw = vKd > 14.5 ? 0.0 : aPart.z; // houseplants stand indoors: the outdoor wind never moves them
float vPh = uWindPhase * (0.75 + 0.5 * iRand.z) + iRand.x * 6.2831 + dot(position.xz, uWindDir) * 0.6;
float vOsc = (sin(vPh) * 0.6 + sin(vPh * 2.31 + iRand.x * 3.1) * 0.4) * uWindOsc;
float vLean = uWindBend * 0.6 * vSw * (0.75 + 0.5 * iRand.w) + vOsc * uWindBend * 0.2 * vSw;
float vLeafy = step(0.5, vKd) * step(vKd, 10.5);
float vFlut = sin(uTime * (6.0 + 8.0 * uWindBend) + aCenter.x * 13.0 + aCenter.z * 9.0 + vRnd * 20.0) * uWindOsc;
transformed += (vWd * (vLean + vLeafy * uWindBend * uWindBend * 0.12 * vSw)
  + vAcross * (vFlut * uWindBend * uWindBend * 0.05 * vLeafy * min(vSw + 0.3, 1.0))
  + normal * (vFlut * uWindBend * 0.03 * vLeafy * min(vSw + 0.3, 1.0))) * inversesqrt(vS2);
`;

const COLOR = /* glsl */ `
{
  vec3 tint = vec3(1.0);
  float snowK = 0.0;
  int slot = int(aPart.w + 0.5);
  if (vKd < 0.5) { snowK = 0.85; }
  else if (vKd < 1.5) { tint = uLeaf[slot] * 1.9 * uTint; snowK = 0.9; }
  else if (vKd < 2.5) { tint = uConifer[slot] * 1.9 * uTint; snowK = 0.95; }
  else if (vKd < 5.5) { if (vKd > 4.5) { tint = uGrass[slot] * 1.25; snowK = 0.45; } }
  else if (vKd < 6.5) { tint = (uDetail > 0.5 ? mix(uBush, uBushAlt, 0.5 * float(slot)) * (0.9 + 0.1 * float(slot)) : uBush * (0.85 + 0.15 * float(slot))) * 1.7 * uTint; snowK = 0.9; }
  else if (vKd < 7.5) { tint = uFlower[slot]; }
  else if (vKd < 8.5) { snowK = 0.9; }
  else if (vKd < 9.5) { tint = uLitter[slot]; }
  else if (vKd < 10.5) { tint = uHedge * 1.9 * uTint; snowK = 0.9; }
  else if (vKd < 11.5) { tint = uGrass[0] * 1.25; }
  else if (vKd > 14.5) { tint = uTint; }
  vec3 wn = normalize(vWm * normal);
  float snow = uSnow * snowK * smoothstep(0.15, 0.7, wn.y);
  vec3 c = vColor.rgb * tint;
  vColor.rgb = mix(c, vec3(0.9, 0.94, 1.0), snow);
  vVKind = vKd;
  vVStyle = aPart.w;
  vBark = aCenter.xy;
}
`;

const FRAG_COMMON = /* glsl */ `
varying float vVKind;
varying float vVStyle;
varying vec2 vBark;
uniform float uDetail;
float vBarkH;
float vh(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vn(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(vh(i), vh(i + vec2(1.0, 0.0)), f.x), mix(vh(i + vec2(0.0, 1.0)), vh(i + vec2(1.0, 1.0)), f.x), f.y);
}
// bump mapping from a screen-space height derivative (Mikkelsen), the same maths as three's bumpmap chunk
vec3 vBump(vec3 sp, vec3 sn, vec2 dH) {
  vec3 sx = normalize(dFdx(sp)), sy = normalize(dFdy(sp));
  vec3 r1 = cross(sy, sn), r2 = cross(sn, sx);
  float det = dot(sx, r1);
  return normalize(abs(det) * sn - sign(det) * (dH.x * r1 + dH.y * r2));
}
`;

/** Bark colour (and the height the relief is taken from). The denser foliage tiers (uDetail 1) get deep furrows, lenticels and ring ridges. */
const FRAG_BARK = /* glsl */ `
if (vVKind < 0.5) {
  vec2 b = vBark;
  float k = 1.0;
  if (uDetail > 0.5) {
    float fine = vn(vec2(b.x * 44.0, b.y * 7.0));
    if (vVStyle < 0.5) {
      float ridge = 1.0 - abs(2.0 * vn(vec2(b.x * 13.0 + vn(vec2(b.x * 5.0, b.y * 1.5)) * 2.0, b.y * 1.1)) - 1.0);
      k = 0.38 + 0.95 * pow(ridge, 1.6) * (0.65 + 0.35 * fine);
    } else if (vVStyle < 1.5) {
      float lent = step(0.78, vn(vec2(b.x * 4.0, b.y * 11.0)));
      float peel = smoothstep(0.55, 0.8, vn(vec2(b.x * 3.0, b.y * 2.2)));
      k = 0.94 - 0.58 * lent - 0.18 * peel - 0.1 * fine;
    } else k = 0.7 + 0.3 * (0.5 + 0.5 * sin(b.y * 70.0 + vn(vec2(b.x * 9.0, b.y)) * 3.0)) + 0.1 * fine;
  } else if (vVStyle < 0.5) k = 0.5 + 0.9 * (vn(vec2(b.x * 18.0, b.y * 1.6)) * 0.6 + vn(vec2(b.x * 41.0, b.y * 5.0)) * 0.4);
  else if (vVStyle < 1.5) {
    k = 0.92 - 0.55 * step(0.8, vn(vec2(b.x * 4.0, b.y * 11.0))) - 0.12 * vn(vec2(b.x * 30.0, b.y * 6.0));
  } else k = 0.78 + 0.22 * sin(b.y * 70.0) + 0.1 * vn(vec2(b.x * 20.0, b.y * 3.0));
  vBarkH = k;
  diffuseColor.rgb *= k;
}
`;

/** Relief on bark from the pattern's height. */
const FRAG_BUMP = /* glsl */ `
if (uDetail > 0.5 && vVKind < 0.5) normal = vBump(-vViewPosition, normal, vec2(dFdx(vBarkH), dFdy(vBarkH)) * 0.7);
`;

/** Fake translucency: a leaf with the sun behind it, seen from the camera, glows with its own colour (light shining through the blade). */
const FRAG_TRANS = /* glsl */ `
#if NUM_DIR_LIGHTS > 0
if (uDetail > 0.5 && (vVKind < 3.5 || (vVKind > 5.5 && vVKind < 6.5) || (vVKind > 9.5 && vVKind < 10.5) || vVKind > 14.5) && vVKind > 0.5) {
  float vThru = pow(clamp(dot(-normalize(vViewPosition), directionalLights[0].direction), 0.0, 1.0), 2.5);
  reflectedLight.directDiffuse += directionalLights[0].color * diffuseColor.rgb * vThru * 0.42;
}
#endif
`;

const NORMAL_NO_FLIP = ShaderChunk.normal_fragment_begin.replace("normal *= faceDirection;", "");

type Shader = WebGLProgramParametersWithUniforms;
const bind = (shader: Shader, extra: Record<string, { value: unknown }>) => Object.assign(shader.uniforms, FOLIAGE, extra);

/** The Eco tier paints the leaf atlas at half size per tile (a quarter of the memory, paint time and upload). */
const atlasPx = (tier: Tier): number => (knobsOf(tier).cheapPlants ? 128 : 256);
let atlas: DataTexture | null = null;
let atlasTile = 0;
/** The shared leaf atlas (created on first use, client only; repainted in place when the tier changes its tile size). */
const leafAtlas = () => {
  if (!atlas) {
    atlasTile = atlasPx(useQuality.getState().tier);
    atlas = foliageAtlas(atlasTile);
    useQuality.subscribe((s) => {
      const px = atlasPx(s.tier);
      if (atlas && px !== atlasTile) repaintAtlas(atlas, (atlasTile = px));
    });
  }
  return atlas;
};

type FoliageMaterials = {
  main: MeshStandardMaterial;
  depth: MeshDepthMaterial;
  /** multiplies the leaf colours (catalog recolour finish) */
  tint: Color;
  /** per item random: phase, thinning offset, stiffness, lean */
  rand: Vector4;
};

/** A main + shadow material pair. The garden shares one pair; every catalog item has its own so it can carry a finish tint and its own wind phase. */
export function makeFoliageMaterials(): FoliageMaterials {
  const tint = new Color(1, 1, 1);
  const rand = new Vector4(0.3, 0.5, 0.5, 0.5);
  const uTint = { value: tint };
  const iRand = { value: rand };
  const map = leafAtlas();
  const main = new MeshStandardMaterial({ map, alphaTest: 0.42, side: DoubleSide, vertexColors: true, roughness: 0.9, metalness: 0 });
  main.customProgramCacheKey = () => "foliage-main";
  main.onBeforeCompile = (shader) => {
    bind(shader, { uTint, iRand });
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", `#include <common>\n${COMMON}\nuniform vec3 uTint;\nuniform float uDetail;\nuniform vec3 uBushAlt;\nuniform vec3 uLeaf[3];\nuniform vec3 uConifer[3];\nuniform vec3 uGrass[3];\nuniform vec3 uFlower[4];\nuniform vec3 uLitter[3];\nuniform vec3 uBush;\nuniform vec3 uHedge;\nvarying float vVKind;\nvarying float vVStyle;\nvarying vec2 vBark;`)
      .replace("#include <begin_vertex>", `#include <begin_vertex>\n${GEOM}\n${COLOR}`);
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", `#include <common>\n${FRAG_COMMON}`)
      .replace("#include <map_fragment>", `#include <map_fragment>\n${FRAG_BARK}`)
      .replace("#include <normal_fragment_begin>", NORMAL_NO_FLIP)
      .replace("#include <normal_fragment_maps>", `#include <normal_fragment_maps>\n${FRAG_BUMP}`)
      .replace("#include <lights_fragment_end>", `#include <lights_fragment_end>\n${FRAG_TRANS}`);
  };
  const depth = new MeshDepthMaterial({ depthPacking: RGBADepthPacking, map, alphaTest: 0.42, side: DoubleSide });
  depth.customProgramCacheKey = () => "foliage-depth";
  depth.onBeforeCompile = (shader) => {
    bind(shader, { iRand });
    shader.vertexShader = shader.vertexShader.replace("#include <common>", `#include <common>\n${COMMON}`).replace("#include <begin_vertex>", `#include <begin_vertex>\n${GEOM}`);
  };
  return { main, depth, tint, rand };
}

let shared: FoliageMaterials | null = null;
/** The pair every instanced garden mesh uses. */
export const gardenMaterials = () => (shared ??= makeFoliageMaterials());
