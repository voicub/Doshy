import test from "node:test";
import assert from "node:assert/strict";
import { DirectionalLight, OrthographicCamera, ShaderMaterial } from "three";
import { Pass } from "postprocessing";
import { GodraysPass } from "three-good-godrays";
import { libraryCamera, patchCompositor, patchIllum, patchPass, setVolume } from "../components/scene/godraysPatch.ts";

/** The shader material of one of the library pass's inner passes (private in its typings). */
const shaderOf = (pass: GodraysPass, field: string): ShaderMaterial => {
  const inner: unknown = Reflect.get(pass, field);
  assert.ok(inner instanceof Pass);
  assert.ok(inner.fullscreenMaterial instanceof ShaderMaterial);
  return inner.fullscreenMaterial;
};

const build = () => new GodraysPass(new DirectionalLight(), libraryCamera(new OrthographicCamera(-10, 10, 10, -10, -200, 300)), {});

test("the installed three-good-godrays shaders are the ones the orthographic rewrite knows", () => {
  const pass = build();
  assert.equal(patchPass(pass), true);
  const illum = shaderOf(pass, "illumPass");
  const compositor = shaderOf(pass, "compositorPass");
  assert.equal(illum.defines.ORTHOGRAPHIC, "");
  assert.equal(compositor.defines.ORTHOGRAPHIC, "");
  assert.match(illum.fragmentShader, /unprojectNdc\(vec3\(ndcXY,-1\.0\)\)/, "the ray starts at the pixel's near-plane point");
  assert.match(compositor.fragmentShader, /#ifdef ORTHOGRAPHIC/);
  pass.dispose();
});

test("past the ray setup the camera's position is no longer the ray's origin", () => {
  const illum = shaderOf(build(), "illumPass").fragmentShader;
  const orthographic = patchIllum(illum);
  assert.ok(orthographic);
  const afterSetup = orthographic.slice(orthographic.indexOf("float distToTarget"));
  assert.doesNotMatch(afterSetup, /cameraPos/);
  assert.match(afterSetup, /rayOrigin\+\(tEntry\+startOffset\)\*direction/);
});

test("the ray is clipped to the volume before the early-out, so rays that miss it cost nothing", () => {
  const patched = patchIllum(shaderOf(build(), "illumPass").fragmentShader);
  assert.ok(patched);
  const clip = patched.indexOf("boxNear");
  assert.ok(clip > 0 && clip < patched.indexOf("if(missed||tEntry>=tExit)"));
  assert.match(patched, /uniform vec3 volumeMin;uniform vec3 volumeMax;/);
});

test("the volume is unbounded until it is set, then holds the box given", () => {
  const pass = build();
  assert.equal(patchPass(pass), true);
  const { uniforms } = shaderOf(pass, "illumPass");
  assert.ok(uniforms.volumeMin.value.x < -1e4 && uniforms.volumeMax.value.x > 1e4);
  setVolume(pass, [1, 0, 2], [8, 4, 9], 3);
  assert.deepEqual(uniforms.volumeMin.value.toArray(), [1, 0, 2]);
  assert.deepEqual(uniforms.volumeMax.value.toArray(), [8, 4, 9]);
  assert.equal(uniforms.volumeFeather.value, 3);
  pass.dispose();
});

test("a shader this rewrite does not know is refused, not guessed at", () => {
  assert.equal(patchIllum("void main(){}"), null);
  assert.equal(patchCompositor("void main(){}"), null);
});

test("the library's camera shares the orthographic camera's live matrices", () => {
  const camera = new OrthographicCamera(-10, 10, 10, -10, -200, 300);
  const stand = libraryCamera(camera);
  assert.equal(stand.projectionMatrixInverse, camera.projectionMatrixInverse);
  assert.equal(stand.matrixWorld, camera.matrixWorld);
  assert.equal(stand.near, -200);
  assert.equal(stand.far, 300);
});
