"use client";
import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import {
  BufferGeometry,
  Float32BufferAttribute,
  InstancedBufferAttribute,
  InstancedBufferGeometry,
  Points,
  ShaderMaterial,
  Vector3,
  Vector4,
  type Mesh,
} from "three";
import { isOutdoorFloor } from "@/lib/materials";
import { WALL_H } from "@/lib/geometry";
import { useStore } from "@/lib/store";
import { useKnobs } from "@/lib/quality";
import { keepAlive } from "@/lib/framePacer";
import { live } from "./skyLive";
import { isOrtho } from "./camera";

const RAIN_COUNT = 4000;
const RIPPLE_COUNT = 700;
const SNOW_COUNT = 2600;
const MAX_ROOMS = 24;
const RAIN_H = 13; // height of the rain volume, metres
const SNOW_H = 9;
const MARGIN = 8; // metres of weather around the flat
const RAIN_SPEED = 9; // m/s at a drizzle ...
const RAIN_SPEED_POUR = 4; // ... plus this much when pouring
const WIND_CARRY = 0.7; // share of the wind speed rain drops pick up sideways
const SNOW_SPEED = 0.9;
const SNOW_WIND_CARRY = 0.5;
const SWAY_FREQ = 0.6; // rad/s; the clock wraps on a whole number of periods
const CLOCK_WRAP = ((2 * Math.PI) / SWAY_FREQ) * 1000;
const RIPPLE_Y = 0.075; // just above outdoor floor plates
const MIN_STREAK_PX = 1.3;
const FLAKE_M = 0.045;
const MIN_FLAKE_PX = 1.6;
const CRYSTAL_SHARE = 0.07; // of the flakes are drawn as six-armed crystals, the rest stay soft specks
const CRYSTAL_SCALE = 6.5; // a crystal is this many times the size of a speck: about 25 to 40 cm, big enough to show its arms

/** Tests a point against the indoor rooms (they have a roof, so weather never falls through them). */
const ROOM_TEST = /* glsl */ `
#define MAXR ${MAX_ROOMS}
uniform vec4 uRooms[MAXR]; // x0, z0, x1, z1
uniform int uNRooms;
bool indoors(vec3 p) {
  for (int i = 0; i < MAXR; i++) {
    if (i >= uNRooms) break;
    vec4 r = uRooms[i];
    if (p.x > r.x && p.x < r.z && p.z > r.y && p.z < r.w) return true;
  }
  return false;
}
`;

const HIDDEN = "gl_Position = vec4(2.0, 2.0, 2.0, 1.0);";

const RAIN_VERT = /* glsl */ `
${ROOM_TEST}
uniform vec3 uBox;
uniform vec3 uCenter;
uniform vec3 uOffset;   // accumulated drift, already wrapped into the box
uniform vec3 uVel;      // direction the drops travel (not normalised)
uniform float uLen;
uniform float uWidth;
uniform float uDensity;
uniform float uRoof;
attribute vec4 aSeed;
varying vec2 vUv;

void main() {
  vUv = position.xy;
  vec3 p = mod(aSeed.xyz * uBox + uOffset, uBox);
  vec3 head = uCenter + vec3(p.x - uBox.x * 0.5, p.y, p.z - uBox.z * 0.5);
  if (aSeed.w > uDensity || (head.y < uRoof && indoors(head))) { ${HIDDEN} return; }
  float len = uLen * (0.7 + 0.6 * fract(aSeed.w * 13.7));
  vec3 tail = head - normalize(uVel) * len;
  vec4 h = viewMatrix * vec4(head, 1.0);
  vec4 t = viewMatrix * vec4(tail, 1.0);
  vec2 d = h.xy - t.xy;
  d = length(d) < 1e-5 ? vec2(0.0, 1.0) : normalize(d);
  vec4 pv = mix(t, h, position.y);
  pv.xy += vec2(-d.y, d.x) * position.x * uWidth;
  gl_Position = projectionMatrix * pv;
}
`;

