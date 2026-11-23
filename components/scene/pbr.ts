import { DataTexture, LinearFilter, LinearMipmapLinearFilter, RGBAFormat, RepeatWrapping, UnsignedByteType, type Material, type Texture } from "three";
import type { PbrKind } from "@/lib/materialsPbr";
import { NOISE_ONLY, createTileJob, type TileJob, type TileOpts } from "@/lib/pbrTiles";
import { useQuality, knobsOf } from "@/lib/quality";
import { disposeLater } from "@/lib/disposeLater";

// Procedural PBR textures (lib/pbrTiles.ts draws them) as three textures: tileable (UV 0..1 = one tile of PBR_TILE_M[kind] metres), greyscale colour multiplier +
// roughness multiplier (+ tangent-space normal map). A texture is handed out at once as a neutral 2x2 placeholder and filled in by time slices (a few ms per
// timer tick), so asking for ten kinds never freezes the scene; the same Texture objects then switch to the real pixels. Caches are keyed by kind + size + options.

type PbrTextures = { map: Texture; roughnessMap: Texture; normalMap?: Texture };
type PbrOpts = TileOpts;

const SLICE_MS = 6; // work per timer tick
const TICK_MS = 10; // pause between ticks: the frame in between draws normally
const ANISOTROPY = 8;

type Entry = { key: string; size: number; job: TileJob; maps: Texture; rough: Texture; normal?: Texture; colourShown: boolean; normalShown: boolean; dead: boolean };
const cache = new Map<string, Entry>();
const queue: Entry[] = [];
let timer: number | null = null;

const placeholder = (rgb: [number, number, number]): Texture => {
  const t = new DataTexture(new Uint8Array([...rgb, 255, ...rgb, 255, ...rgb, 255, ...rgb, 255]), 2, 2, RGBAFormat, UnsignedByteType);
  t.wrapS = t.wrapT = RepeatWrapping;
  t.magFilter = LinearFilter;
  t.minFilter = LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  t.anisotropy = ANISOTROPY;
  t.needsUpdate = true;
  return t;
};

/** Swap a texture's pixels for the finished tile (a new size needs the GPU texture re-created). */
function fill(t: Texture, data: Uint8Array, size: number) {
  t.image = { data, width: size, height: size };
  t.dispose();
  t.needsUpdate = true;
}

function publish(e: Entry) {
  if (e.dead) return;
  if (!e.colourShown && e.job.done) {
    fill(e.maps, e.job.albedo, e.size);
    fill(e.rough, e.job.rough, e.size);
    e.colourShown = true;
  }
  if (e.normal && !e.normalShown && e.job.normalDone) {
    fill(e.normal, e.job.normal, e.size);
    e.normalShown = true;
  }
}

function pump() {
  timer = null;
  const e = queue[0];
  if (!e) return;
  const more = e.dead ? false : e.job.run(SLICE_MS, () => performance.now());
  publish(e);
  if (!more) queue.shift();
  if (queue.length) timer = window.setTimeout(pump, TICK_MS);
}

function schedule(e: Entry) {
  if (!queue.includes(e)) queue.push(e);
  if (timer === null) timer = window.setTimeout(pump, 0);
}

/**
 * The textures of one surface kind at a tile size in pixels (`knobs.textureSize`). `opts.normal` adds the normal map (knobs.textures === 2; default off). The result
 * is cached: asking again returns the same objects, asking later for the normal map upgrades the entry. Fine-noise kinds never exceed 512 px.
 */
export function pbrTexture(kind: PbrKind, size: number, opts: PbrOpts = {}): PbrTextures {
  const px = NOISE_ONLY.includes(kind) ? Math.min(size, 512) : size;
  const { normal: wantNormal, ...shape } = opts;
  const key = `${kind}|${px}|${JSON.stringify(shape)}`;
  let e = cache.get(key);
  if (!e) {
    e = { key, size: px, job: createTileJob(kind, px, opts), maps: placeholder([237, 237, 237]), rough: placeholder([217, 217, 217]), colourShown: false, normalShown: false, dead: false };
    cache.set(key, e);
  }
  if (wantNormal && !e.normal) {
    e.normal = placeholder([128, 128, 255]);
    e.job.wantNormal();
    e.normalShown = false;
  }
  if (!e.colourShown || (e.normal && !e.normalShown)) schedule(e);
  publish(e);
  return { map: e.maps, roughnessMap: e.rough, normalMap: wantNormal ? e.normal : undefined };
}

