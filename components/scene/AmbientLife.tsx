"use client";
import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo } from "react";
import { AdditiveBlending, Color, DynamicDrawUsage, Frustum, InstancedBufferAttribute, InstancedMesh, Matrix4, MeshBasicMaterial, PlaneGeometry, ShaderMaterial, Sphere, Vector3 } from "three";
import { MAX_SOURCES, PER_SOURCE, PLUMES, bendOf, burningItems, flicker, heatKindOf, heatPoint, newPuff, plumeAt, puffAge, type PlumeStyle, type V3 } from "@/lib/ambient";
import { useAmbient } from "@/lib/ambientSettings";
import { CATALOG } from "@/lib/catalog";
import { keepAlive } from "@/lib/framePacer";
import { floorY, levelIdOf } from "@/lib/levels";
import { useKnobs } from "@/lib/quality";
import { stayingItems } from "@/lib/roomIsolate";
import { useStore } from "@/lib/store";
import { glowTexture } from "@/lib/textures";
import { useIsoZone } from "./isoState";
import { useLevelVisibility } from "./levelState";
import { useReducedMotion } from "./motion";
import { live } from "./skyLive";

// Smoke and flames of the stoves, fireplaces and fire pits that are burning (lib/ambient.ts decides which). Balanced and above, live view only; nothing is mounted
// while nothing burns, and the frame pacer is only kept awake while a burning one is on screen.

type Source = { id: string; plume: PlumeStyle; flue?: V3; flame?: { at: V3; size: number } };

const SMOKE_N = PER_SOURCE * MAX_SOURCES;
const DAY_GREY = 0.72;
const NIGHT_GREY = 0.16;
const FLAME_COLOR = new Color(1, 0.55, 0.18);
const PLUME_R = 2; // m: a sphere round the plume (centred a metre above the flue) that must touch the view for the smoke to count as seen

const SMOKE_VERT = /* glsl */ `
attribute float aAlpha;
attribute float aWhite;
varying vec2 vUv;
varying float vA;
varying float vW;
void main() {
  vUv = uv;
  vA = aAlpha;
  vW = aWhite;
  gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
}
`;
const SMOKE_FRAG = /* glsl */ `
uniform sampler2D map;
uniform float uTone;
varying vec2 vUv;
varying float vA;
varying float vW;
void main() {
  float a = texture2D(map, vUv).a * vA;
  if (a < 0.004) discard;
  gl_FragColor = vec4(vec3(mix(uTone, 0.5 + 0.5 * uTone, vW)), a); // vapour is lighter than smoke at any hour
}
`;

const M4 = new Matrix4();
const POS = new Vector3();
const ONE = new Vector3();
const FRUSTUM = new Frustum();
const BALL = new Sphere();
const PUFF = newPuff();
const TINT = new Color();

