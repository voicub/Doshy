"use client";
import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import { AdditiveBlending, BufferGeometry, Float32BufferAttribute, MathUtils, ShaderMaterial, Vector3 } from "three";
import { isOn } from "@/lib/light";
import { roomLightEntities } from "@/lib/rooms";
import { useStore } from "@/lib/store";
import { useKnobs } from "@/lib/quality";
import { keepAlive } from "@/lib/framePacer";
import type { Room } from "@/lib/types";
import { live } from "./skyLive";

const PER_M2 = 9;
const MIN_COUNT = 40;
const MAX_COUNT = 220;
const Y0 = 0.25;
const Y1 = 2.0;
const FADE_RATE = 2;

const VERT = /* glsl */ `
uniform float uTime;
uniform float uPx;
uniform vec3 uSize; // room width, height range, depth
attribute vec4 aSeed;
varying float vA;
void main() {
  float rise = fract(aSeed.w + uTime * (0.006 + aSeed.x * 0.006));
  vec3 p = vec3(aSeed.x * uSize.x, mix(${Y0.toFixed(2)}, ${Y1.toFixed(2)}, rise), aSeed.y * uSize.z);
  p.x += sin(uTime * (0.25 + aSeed.z * 0.3) + aSeed.w * 40.0) * 0.35;
  p.z += cos(uTime * (0.2 + aSeed.x * 0.3) + aSeed.z * 40.0) * 0.35;
  p.x = clamp(p.x, 0.15, uSize.x - 0.15);
  p.z = clamp(p.z, 0.15, uSize.z - 0.15);
  float twinkle = 0.55 + 0.45 * sin(uTime * (0.8 + aSeed.y * 1.5) + aSeed.z * 30.0);
  vA = twinkle * smoothstep(0.0, 0.15, rise) * smoothstep(1.0, 0.85, rise);
  gl_PointSize = uPx * (0.55 + aSeed.z * 0.9);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
}
`;

const FRAG = /* glsl */ `
uniform float uLevel;
varying float vA;
void main() {
  float d = length(gl_PointCoord - 0.5);
  float a = smoothstep(0.5, 0.05, d) * vA * uLevel;
  gl_FragColor = vec4(vec3(1.7, 1.35, 0.9), a);
}
`;

/** Drifting dust motes filling one lit room. One draw call; all motion is in the vertex shader. */
function RoomDust({ room, lit }: { room: Room; lit: boolean }) {
  const dpr = useThree((s) => s.viewport.dpr);
  const count = MathUtils.clamp(Math.round(room.w * room.h * PER_M2), MIN_COUNT, MAX_COUNT);
  const geometry = useMemo(() => {
    const g = new BufferGeometry();
    const seed = new Float32Array(count * 4);
    for (let i = 0; i < seed.length; i++) seed[i] = Math.random();
    g.setAttribute("aSeed", new Float32BufferAttribute(seed, 4));
    g.setAttribute("position", new Float32BufferAttribute(new Float32Array(count * 3), 3)); // required by three; unused
    return g;
  }, [count]);
  const material = useMemo(
    () =>
      new ShaderMaterial({
        vertexShader: VERT,
        fragmentShader: FRAG,
        transparent: true,
        depthWrite: false,
        blending: AdditiveBlending,
        uniforms: { uTime: { value: 0 }, uLevel: { value: 0 }, uPx: { value: 3 }, uSize: { value: new Vector3() } },
      }),
    [],
  );
  useEffect(() => () => geometry.dispose(), [geometry]);
  useEffect(() => () => material.dispose(), [material]);
  useEffect(() => {
    material.uniforms.uSize.value.set(room.w, Y1 - Y0, room.h);
    material.uniforms.uPx.value = 2.4 * dpr;
  }, [material, room.w, room.h, dpr]);

  const mesh = useRef<{ visible: boolean }>(null);
  useFrame((state, dt) => {
    const u = material.uniforms;
    const target = lit ? live.look.dust : 0;
    u.uLevel.value = MathUtils.damp(u.uLevel.value, target, FADE_RATE, dt);
    u.uTime.value = state.clock.elapsedTime;
    if (mesh.current) mesh.current.visible = u.uLevel.value > 0.003;
    if (u.uLevel.value > 0.003) keepAlive(false); // motes drift and twinkle while the room is lit
  });

  return <points ref={mesh} geometry={geometry} material={material} position={[room.x, 0, room.y]} frustumCulled={false} renderOrder={4} raycast={() => null} />;
}

function Lit({ room }: { room: Room }) {
  const lit = useStore((s) => roomLightEntities(s.plan, room).some((id) => isOn(s.states[id])));
  return <RoomDust room={room} lit={lit} />;
}

export default function Dust({ rooms }: { rooms: Room[] }) {
  if (!useKnobs().ambient) return null; // calm tiers draw no dust in the light
  return (
    <>
      {rooms.map((r) => (
        <Lit key={r.id} room={r} />
      ))}
    </>
  );
}