const RAIN_FRAG = /* glsl */ `
uniform vec3 uColor;
uniform float uOpacity;
varying vec2 vUv;
void main() {
  float a = uOpacity * (1.0 - abs(vUv.x)) * (0.12 + 0.88 * vUv.y);
  gl_FragColor = vec4(uColor, a);
}
`;

const RIPPLE_VERT = /* glsl */ `
${ROOM_TEST}
uniform vec3 uBox;
uniform vec3 uCenter;
uniform float uTime;
uniform float uDensity;
attribute vec4 aSeed;
varying vec2 vUv;
varying float vT;

void main() {
  vUv = position.xy;
  vec2 xz = uCenter.xz + (aSeed.xy - 0.5) * uBox.xz;
  vT = fract(uTime * 0.9 + aSeed.z);
  if (aSeed.w > uDensity || indoors(vec3(xz.x, 0.0, xz.y))) { ${HIDDEN} return; }
  float r = (0.04 + 0.22 * vT) * (0.7 + 0.7 * fract(aSeed.w * 9.1));
  gl_Position = projectionMatrix * viewMatrix * vec4(xz.x + position.x * r, ${RIPPLE_Y.toFixed(3)}, xz.y + position.y * r, 1.0);
}
`;

const RIPPLE_FRAG = /* glsl */ `
uniform vec3 uColor;
uniform float uOpacity;
varying vec2 vUv;
varying float vT;
void main() {
  float d = length(vUv);
  float ring = smoothstep(0.62, 0.8, d) * (1.0 - smoothstep(0.88, 1.0, d));
  float fade = (1.0 - vT) * (1.0 - vT);
  gl_FragColor = vec4(uColor, ring * fade * uOpacity);
}
`;

const SNOW_VERT = /* glsl */ `
${ROOM_TEST}
uniform vec3 uBox;
uniform vec3 uCenter;
uniform vec3 uOffset;
uniform float uTime;
uniform float uDensity;
uniform float uRoof;
uniform float uPx; // size of a flake in pixels
attribute vec4 aSeed;
varying float vCrystal; // 1: a drawn crystal, 0: a soft speck
varying float vAng; // its spin in its own plane
varying float vFlip; // how wide it looks: it tumbles, so it narrows when seen edge-on

void main() {
  vec3 p = mod(aSeed.xyz * uBox + uOffset, uBox);
  p.x += sin(uTime * ${SWAY_FREQ.toFixed(1)} + aSeed.w * 62.8) * 0.45;
  p.z += cos(uTime * ${SWAY_FREQ.toFixed(1)} * 0.8 + aSeed.w * 37.7) * 0.35;
  vec3 world = uCenter + vec3(p.x - uBox.x * 0.5, p.y, p.z - uBox.z * 0.5);
  vCrystal = step(fract(aSeed.w * 131.7), ${CRYSTAL_SHARE.toFixed(2)});
  float speck = 0.6 + 0.8 * fract(aSeed.w * 23.1);
  float crystal = ${CRYSTAL_SCALE.toFixed(1)} * (0.8 + 0.6 * fract(aSeed.w * 47.3));
  gl_PointSize = min(uPx * mix(speck, crystal, vCrystal), 110.0);
  vAng = aSeed.x * 6.2832 + uTime * (0.25 + 0.5 * fract(aSeed.w * 9.7)) * (fract(aSeed.w * 3.3) > 0.5 ? 1.0 : -1.0);
  vFlip = 0.35 + 0.65 * abs(cos(uTime * (0.5 + fract(aSeed.w * 5.1)) + aSeed.w * 40.0));
  if (aSeed.w > uDensity || (world.y < uRoof && indoors(world))) { ${HIDDEN} return; }
  gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
}
`;

