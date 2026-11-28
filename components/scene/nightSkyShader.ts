import { AdditiveBlending, Matrix3, Matrix4, ShaderMaterial, type IUniform } from "three";

/** The uniforms every sky layer shares (stars, planets, lines, the space station): written once per frame by NightSky, one set of objects so one write serves all. */
export type SkyUniforms = {
  /** view rotation: scene direction -> camera space (no translation: the sky is infinitely far) */
  uView: IUniform<Matrix3>;
  /** camera projection (the real one in the walkthrough, a synthetic horizon-looking one in the isometric view) */
  uProj: IUniform<Matrix4>;
  /** magnitude limit of the naked eye right now: stars fainter than this are gone */
  uLimit: IUniform<number>;
  /** device pixel ratio: point sizes are in device pixels */
  uPx: IUniform<number>;
  uTime: IUniform<number>;
  /** 0 or the twinkle depth (Ultra only) */
  uTwinkle: IUniform<number>;
};

export const makeSkyUniforms = (): SkyUniforms => ({
  uView: { value: new Matrix3() },
  uProj: { value: new Matrix4() },
  uLimit: { value: 6 },
  uPx: { value: 1 },
  uTime: { value: 0 },
  uTwinkle: { value: 0 },
});

// Direction in, clip position out: `uEq` takes the vertex's own frame (J2000 equatorial for stars, the scene frame for planets) to the scene, `uView` and `uProj` do the camera.
// Pin to the far plane itself: even distant scene geometry must occlude the sky.
const COMMON = /* glsl */ `
uniform mat3 uEq;
uniform mat3 uView;
uniform mat4 uProj;
uniform float uLimit;
uniform float uPx;
uniform float uTime;
uniform float uTwinkle;
// height above the horizon (the scene's y) -> magnitudes lost to the air: the same idea as extinctionMag in lib/nightsky.ts, cheap
float extinction(float up) { return 0.2 * (min(1.0 / (max(up, 0.0) + 0.05), 12.0) - 1.0); }
vec4 skyClip(vec3 w) {
  vec4 p = uProj * vec4(uView * w, 1.0);
  return vec4(p.xy, p.w, p.w);
}
`;

const POINT_VERT = /* glsl */ `${COMMON}
attribute vec3 aRGB;
attribute float aMag;
uniform float uStellar;
varying vec3 vC;
void main() {
  vec3 w = uEq * position;
  gl_Position = skyClip(w);
  float mag = aMag + extinction(w.y);
  float vis = clamp((uLimit - mag) / 1.2, 0.0, 1.0) * smoothstep(0.0, 0.03, w.y);
  float bright = clamp(0.3 + 0.2 * (5.5 - mag), 0.16, 1.0);
  float twinkle = 1.0 + uStellar * uTwinkle * 0.08 * sin(uTime * 2.7 + dot(position, vec3(91.7, 57.3, 33.1)));
  float size = clamp(1.3 + 0.85 * clamp(3.5 - mag, 0.0, 8.0), 1.3, 16.0);
  gl_PointSize = size * uPx;
  vC = aRGB * bright * vis * twinkle;
}`;

const POINT_FRAG = /* glsl */ `
varying vec3 vC;
void main() {
  vec2 q = gl_PointCoord * 2.0 - 1.0;
  float r = dot(q, q);
  if (r > 1.0) discard;
  gl_FragColor = vec4(vC * exp(-r * 3.0), 1.0);
}`;

const LINE_VERT = /* glsl */ `${COMMON}
varying float vA;
varying float vUp;
void main() {
  vec3 w = uEq * position;
  gl_Position = skyClip(w);
  vUp = w.y;
  vA = smoothstep(0.0, 0.03, w.y) * clamp((uLimit - 2.5) / 2.0, 0.0, 1.0);
}`;

const LINE_FRAG = /* glsl */ `
uniform vec3 uColor;
varying float vA;
varying float vUp;
void main() {
  if (vUp <= 0.0) discard;
  gl_FragColor = vec4(uColor * vA, 1.0);
}`;

const layer = (shared: SkyUniforms, eq: Matrix3, vertexShader: string, fragmentShader: string, extra: Record<string, IUniform> = {}): ShaderMaterial =>
  new ShaderMaterial({
    uniforms: { ...shared, uEq: { value: eq }, ...extra },
    vertexShader,
    fragmentShader,
    transparent: true,
    blending: AdditiveBlending,
    depthTest: true,
    depthWrite: false,
    toneMapped: false,
  });

/** Stars and planets: round soft dots whose size and brightness come from the magnitude (attributes `aMag`, `aRGB`). `eq` is the matrix of the frame the positions are in. */
export const pointLayer = (shared: SkyUniforms, eq: Matrix3, stellar = false): ShaderMaterial => layer(shared, eq, POINT_VERT, POINT_FRAG, { uStellar: { value: stellar ? 1 : 0 } });

/** Constellation lines: one faint colour, fading with the darkness. */
export const lineLayer = (shared: SkyUniforms, eq: Matrix3, color: [number, number, number]): ShaderMaterial => layer(shared, eq, LINE_VERT, LINE_FRAG, { uColor: { value: color } });