/** The puffs (one instanced mesh of camera-facing soft discs, one draw call) and the flame glows (one more, a few discs) of the burning pieces. */
function Plume({ sources }: { sources: Source[] }) {
  const parts = useMemo(() => {
    const quad = new PlaneGeometry(1, 1);
    const alpha = new InstancedBufferAttribute(new Float32Array(SMOKE_N), 1).setUsage(DynamicDrawUsage);
    const white = new InstancedBufferAttribute(new Float32Array(SMOKE_N), 1).setUsage(DynamicDrawUsage);
    const smokeGeo = quad.clone().setAttribute("aAlpha", alpha).setAttribute("aWhite", white);
    const smokeMat = new ShaderMaterial({ vertexShader: SMOKE_VERT, fragmentShader: SMOKE_FRAG, transparent: true, depthWrite: false, uniforms: { map: { value: glowTexture() }, uTone: { value: DAY_GREY } } });
    const smoke = new InstancedMesh(smokeGeo, smokeMat, SMOKE_N);
    const flameMat = new MeshBasicMaterial({ map: glowTexture(), transparent: true, depthWrite: false, blending: AdditiveBlending, toneMapped: false });
    const flames = new InstancedMesh(quad, flameMat, MAX_SOURCES);
    for (const m of [smoke, flames]) {
      m.instanceMatrix.setUsage(DynamicDrawUsage);
      m.frustumCulled = false;
      m.raycast = () => undefined;
      m.renderOrder = 5;
      m.count = 0;
    }
    return { smoke, flames, alpha, white, smokeMat, flameMat, quad, smokeGeo };
  }, []);
  useEffect(() => () => [parts.smokeMat, parts.flameMat, parts.quad, parts.smokeGeo].forEach((d) => d.dispose()), [parts]);

  useFrame(({ camera, clock }) => {
    const { smoke, flames, alpha, white, smokeMat } = parts;
    FRUSTUM.setFromProjectionMatrix(M4.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
    const inView = sources.some((s) => {
      const top = s.flue ?? s.flame?.at;
      return !!top && FRUSTUM.intersectsSphere(BALL.set(POS.set(top[0], top[1] + 1, top[2]), PLUME_R));
    });
    if (!inView) return; // nobody is looking: no work, and the pacer may sleep
    const t = clock.elapsedTime;
    const bend = bendOf(live.wind);
    ONE.set(1, 1, 1);
    let puffs = 0;
    let glows = 0;
    sources.forEach((s, n) => {
      const seed = (n * 0.31) % 1;
      if (s.flue) {
        for (let i = 0; i < s.plume.puffs; i++) {
          plumeAt(PUFF, puffAge(t, i, s.plume.puffs, seed), seed + i, bend, live.windX, live.windZ, s.plume);
          POS.set(s.flue[0] + PUFF.x, s.flue[1] + PUFF.y, s.flue[2] + PUFF.z);
          smoke.setMatrixAt(puffs, M4.compose(POS, camera.quaternion, ONE.setScalar(PUFF.size)));
          white.setX(puffs, s.plume.white);
          alpha.setX(puffs++, PUFF.alpha);
        }
      }
      if (s.flame) {
        const f = flicker(t, seed + n);
        POS.set(s.flame.at[0], s.flame.at[1], s.flame.at[2]);
        flames.setMatrixAt(glows, M4.compose(POS, camera.quaternion, ONE.setScalar(s.flame.size * (0.85 + 0.3 * f))));
        flames.setColorAt(glows++, TINT.copy(FLAME_COLOR).multiplyScalar(f));
      }
    });
    smoke.count = puffs;
    flames.count = glows;
    smoke.instanceMatrix.needsUpdate = flames.instanceMatrix.needsUpdate = true;
    alpha.needsUpdate = white.needsUpdate = true;
    if (flames.instanceColor) flames.instanceColor.needsUpdate = true;
    smokeMat.uniforms.uTone.value = NIGHT_GREY + (DAY_GREY - NIGHT_GREY) * live.daylight;
    keepAlive(false); // smoke and glow cast no shadow: the sun's shadow map need not be redrawn
  });

  return (
    <>
      <primitive object={parts.smoke} />
      <primitive object={parts.flames} />
    </>
  );
}

/** The burning pieces that are on screen: on a storey that is shown and, in Room mode, in the room entered. Positions are worked out once per change, not per frame. */
function useSources(): Source[] {
  const plan = useStore((s) => s.plan);
  const ids = useStore((s) => burningItems(s.plan.items, s.states).map((i) => i.id).join("|")); // a string: the scene re-renders only when something starts or stops burning
  const { visible } = useLevelVisibility();
  const zone = useIsoZone();
  return useMemo(() => {
    const burning = new Set(ids ? ids.split("|") : []);
    const stay = zone ? stayingItems(plan, zone) : null;
    const out: Source[] = [];
    for (const item of plan.items) {
      const def = CATALOG[item.kind];
      const kind = heatKindOf(item.kind);
      if (!burning.has(item.id) || !def || !kind || !visible[levelIdOf(plan, item)] || (stay && !stay.has(item.id))) continue;
      const y = floorY(plan, item);
      out.push({
        id: item.id,
        plume: PLUMES[kind.plume ?? "smoke"],
        flue: kind.flue && heatPoint(item, def, kind.flue, y),
        flame: kind.flame && { at: heatPoint(item, def, kind.flame.at, y), size: kind.flame.size * Math.max(item.w / def.w, item.d / def.d) },
      });
      if (out.length === MAX_SOURCES) break;
    }
    return out;
  }, [plan, ids, visible, zone]);
}

function Burning() {
  const sources = useSources();
  return sources.length ? <Plume sources={sources} /> : null;
}

/** Mounted once in the live view. Calm tiers (Eco, Light), reduced motion and the owner's switch draw nothing at all. */
export default function AmbientLife() {
  const animates = useKnobs().ambient;
  const wanted = useAmbient((s) => s.smoke);
  const reduced = useReducedMotion();
  return animates && wanted && !reduced ? <Burning /> : null;
}
