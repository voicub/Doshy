import { Pass } from "postprocessing";
import type { GodraysPass } from "three-good-godrays";
import { OrthographicCamera, PerspectiveCamera, ShaderMaterial, Vector3 } from "three";

// Two things three-good-godrays does not do that Doshy needs, both made here by rewriting the pass's two shaders once after construction (before the first frame compiles them)
// instead of forking the package. Every rewrite names the text it replaces and refuses (null / false) if the package changed, so a version bump cannot silently draw wrong
// rays (package.json pins the exact version).
//
// 1. An ORTHOGRAPHIC camera. The library reconstructs each pixel's world position and view ray for a perspective camera only (a ray from the camera's position through the
//    pixel, depth linearised with the perspective formula). Doshy's isometric camera has parallel rays and depth linear in the view direction. Used as is, the library would
//    ignore the depth entirely (every pixel lands on one plane) and march rays that all fan out of the camera's position. The ORTHOGRAPHIC define turns on a full
//    un-projection of the pixel (near-plane point -> depth point = the real parallel ray) and a linear depth measure.
// 2. A VOLUME. The library hazes every metre of lit air its rays cross inside the sun's whole shadow frustum (130 m deep), which washes the picture out. Doshy wants rays where
//    the sun comes through the building's openings, so the ray is also clipped to a world-space box (the building and some air around it) and thins out towards the box's
//    sides and top (a hard edge would show as a glowing box); outside it nothing is marched, which also saves the cost for most of the screen. Pixels with no scene behind
//    them (the void) are skipped: there is no air to light there.

// Weight of a sample by its distance inside the box's sides and top (not the ground): 0 at a face, 1 `volumeFeather` metres in.
const UNIFORMS = "uniform vec3 volumeMin;uniform vec3 volumeMax;uniform float volumeFeather;";
const VOLUME_FADE =
  "float volumeFade(vec3 p){float inset=min(min(p.x-volumeMin.x,volumeMax.x-p.x),min(min(p.z-volumeMin.z,volumeMax.z-p.z),volumeMax.y-p.y));return smoothstep(0.0,volumeFeather,inset);}";
const UNPROJECT = "vec3 unprojectNdc(vec3 ndc){vec4 v=cameraProjectionMatrixInv*vec4(ndc,1.0);return (cameraMatrixWorld*vec4(v.xyz/v.w,1.0)).xyz;}";

const LINEAR_PERSPECTIVE = "return zNear*zFar/(zFar+depth*(zNear-zFar));}";
// Orthographic depth is linear: the distance along the view direction from the camera plane (zNear and zFar are signed distances, the near plane may lie behind the camera).
const LINEAR_BOTH = "\n#ifdef ORTHOGRAPHIC\nreturn zNear+depth*(zFar-zNear);\n#else\nreturn zNear*zFar/(zFar+depth*(zNear-zFar));\n#endif\n}";

const RAY_SETUP = "vec3 worldPos=WorldPosFromDepth(depth);vec3 direction=normalize(worldPos-cameraPos);float distToTarget=distance(worldPos,cameraPos);";
const RAY_SETUP_BOTH =
  "\n#ifdef ORTHOGRAPHIC\n" +
  "vec2 ndcXY=vUv*2.0-1.0;vec3 worldPos=unprojectNdc(vec3(ndcXY,depth*2.0-1.0));vec3 rayOrigin=unprojectNdc(vec3(ndcXY,-1.0));vec3 direction=normalize(worldPos-rayOrigin);\n" +
  "#else\n" +
  "vec3 worldPos=WorldPosFromDepth(depth);vec3 rayOrigin=cameraPos;vec3 direction=normalize(worldPos-cameraPos);\n" +
  "#endif\n" +
  "float distToTarget=distance(worldPos,rayOrigin);";

// Slab test of the ray against the box, narrowing the span [tEntry, tExit] the sun's frustum already gave (a ray parallel to a face gets a huge but finite slope instead of 0/0).
const CLIP_ANCHOR = "if(missed||tEntry>=tExit){";
const CLIP_VOLUME =
  "if(depth>=0.99999){gl_FragColor=vec4(0.0,0.0,0.0,linearDepth);return;}" +
  "vec3 safeDir=mix(direction,vec3(1e-5),vec3(lessThan(abs(direction),vec3(1e-5))));" +
  "vec3 boxT0=(volumeMin-rayOrigin)/safeDir;vec3 boxT1=(volumeMax-rayOrigin)/safeDir;" +
  "vec3 boxNear=min(boxT0,boxT1);vec3 boxFar=max(boxT0,boxT1);" +
  "tEntry=max(tEntry,max(boxNear.x,max(boxNear.y,boxNear.z)));tExit=min(tExit,min(boxFar.x,min(boxFar.y,boxFar.z)));";