const SNOW_FRAG = /* glsl */ `
uniform float uOpacity;
varying float vCrystal;
varying float vAng;
varying float vFlip;

float seg(vec2 p, vec2 a, vec2 b) {
  vec2 pa = p - a;
  vec2 ba = b - a;
  return length(pa - ba * clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0));
}

void main() {
  vec2 c = (gl_PointCoord - 0.5) * 2.0;
  if (vCrystal < 0.5) {
    gl_FragColor = vec4(0.93, 0.96, 1.0, (1.0 - smoothstep(0.45, 1.0, length(c))) * uOpacity);
    return;
  }
  c.x /= vFlip;
  float s = sin(vAng);
  float k = cos(vAng);
  c = mat2(k, -s, s, k) * c;
  float r = length(c);
  if (r > 1.0) discard;
  // six arms: fold the plane into the 30 degree sector round one arm, then draw that arm with two pairs of side branches
  float f = abs(mod(atan(c.y, c.x) + 0.5235988, 1.0471976) - 0.5235988);
  vec2 q = vec2(cos(f), sin(f)) * r;
  float d = seg(q, vec2(0.0), vec2(0.92, 0.0));
  d = min(d, seg(q, vec2(0.34, 0.0), vec2(0.34 + 0.26, 0.26 * 1.732)));
  d = min(d, seg(q, vec2(0.62, 0.0), vec2(0.62 + 0.18, 0.18 * 1.732)));
  float body = 1.0 - smoothstep(0.045, 0.09, d);
  float core = 1.0 - smoothstep(0.08, 0.16, r);
  gl_FragColor = vec4(0.96, 0.98, 1.0, clamp(max(body, core), 0.0, 1.0) * min(1.0, uOpacity * 1.3));
}
`;

const noRaycast = () => null;
const wrap = (v: number, m: number) => ((v % m) + m) % m;

function seeds(n: number) {
  // deterministic pseudo-random seeds so the volume looks the same every load
  const a = new Float32Array(n * 4);
  let s = 1234567;
  const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  for (let i = 0; i < a.length; i += 4) {
    a[i] = rnd();
    a[i + 1] = rnd();
    a[i + 2] = rnd();
    a[i + 3] = (i / 4 + rnd()) / n; // spread across 0..1 so a density cut thins the volume evenly
  }
  return a;
}

/** One instanced quad per streak: [-1..1] across, 0..1 along. */
function quadInstances(n: number) {
  const g = new InstancedBufferGeometry();
  g.setAttribute("position", new Float32BufferAttribute([-1, 0, 0, 1, 0, 0, 1, 1, 0, -1, 1, 0], 3));
  g.setIndex([0, 1, 2, 0, 2, 3]);
  g.setAttribute("aSeed", new InstancedBufferAttribute(seeds(n), 4));
  g.instanceCount = n;
  return g;
}

/** Flat ripple quad in [-1,1]^2; shader lays it on the floor. */
function rippleInstances(n: number) {
  const g = new InstancedBufferGeometry();
  g.setAttribute("position", new Float32BufferAttribute([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0], 3));
  g.setIndex([0, 1, 2, 0, 2, 3]);
  g.setAttribute("aSeed", new InstancedBufferAttribute(seeds(n), 4));
  g.instanceCount = n;
  return g;
}

function snowPoints(n: number) {
  const g = new BufferGeometry();
  g.setAttribute("position", new Float32BufferAttribute(new Float32Array(n * 3), 3));
  g.setAttribute("aSeed", new Float32BufferAttribute(seeds(n), 4));
  return g;
}

const roomsUniform = () => Array.from({ length: MAX_ROOMS }, () => new Vector4());

type SharedUniforms = { uRooms: { value: Vector4[] }; uNRooms: { value: number }; uCenter: { value: Vector3 } };

const makeRainMaterial = (shared: SharedUniforms) =>
  new ShaderMaterial({
    vertexShader: RAIN_VERT,
    fragmentShader: RAIN_FRAG,
    transparent: true,
    depthWrite: false,
    uniforms: {
      ...shared,
      uBox: { value: new Vector3() },
      uOffset: { value: new Vector3() },
      uVel: { value: new Vector3(0, -1, 0) },
      uLen: { value: 0.5 },
      uWidth: { value: 0.02 },
      uDensity: { value: 0 },
      uRoof: { value: WALL_H },
      uColor: { value: new Vector3(0.6, 0.7, 0.85) },
      uOpacity: { value: 0.4 },
    },
  });

