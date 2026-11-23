"use client";
import { useFrame } from "@react-three/fiber";
import { keepAlive } from "@/lib/framePacer";
import { useEffect, useMemo, useRef } from "react";
import { AdditiveBlending, BufferGeometry, Float32BufferAttribute, Points, ShaderMaterial, Vector3 } from "three";

/**
 * A cheap particle stream: `count` dots that each travel `dir` (plus gravity `g` on y) from a random spot in a box
 * around `origin`, looping, with a soft fade. Used for the cold draught through an open window, rain falling in over a sill
 * and heat rising off a radiator. One draw call, all motion in the vertex shader, nothing allocated per frame.
 */
const VERT = /* glsl */ `
attribute vec4 aSeed;
uniform float uPhase, uLevel, uPx, uSway, uFlat, uG;
uniform vec3 uOrigin, uExt, uDir;
varying float vA;
void main() {
  float t = fract(uPhase + aSeed.w);
  vec3 p = uOrigin + (aSeed.xyz - 0.5) * uExt + uDir * t;
  p.y += uG * t * t;
  p.x += sin(uPhase * 6.0 + aSeed.y * 40.0) * uSway * t;
  p.z += cos(uPhase * 5.0 + aSeed.x * 33.0) * uSway * t;
  float bell = sin(3.14159 * t);
  float flat_ = smoothstep(0.0, 0.06, t) * (1.0 - smoothstep(0.92, 1.0, t));
  vA = uLevel * mix(bell, flat_, uFlat) * (0.55 + 0.45 * aSeed.y);
  gl_PointSize = uPx * (0.65 + 0.7 * aSeed.z);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
}
`;

const FRAG = /* glsl */ `
uniform vec3 uColor;
varying float vA;
void main() {
  float d = length(gl_PointCoord - 0.5) * 2.0;
  gl_FragColor = vec4(uColor, vA * (1.0 - smoothstep(0.2, 1.0, d)));
}
`;

const geometries = new Map<number, BufferGeometry>();
function seeded(n: number) {
  let g = geometries.get(n);
  if (!g) {
    g = new BufferGeometry();
    const a = new Float32Array(n * 4);
    let s = 987654321 + n;
    const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
    for (let i = 0; i < a.length; i += 4) {
      a[i] = rnd();
      a[i + 1] = rnd();
      a[i + 2] = rnd();
      a[i + 3] = (i / 4 + rnd()) / n; // evenly staggered phases
    }
    g.setAttribute("position", new Float32BufferAttribute(new Float32Array(n * 3), 3));
    g.setAttribute("aSeed", new Float32BufferAttribute(a, 4));
    geometries.set(n, g);
  }
  return g;
}

export type StreamShape = {
  origin: [number, number, number];
  ext: [number, number, number];
  dir: [number, number, number];
  g?: number;
  sway?: number;
  /** 1 = constant brightness along the path (falling drops), 0 = fades in and out (smoke, draught) */
  flat?: number;
  px?: number;
};

type StreamUniforms = ShaderMaterial["uniforms"];
/** Sets `uLevel` / `uColor` for this frame and returns the loop rate (cycles per second). */
export type StreamDrive = (u: StreamUniforms, dt: number) => number;

export default function Stream({ count, shape, drive, dpr = 1 }: { count: number; shape: StreamShape; drive: StreamDrive; dpr?: number }) {
  const material = useMemo(
    () =>
      new ShaderMaterial({
        vertexShader: VERT,
        fragmentShader: FRAG,
        transparent: true,
        depthWrite: false,
        blending: AdditiveBlending,
        uniforms: {
          uPhase: { value: 0 },
          uLevel: { value: 0 },
          uPx: { value: 3 },
          uSway: { value: 0 },
          uFlat: { value: 0 },
          uG: { value: 0 },
          uOrigin: { value: new Vector3() },
          uExt: { value: new Vector3() },
          uDir: { value: new Vector3() },
          uColor: { value: new Vector3(0.7, 0.85, 1) },
        },
      }),
    [],
  );
  useEffect(() => () => material.dispose(), [material]);
  useEffect(() => {
    const u = material.uniforms;
    u.uOrigin.value.set(...shape.origin);
    u.uExt.value.set(...shape.ext);
    u.uDir.value.set(...shape.dir);
    u.uG.value = shape.g ?? 0;
    u.uSway.value = shape.sway ?? 0;
    u.uFlat.value = shape.flat ?? 0;
    u.uPx.value = (shape.px ?? 3) * dpr;
  }, [material, shape, dpr]);

  const mesh = useRef<Points>(null);
  useFrame((_, dt) => {
    const u = material.uniforms;
    const rate = drive(u, Math.min(dt, 0.1));
    u.uPhase.value = (u.uPhase.value + Math.min(dt, 0.1) * rate) % 1000;
    if (mesh.current) mesh.current.visible = u.uLevel.value > 0.004;
    if (u.uLevel.value > 0.004 && rate > 0) keepAlive(false);
  });
  return <points ref={mesh} geometry={seeded(count)} material={material} frustumCulled={false} renderOrder={4} raycast={() => null} visible={false} />;
}