const SAMPLE_ANCHOR = "illum+=shadowAmount*";
const SAMPLE_FADED = "illum+=volumeFade(samplePos)*shadowAmount*";

const MAIN = "void main(){float depth=texture2D(sceneDepth,vUv).x;";

/** The raymarch shader with the orthographic camera and the volume, or null if it is not the shader this rewrite was written for. */
export function patchIllum(src: string): string | null {
  const split = src.indexOf(RAY_SETUP);
  if (split < 0 || !src.includes(LINEAR_PERSPECTIVE) || !src.includes(MAIN)) return null;
  // past the setup, the camera's position is the ray's origin (clip planes, start of the march, end point)
  const tail = src.slice(split + RAY_SETUP.length).replaceAll("cameraPos", "rayOrigin");
  if (!tail.includes(CLIP_ANCHOR) || !tail.includes(SAMPLE_ANCHOR)) return null;
  const head = src.slice(0, split).replace(LINEAR_PERSPECTIVE, LINEAR_BOTH).replace(MAIN, UNIFORMS + VOLUME_FADE + UNPROJECT + MAIN);
  return head + RAY_SETUP_BOTH + tail.replace(CLIP_ANCHOR, CLIP_VOLUME + CLIP_ANCHOR).replace(SAMPLE_ANCHOR, SAMPLE_FADED);
}

/** The upscale shader: only its depth measure differs. */
export function patchCompositor(src: string): string | null {
  return src.includes(LINEAR_PERSPECTIVE) ? src.replace(LINEAR_PERSPECTIVE, LINEAR_BOTH) : null;
}

/** A shader-material pass inside the library's own pass (its fields are private in the typings, public at run time). */
function innerMaterial(pass: GodraysPass, field: "illumPass" | "compositorPass"): ShaderMaterial | null {
  const inner: unknown = Reflect.get(pass, field);
  if (!(inner instanceof Pass)) return null;
  return inner.fullscreenMaterial instanceof ShaderMaterial ? inner.fullscreenMaterial : null;
}

const EVERYWHERE = 1e5;

/** Make the pass honour a volume (unbounded until `setVolume`) and, for the isometric camera (`orthographic`, the default), draw for an orthographic projection. A perspective camera (the walkthrough's) is what the library draws natively: only the volume is added. False (pass untouched, do not use it) when the library's shaders are not the ones this knows. */
export function patchPass(pass: GodraysPass, orthographic = true): boolean {
  const illum = innerMaterial(pass, "illumPass");
  const compositor = innerMaterial(pass, "compositorPass");
  if (!illum || !compositor) return false;
  const illumSrc = patchIllum(illum.fragmentShader);
  const compositorSrc = patchCompositor(compositor.fragmentShader);
  if (illumSrc === null || compositorSrc === null) return false;
  illum.uniforms.volumeMin = { value: new Vector3(-EVERYWHERE, -EVERYWHERE, -EVERYWHERE) };
  illum.uniforms.volumeMax = { value: new Vector3(EVERYWHERE, EVERYWHERE, EVERYWHERE) };
  illum.uniforms.volumeFeather = { value: 1 };
  for (const [material, src] of [[illum, illumSrc], [compositor, compositorSrc]] as const) {
    material.fragmentShader = src;
    if (orthographic) material.defines.ORTHOGRAPHIC = "";
    material.needsUpdate = true;
  }
  return true;
}

/** Only light inside this world-space box (metres) is made visible; it fades in over `feather` metres from the box's sides and top. */
export function setVolume(pass: GodraysPass, min: readonly [number, number, number], max: readonly [number, number, number], feather: number): void {
  const uniforms = innerMaterial(pass, "illumPass")?.uniforms;
  const lo: unknown = uniforms?.volumeMin?.value;
  const hi: unknown = uniforms?.volumeMax?.value;
  if (uniforms && lo instanceof Vector3 && hi instanceof Vector3) {
    lo.set(...min);
    hi.set(...max);
    uniforms.volumeFeather.value = feather;
  }
}

/** The raymarch density the pass is using right now (a live uniform): it differs from what was set when the library has put its construction settings back. Null if unreadable. */
export function illumDensity(pass: GodraysPass): number | null {
  const value: unknown = innerMaterial(pass, "illumPass")?.uniforms.density?.value;
  return typeof value === "number" ? value : null;
}

/**
 * The camera the library is given. It reads only the projection's inverse, the world matrix and near/far from it (the position is replaced by the per-pixel ray origin
 * above), so this perspective-typed stand-in shares the orthographic camera's two matrices: they stay live as the camera moves and zooms.
 */
export function libraryCamera(camera: OrthographicCamera): PerspectiveCamera {
  const stand = new PerspectiveCamera();
  stand.projectionMatrixInverse = camera.projectionMatrixInverse;
  stand.matrixWorld = camera.matrixWorld;
  stand.near = camera.near;
  stand.far = camera.far;
  return stand;
}