const makeRippleMaterial = (shared: SharedUniforms) =>
  new ShaderMaterial({
    vertexShader: RIPPLE_VERT,
    fragmentShader: RIPPLE_FRAG,
    transparent: true,
    depthWrite: false,
    uniforms: { ...shared, uBox: { value: new Vector3() }, uTime: { value: 0 }, uDensity: { value: 0 }, uColor: { value: new Vector3(0.7, 0.8, 0.95) }, uOpacity: { value: 0.5 } },
  });

const makeSnowMaterial = (shared: SharedUniforms) =>
  new ShaderMaterial({
    vertexShader: SNOW_VERT,
    fragmentShader: SNOW_FRAG,
    transparent: true,
    depthWrite: false,
    uniforms: {
      ...shared,
      uBox: { value: new Vector3() },
      uOffset: { value: new Vector3() },
      uTime: { value: 0 },
      uDensity: { value: 0 },
      uRoof: { value: WALL_H },
      uPx: { value: 3 },
      uOpacity: { value: 0.7 },
    },
  });

/** The rain, ripple and snow materials and their geometry (the light tiers draw a fraction of the drops and flakes), disposed when replaced. */
function useWeatherGraphics(shared: SharedUniforms, share: number) {
  const rainGeo = useMemo(() => quadInstances(Math.round(RAIN_COUNT * share)), [share]);
  const rippleGeo = useMemo(() => rippleInstances(Math.round(RIPPLE_COUNT * share)), [share]);
  const snowGeo = useMemo(() => snowPoints(Math.round(SNOW_COUNT * share)), [share]);
  const rainMat = useMemo(() => makeRainMaterial(shared), [shared]);
  const rippleMat = useMemo(() => makeRippleMaterial(shared), [shared]);
  const snowMat = useMemo(() => makeSnowMaterial(shared), [shared]);
  useEffect(() => () => [rainGeo, rippleGeo, snowGeo].forEach((g) => g.dispose()), [rainGeo, rippleGeo, snowGeo]);
  useEffect(() => () => [rainMat, rippleMat, snowMat].forEach((m) => m.dispose()), [rainMat, rippleMat, snowMat]);
  return { rainGeo, rippleGeo, snowGeo, rainMat, rippleMat, snowMat };
}

/** Rain streaks and floor ripples for this frame: the box, fall velocity, wrapped offset and look, all from the live sky. */
function stepRain(rainMat: ShaderMaterial, rippleMat: ShaderMaterial, off: Vector3, box: Vector3, size: number, dt: number, zoom: number, time: number) {
  const u = rainMat.uniforms;
  box.set(size, RAIN_H, size);
  u.uBox.value.copy(box);
  const speed = RAIN_SPEED + RAIN_SPEED_POUR * live.pour;
  const carry = live.wind * WIND_CARRY;
  u.uVel.value.set(live.windX * carry, -speed, live.windZ * carry);
  off.x = wrap(off.x + u.uVel.value.x * dt, box.x);
  off.y = wrap(off.y + u.uVel.value.y * dt, box.y);
  off.z = wrap(off.z + u.uVel.value.z * dt, box.z);
  u.uOffset.value.copy(off);
  u.uLen.value = 0.42 + 0.5 * live.pour;
  u.uWidth.value = Math.max(0.014, MIN_STREAK_PX / zoom);
  u.uDensity.value = live.rain;
  u.uColor.value.set(live.rainColor.r, live.rainColor.g, live.rainColor.b).multiplyScalar(1.5);
  u.uOpacity.value = 0.45 + 0.25 * live.pour;
  const r = rippleMat.uniforms;
  r.uBox.value.set(size, 0, size);
  r.uTime.value = time % CLOCK_WRAP;
  r.uDensity.value = live.rain * 0.9;
  r.uColor.value.copy(u.uColor.value);
  r.uOpacity.value = 0.45 * live.wet;
}

