import { Color, MeshDepthMaterial, MeshDistanceMaterial, MeshStandardMaterial, Vector2, Vector4, type Texture, type WebGLProgramParametersWithUniforms } from "three";
import { FACE_FROM, FACE_TO, HOME_FLAT_M } from "@/lib/siteMesh";
import { MACRO_GLSL } from "../groundMacro";

/**
 * What the surroundings' materials share: one set of uniforms written once per frame by Surroundings (sky, weather) or when the layout changes,
 * and one shader patch that adds (a) a fade to the sky colour at the edge of the data, (b) snow on up-facing surfaces and wet darkening, and
 * (c) for the ground only: the garden's own lawn look (grass detail, mottling) near the plan, which is how the real ground meets the drawn one.
 */
export const SITE_U = {
  /** colour the world fades into at its edge (the scene background, linear) */
  uHorizon: { value: new Color("#0a0c11") },
  /** metres from the site centre where the fade starts and ends */
  uEdge: { value: new Vector2(180, 250) },
  /** the site's centre point in plan axes: world x, z */
  uCenter: { value: new Vector2() },
  /** the plan's footprint (x0, z0, x1, z1) */
  uRect: { value: new Vector4() },
  uSnow: { value: 0 },
  /** the camera's azimuth, radians round y from +z (the convention of lib/siteMeshCut.ts `bearingOf`): which neighbours stand between it and the plan (useCutEase writes it) */
  uAz: { value: 0 },
  /** 0 = Cut-away on: every neighbour near the plan is lowered; 1 = automatic: only the ones on the camera's side (eased by useCutEase) */
  uAuto: { value: 0 },
  uWet: { value: 0 },
  uSnowC: { value: new Color("#e8eef6") },
};

/** The ground-only uniforms: one set per ground material. */
type GroundUniforms = {
  uDetail: { value: Texture };
  uDetailK: { value: number };
  uMottleMap: { value: Texture };
  uMottleK: { value: number };
  uMottle: { value: Color };
  /** how much detail / mottling applies away from the plan's lawn: [detail, mottle] */
  uFar: { value: Vector2 };
  uLawn: { value: Color };
  /** the satellite photo's own seasonal snow, 0..1 (the painted ground bakes its season in) */
  uPhotoSnow: { value: number };
  uFlat: { value: Vector2 };
  uMacroMap: { value: Texture };
  /** how strongly the world-space tone / hue patches of groundMacro.ts apply to the lawn (0 = none: Eco and Light) */
  uMacroK: { value: number };
  /** brightness of the detail texture over the voxel one it replaced (lib/groundLook.ts groundGain): the far ground the detail also dresses keeps the brightness it had */
  uDetailGain: { value: number };
};

export const groundUniforms = (detail: Texture, detailK: number, mottle: Texture, mottleK: number, macro: Texture, macroK: number, detailGain = 1): GroundUniforms => ({
  uDetail: { value: detail },
  uDetailK: { value: detailK },
  uMottleMap: { value: mottle },
  uMottleK: { value: mottleK },
  uMottle: { value: new Color("#2f5a28") },
  uFar: { value: new Vector2(0.6, 0.6) },
  uLawn: { value: new Color("#78b058") },
  uPhotoSnow: { value: 0 },
  uFlat: { value: new Vector2(HOME_FLAT_M, 16) },
  uMacroMap: { value: macro },
  uMacroK: { value: macroK },
  uDetailGain: { value: detailGain },
});

const COMMON = /* glsl */ `
varying vec3 vWorld;
varying vec3 vWN;
uniform vec3 uHorizon;
uniform vec2 uEdge;
uniform vec2 uCenter;
uniform vec4 uRect;
uniform float uSnow;
uniform float uWet;
uniform vec3 uSnowC;
`;

const GROUND_COMMON = /* glsl */ `${MACRO_GLSL}
uniform sampler2D uDetail;
uniform float uDetailK;
uniform sampler2D uMottleMap;
uniform float uMottleK;
uniform vec3 uMottle;
uniform vec2 uFar;
uniform vec3 uLawn;
uniform float uPhotoSnow;
uniform vec2 uFlat;
uniform float uMacroK;
uniform float uDetailGain;
`;

/** After the map: the garden's lawn near the plan, the real ground (painted areas or the photo) beyond, snow and rain on top. */
const GROUND = /* glsl */ `
vec2 dq = max(max(uRect.xy - vWorld.xz, vWorld.xz - uRect.zw), 0.0);
float lawnW = 1.0 - smoothstep(uFlat.x, uFlat.x + uFlat.y, length(dq));
vec3 gcol = mix(diffuseColor.rgb, uLawn, lawnW);
gcol = mix(gcol, uSnowC, uPhotoSnow * (1.0 - lawnW));
gcol *= mix(vec3(1.0), texture2D(uDetail, vWorld.xz * uDetailK).rgb * uDetailGain, mix(uFar.x, 1.0, lawnW));
vec2 mn = macroNoise(vWorld.xz) * uMacroK * lawnW; // world-space patches break the repeat of the lawn's tile (0 = off on the light tiers)
gcol *= (1.0 + mn.x * 0.95) * vec3(1.0 + mn.y * 0.5, 1.0, 1.0 - mn.y * 0.5);
float mot = texture2D(uMottleMap, vWorld.xz * uMottleK).g * 0.3 * mix(uFar.y, 1.0, lawnW);
gcol = mix(gcol, uMottle, mot);
gcol = mix(gcol * (1.0 - 0.35 * uWet), uSnowC, uSnow * 0.55 * smoothstep(0.35, 0.75, vWN.y));
diffuseColor.rgb = gcol;
`;

