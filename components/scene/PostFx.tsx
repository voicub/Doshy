"use client";
import { Environment, Lightformer } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import { Bloom, ChromaticAberration, DepthOfField, EffectComposer, N8AO, Noise, SMAA, ToneMapping, Vignette } from "@react-three/postprocessing";
import { BlendFunction, SMAAPreset, ToneMappingMode, type BloomEffect, type DepthOfFieldEffect } from "postprocessing";
import { useRef } from "react";
import { keepAlive } from "@/lib/framePacer";
import { BackSide, MathUtils, type Vector2Tuple } from "three";
import type { OrbitControls } from "three-stdlib";
import { useStore } from "@/lib/store";
import { useKnobs } from "@/lib/quality";
import { Grade, type GradeEffectImpl } from "./GradeEffect";
import { probe } from "./devProbe";
import { live } from "./skyLive";

const LITE_MSAA = 4; // samples of the Light picture: smooth edges without a separate anti-aliasing pass (cheap on tiled mobile GPUs)

const { damp } = MathUtils;

// Depth of field. Overview stays crisp enough to read; a focused room gets a tilt-shift falloff; cinema leans in.
const DOF = {
  overview: { range: 11, bokeh: 1.2 },
  room: { range: 3.4, bokeh: 3 },
  cinema: { range: 3.4, bokeh: 4 },
  cinemaOverview: { range: 6, bokeh: 2.6 },
};
const DOF_EASE = 3.4;
const GRAIN = { normal: 0.07, cinema: 0.1 }; // overlay opacity
const VIGNETTE = { normal: 0.6, cinema: 0.75 };
const CA_OFFSET: Vector2Tuple = [0.0007, 0.0009];
// Ambient occlusion reach. original: the look the scene always had (also the Light and Balanced tiers); tuned: wider and a touch stronger, for the tiers that can afford more samples.
const AO = { original: { aoRadius: 0.8, distanceFalloff: 1.2, intensity: 2.4 }, tuned: { aoRadius: 1.1, distanceFalloff: 1.6, intensity: 3 } };
const SMAA_PRESET = { medium: SMAAPreset.MEDIUM, high: SMAAPreset.HIGH, ultra: SMAAPreset.ULTRA };

/**
 * Local image-based lighting from soft boxes. No network: the cube map is rendered once on mount.
 * Its strength follows the sky through `scene.environmentIntensity` (see SkyDriver); the colour cast comes from the hemisphere and sun.
 */
export function Studio() {
  return (
    <Environment resolution={256} frames={1}>
      <mesh scale={80}>
        <sphereGeometry args={[1, 24, 16]} />
        <meshBasicMaterial color="#46566c" side={BackSide} />
      </mesh>
      <Lightformer form="rect" intensity={3} color="#ffe2c0" position={[0, 9, -2]} rotation-x={Math.PI / 2} scale={[14, 7, 1]} />
      <Lightformer form="rect" intensity={2} color="#ffe2c0" position={[-9, 3, 4]} rotation-y={Math.PI / 2} scale={[12, 3, 1]} />
      <Lightformer form="rect" intensity={2.4} color="#7fb2d8" position={[9, 2.5, -5]} rotation-y={-Math.PI / 2} scale={[10, 2, 1]} />
      <Lightformer form="ring" intensity={1.9} color="#7fb2d8" position={[0, 4, 10]} scale={6} />
    </Environment>
  );
}

/** The finishing passes of the tier (lib/quality.ts `fx`): film = AO, depth of field, bloom, lens fringing, tone map, colour grade, vignette, anti-aliasing, grain;
 *  lite = tone map, grade and vignette in one pass over a multisampled picture. (Eco draws straight to the screen: Scene3D mounts no PostFx.) */
export default function PostFx() {
  const cinema = useStore((s) => s.cinema);
  const k = useKnobs();
  const film = k.fx === "film";
  const dof = useRef<DepthOfFieldEffect>(null);
  const bloom = useRef<BloomEffect>(null);
  const grade = useRef<GradeEffectImpl>(null);
  const controls = useThree((s) => s.controls) as OrbitControls | null;

  useFrame((state, dt) => {
    // grade and bloom follow the live sky
    const L = live.look;
    if (bloom.current) bloom.current.intensity = L.bloom;
    grade.current?.setLook(L);
    const fx = dof.current;
    if (!fx) return;
    const { focusRoom, cinema: cin } = useStore.getState();
    const want = focusRoom ? (cin ? DOF.cinema : DOF.room) : cin ? DOF.cinemaOverview : DOF.overview;
    if (Math.abs(fx.cocMaterial.focusRange - want.range) > 0.01 || Math.abs(fx.bokehScale - want.bokeh) > 0.01) keepAlive(false);
    fx.cocMaterial.focusRange = damp(fx.cocMaterial.focusRange, want.range, DOF_EASE, dt);
    fx.bokehScale = damp(fx.bokehScale, want.bokeh, DOF_EASE, dt);
    // focus follows the orbit target
    if (controls) fx.cocMaterial.focusDistance = state.camera.position.distanceTo(controls.target);
  });

  return (
    <EffectComposer key={k.fx} ref={(c) => probe({ composer: c })} multisampling={film ? 0 : LITE_MSAA} enableNormalPass={false}>
      {film && <N8AO key={`${k.aoQuality}-${k.aoHalfRes}`} {...(k.ao ? AO.tuned : AO.original)} quality={k.aoQuality} halfRes={k.aoHalfRes} color="black" />}
      {film && <DepthOfField ref={dof} focusDistance={40} focusRange={DOF.overview.range} bokehScale={DOF.overview.bokeh} resolutionScale={0.5} />}
      {film && <Bloom ref={bloom} mipmapBlur intensity={0.7} luminanceThreshold={1} luminanceSmoothing={0.15} radius={0.8} levels={8} />}
      {film && <ChromaticAberration offset={CA_OFFSET} radialModulation modulationOffset={0.25} />}
      <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
      <Grade ref={grade} />
      <Vignette eskil={false} offset={0.25} darkness={cinema ? VIGNETTE.cinema : VIGNETTE.normal} />
      {film && <SMAA key={k.smaa} preset={SMAA_PRESET[k.smaa]} />}
      {film && <Noise blendFunction={BlendFunction.OVERLAY} opacity={cinema ? GRAIN.cinema : GRAIN.normal} />}
    </EffectComposer>
  );
}