function stepSnow(snowMat: ShaderMaterial, off: Vector3, box: Vector3, size: number, dt: number, zoom: number, dpr: number, time: number) {
  const u = snowMat.uniforms;
  box.set(size, SNOW_H, size);
  u.uBox.value.copy(box);
  off.x = wrap(off.x + live.windX * live.wind * SNOW_WIND_CARRY * dt, box.x);
  off.y = wrap(off.y - SNOW_SPEED * dt, box.y);
  off.z = wrap(off.z + live.windZ * live.wind * SNOW_WIND_CARRY * dt, box.z);
  u.uOffset.value.copy(off);
  u.uTime.value = time % CLOCK_WRAP;
  u.uDensity.value = live.snow;
  u.uPx.value = Math.max(MIN_FLAKE_PX, FLAKE_M * zoom) * dpr;
}

/**
 * Rain streaks, floor ripples and snow flakes in a volume around the flat, driven by the live sky.
 * Everything is a few draw calls of instanced geometry; density, speed and slant are shader uniforms,
 * so the weather fades in and out smoothly and nothing is allocated per frame.
 */
export default function Weather({ cx, cz, half }: { cx: number; cz: number; half: number }) {
  const rooms = useStore((s) => s.plan.rooms);
  const size = Math.max(34, 2 * (half + MARGIN));
  const shared = useMemo<SharedUniforms>(() => ({ uRooms: { value: roomsUniform() }, uNRooms: { value: 0 }, uCenter: { value: new Vector3() } }), []);
  const { rainGeo, rippleGeo, snowGeo, rainMat, rippleMat, snowMat } = useWeatherGraphics(shared, useKnobs().weather);

  // Indoor rooms (everything but lawn and paving) are roofed: nothing falls through them.
  useEffect(() => {
    const indoor = rooms.filter((r) => !isOutdoorFloor(r.floor)).slice(0, MAX_ROOMS);
    indoor.forEach((r, i) => shared.uRooms.value[i].set(r.x, r.y, r.x + r.w, r.y + r.h));
    shared.uNRooms.value = indoor.length;
  }, [rooms, shared]);

  const rainMesh = useRef<Mesh>(null);
  const rippleMesh = useRef<Mesh>(null);
  const snowMesh = useRef<Points>(null);
  const rainOff = useRef(new Vector3());
  const snowOff = useRef(new Vector3());
  const box = useMemo(() => new Vector3(), []);

  useFrame((state, rawDt) => {
    const dt = Math.min(rawDt, 0.1);
    const zoom = isOrtho(state.camera) ? state.camera.zoom : 40;
    shared.uCenter.value.set(cx, 0, cz);
    const showRain = live.rain > 0.004;
    const showSnow = live.snow > 0.004;
    if (rainMesh.current) rainMesh.current.visible = showRain;
    if (rippleMesh.current) rippleMesh.current.visible = showRain;
    if (showRain) stepRain(rainMat, rippleMat, rainOff.current, box, size, dt, zoom, state.clock.elapsedTime);
    if (showRain || showSnow) keepAlive(false); // falling rain and snow never rest
    if (snowMesh.current) snowMesh.current.visible = showSnow;
    if (showSnow) stepSnow(snowMat, snowOff.current, box, size, dt, zoom, state.gl.getPixelRatio(), state.clock.elapsedTime);
  });

  return (
    <>
      <mesh ref={rainMesh} geometry={rainGeo} material={rainMat} frustumCulled={false} renderOrder={5} raycast={noRaycast} visible={false} />
      <mesh ref={rippleMesh} geometry={rippleGeo} material={rippleMat} frustumCulled={false} renderOrder={3} raycast={noRaycast} visible={false} />
      <points ref={snowMesh} geometry={snowGeo} material={snowMat} frustumCulled={false} renderOrder={5} raycast={noRaycast} visible={false} />
    </>
  );
}