const SNOW_UP = /* glsl */ `
diffuseColor.rgb = mix(diffuseColor.rgb * (1.0 - 0.3 * uWet), uSnowC, uSnow * 0.85 * smoothstep(0.35, 0.75, vWN.y));
`;

const FADE = /* glsl */ `
outgoingLight = mix(outgoingLight, uHorizon, smoothstep(uEdge.x, uEdge.y, length(vWorld.xz - uCenter)));
`;

type SiteMaterialKind = "ground" | "roof" | "plain";

/**
 * Cut-away for the neighbours (lib/siteMesh.ts buildBuildings): `aCut` = (height scale at full cut, ground height, walls' texture v at the ground, bearing from the plan's centre).
 * The share of that cut a building takes is 1 with Cut-away on, and with it off (`uAuto` 1) how much it stands between the camera (`uAz`) and the plan: the same smoothstep as
 * lib/siteMeshCut.ts `facingShare`. Everything above the ground is squashed by the same factor (a roof stays a roof, only lower),
 * the window rows shrink with it (no stripes) and the normals follow, so the lowered block is lit like a low one.
 */
const CUT_HEAD = /* glsl */ `
attribute vec4 aCut;
uniform float uAz;
uniform float uAuto;
#define CUT_S mix(1.0, aCut.x, mix(1.0, smoothstep(${FACE_FROM.toFixed(2)}, ${FACE_TO.toFixed(2)}, cos(aCut.w - uAz)), uAuto))
`;
const CUT_POS = /* glsl */ `
{ float cutY = transformed.y - aCut.y; transformed.y = aCut.y + (cutY > 0.0 ? cutY * CUT_S : cutY); }
`;
const CUT_UV = /* glsl */ `
#ifdef USE_MAP
vMapUv.y = aCut.z + (vMapUv.y - aCut.z) * CUT_S;
#endif
#ifdef USE_EMISSIVEMAP
vEmissiveMapUv.y = aCut.z + (vEmissiveMapUv.y - aCut.z) * CUT_S;
#endif
`;
const CUT_NORMAL = /* glsl */ `
objectNormal = normalize(vec3(objectNormal.x, objectNormal.y / max(CUT_S, 0.02), objectNormal.z));
`;

/** Patch a standard material with the surroundings' shader pieces. `plain` only fades at the edge, `roof` also takes snow, `ground` also draws the lawn; `cut` lowers it with the Cut-away. */
export function patchSiteMaterial(m: MeshStandardMaterial, kind: SiteMaterialKind, ground?: GroundUniforms, cut = false) {
  m.customProgramCacheKey = () => `site-${kind}${cut ? "-cut" : ""}`;
  m.onBeforeCompile = (shader: WebGLProgramParametersWithUniforms) => {
    Object.assign(shader.uniforms, SITE_U, ground);
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", `#include <common>\nvarying vec3 vWorld;\nvarying vec3 vWN;${cut ? CUT_HEAD : ""}`)
      .replace("#include <project_vertex>", "#include <project_vertex>\nvWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;\nvWN = normalize(mat3(modelMatrix) * objectNormal);");
    if (cut) {
      shader.vertexShader = shader.vertexShader
        .replace("#include <uv_vertex>", `#include <uv_vertex>\n${CUT_UV}`)
        .replace("#include <beginnormal_vertex>", `#include <beginnormal_vertex>\n${CUT_NORMAL}`)
        .replace("#include <begin_vertex>", `#include <begin_vertex>\n${CUT_POS}`);
    }
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", `#include <common>\n${COMMON}${kind === "ground" ? GROUND_COMMON : ""}`)
      .replace("#include <color_fragment>", `#include <color_fragment>\n${kind === "ground" ? GROUND : kind === "roof" ? SNOW_UP : ""}`)
      .replace("#include <opaque_fragment>", `${FADE}\n#include <opaque_fragment>`);
  };
}

/** The same lowering for the depth materials the sun's and the lamps' shadow maps use, so a lowered block casts the shadow of what is drawn. */
export function patchCutDepth(m: MeshDepthMaterial | MeshDistanceMaterial) {
  m.customProgramCacheKey = () => "site-cut-depth";
  m.onBeforeCompile = (shader: WebGLProgramParametersWithUniforms) => {
    shader.uniforms.uAz = SITE_U.uAz;
    shader.uniforms.uAuto = SITE_U.uAuto;
    shader.vertexShader = shader.vertexShader.replace("#include <common>", `#include <common>${CUT_HEAD}`).replace("#include <begin_vertex>", `#include <begin_vertex>\n${CUT_POS}`);
  };
}