/** Drop (and free) every cached texture whose tile size is not `keep`: after a tier change the old sizes are dead weight. */
function purgePbr(keep: number) {
  for (const [key, e] of cache) {
    if (e.size === (NOISE_ONLY.includes(key.split("|")[0] as PbrKind) ? Math.min(keep, 512) : keep)) continue;
    e.dead = true;
    disposeLater([e.maps, e.rough, e.normal]); // materials of the old look still hold them for a moment
    cache.delete(key);
  }
}


/**
 * Make `material` map its textures in metres instead of through the geometry's UVs: one tile = `metresPerTile` whatever the size of the box, nothing stretched.
 * Default `space: "part"`: from the mesh's own axes at its real (scaled) size, so a pattern follows the part when it is moved or turned, grain runs along the part's
 * long axis, and geometries tagged with `pbrP` (partGeometry.ts) unwrap turned shapes and cylinders around their axis. `space: "world"`: from the world position, so
 * neighbouring static meshes (wall segments, floor boards) continue one pattern; not for pieces that move. Not for instanced meshes.
 */
export function applyWorldUV(material: Material, metresPerTile: number, opts: { space?: "part" | "world" } = {}) {
  const world = opts.space === "world" ? 1 : 0;
  material.onBeforeCompile = (shader) => {
    shader.uniforms.pbrTile = { value: metresPerTile };
    shader.uniforms.pbrWorld = { value: world };
    shader.vertexShader = shader.vertexShader.replace("#include <common>", `#include <common>\n${DECL}`).replace("#include <uv_vertex>", `#include <uv_vertex>\n${MAPPING}`);
  };
  material.customProgramCacheKey = () => "pbrWorldUv";
  material.needsUpdate = true;
}

const DECL = /* glsl */ `
attribute vec4 pbrP; // extents (part units), w = mode + 4 * seed: 1 box (also the default), 2 turned, 3 cylinder
uniform float pbrTile;
uniform float pbrWorld;
`;

// Unwrap in metres: a box face drops its dominant axis and puts the part's longer side along u (grain direction); turned shapes and cylinders run u along the axis
// and v around it (a whole number of tiles, so the seam matches); a cylinder's flat ends are mapped flat. Then divide by the tile size and shift by the seed.
const MAPPING = /* glsl */ `
{
  vec2 q;
  float seed = floor(pbrP.w / 4.0);
  float mode = pbrP.w - seed * 4.0;
  if (pbrWorld > 0.5) {
    vec3 wp = (modelMatrix * vec4(position, 1.0)).xyz;
    vec3 wn = abs(mat3(modelMatrix) * normal);
    if (wn.x >= wn.y && wn.x >= wn.z) q = wp.zy;
    else if (wn.y >= wn.z) q = wp.xz;
    else q = wp.xy;
  } else {
    vec3 sc = vec3(length(modelMatrix[0].xyz), length(modelMatrix[1].xyz), length(modelMatrix[2].xyz));
    if (mode < 1.5) {
      vec3 an = abs(normal);
      vec3 pm = position * sc;
      vec3 ex = pbrP.xyz * sc;
      if (an.x >= an.y && an.x >= an.z) { q = pm.zy; if (ex.y > ex.z) q = q.yx; }
      else if (an.y >= an.z) { q = pm.xz; if (ex.z > ex.x) q = q.yx; }
      else { q = pm.xy; if (ex.y > ex.x) q = q.yx; }
    } else {
      float rad = 0.5 * (sc.x + sc.z);
      float turns = max(1.0, floor(3.14159265 * pbrP.x * rad / pbrTile + 0.5));
      if (mode > 2.5 && abs(normal.y) > 0.9) q = position.xz * sc.xz;
      else q = vec2(position.y * sc.y, uv.x * turns * pbrTile);
    }
  }
  vec2 pbrUv = q / pbrTile + vec2(seed * 0.37, seed * 0.61);
  #ifdef USE_MAP
    vMapUv = pbrUv;
  #endif
  #ifdef USE_NORMALMAP
    vNormalMapUv = pbrUv;
  #endif
  #ifdef USE_ROUGHNESSMAP
    vRoughnessMapUv = pbrUv;
  #endif
}
`;

if (typeof window !== "undefined") {
  let size = knobsOf(useQuality.getState().tier).textureSize;
  useQuality.subscribe((s) => {
    const next = knobsOf(s.tier).textureSize;
    if (next === size) return;
    size = next;
    purgePbr(size);
  });
}
