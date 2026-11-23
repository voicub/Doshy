"use client";
import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import { AdditiveBlending, BufferGeometry, Float32BufferAttribute, NormalBlending, ShaderMaterial, type Points } from "three";
import { keepAlive } from "@/lib/framePacer";
import { useKnobs } from "@/lib/quality";
import { isOrtho } from "../camera";

/** Per-particle buffers a `step` fills each frame: world position, rgba (a <= 0 hides the particle) and size in metres. */
type SparkBuf = { pos: Float32Array; col: Float32Array; size: Float32Array };
export type SparkStep = (b: SparkBuf, t: number, dt: number) => void;
type SparkShape = "dot" | "square" | "heart";

const SHAPE: Record<SparkShape, number> = { dot: 0, square: 1, heart: 2 };

const VERT = /* glsl */ `
attribute vec4 aCol;
attribute float aSize;
uniform float uPx;
uniform float uMin;
varying vec4 vC;
void main() {
  vC = aCol;
  gl_PointSize = max(aSize * uPx, uMin);
  gl_Position = aCol.a < 0.003 ? vec4(2.0, 2.0, 2.0, 1.0) : projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const FRAG = /* glsl */ `
uniform float uShape;
varying vec4 vC;
void main() {
  vec2 c = gl_PointCoord - 0.5;
  float a;
  if (uShape < 0.5) {
    a = 1.0 - smoothstep(0.3, 1.0, length(c) * 2.0);
  } else if (uShape < 1.5) {
    a = 1.0;
  } else {
    vec2 p = vec2(c.x * 2.5, -c.y * 2.5 + 0.35);
    float h = pow(p.x * p.x + p.y * p.y - 1.0, 3.0) - p.x * p.x * p.y * p.y * p.y;
    a = 1.0 - smoothstep(-0.02, 0.0, h);
  }
  if (a < 0.01) discard;
  gl_FragColor = vec4(vC.rgb, vC.a * a);
}
`;

/**
 * A pool of `count` CPU-animated sprites in one draw call (petals, leaves, fireflies, sparks, hearts, confetti).
 * `step` fills the buffers every frame; nothing is allocated per frame. Sprites keep a minimum pixel size so they stay visible at any zoom.
 * Colours may exceed 1 so the bloom pass picks them up.
 */
export default function Sparks({ count, step, shape = "dot", additive = false, minPx = 1.6, active = true, always = false }: { count: number; step: SparkStep; shape?: SparkShape; additive?: boolean; minPx?: number; active?: boolean; always?: boolean }) {
  const geo = useMemo(() => {
    const g = new BufferGeometry();
    g.setAttribute("position", new Float32BufferAttribute(new Float32Array(count * 3), 3));
    g.setAttribute("aCol", new Float32BufferAttribute(new Float32Array(count * 4), 4));
    g.setAttribute("aSize", new Float32BufferAttribute(new Float32Array(count), 1));
    return g;
  }, [count]);
  const mat = useMemo(
    () =>
      new ShaderMaterial({
        vertexShader: VERT,
        fragmentShader: FRAG,
        transparent: true,
        depthWrite: false,
        toneMapped: false,
        blending: additive ? AdditiveBlending : NormalBlending,
        uniforms: { uPx: { value: 40 }, uMin: { value: minPx }, uShape: { value: SHAPE[shape] } },
      }),
    [additive, minPx, shape],
  );
  useEffect(() => () => geo.dispose(), [geo]);
  useEffect(() => () => mat.dispose(), [mat]);

  const points = useRef<Points>(null);
  const buf = useMemo<SparkBuf>(
    () => ({ pos: geo.getAttribute("position").array as Float32Array, col: geo.getAttribute("aCol").array as Float32Array, size: geo.getAttribute("aSize").array as Float32Array }),
    [geo],
  );

  const { ambient: amb } = useKnobs();
  const ambient = amb || always; // `always`: holiday decor stays in every tier; garden ambience (the default) needs the ambient knob
  useFrame((state, rawDt) => {
    const p = points.current;
    if (!p) return;
    p.visible = active;
    if (!active) return;
    keepAlive(false);
    mat.uniforms.uPx.value = (isOrtho(state.camera) ? state.camera.zoom : 40) * state.gl.getPixelRatio();
    step(buf, state.clock.elapsedTime, Math.min(rawDt, 0.1));
    geo.getAttribute("position").needsUpdate = true;
    geo.getAttribute("aCol").needsUpdate = true;
    geo.getAttribute("aSize").needsUpdate = true;
  });

  if (!ambient) return null;
  return <points ref={points} geometry={geo} material={mat} frustumCulled={false} renderOrder={6} raycast={() => null} visible={false} />;
}
