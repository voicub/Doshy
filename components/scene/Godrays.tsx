"use client";
import { useFrame, useThree } from "@react-three/fiber";
import { EffectComposerContext } from "@react-three/postprocessing";
import { use, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Color, OrthographicCamera, PerspectiveCamera, type DirectionalLight } from "three";
import { GodraysPass, GodraysUpsampleQuality } from "three-good-godrays";
import { planBounds } from "@/lib/geometry";
import { godraysParams, godraysStrength, godraysVolume, quantizeStrength, type GodraysMode } from "@/lib/godrays";
import { sortedLevels } from "@/lib/levels";
import { useStore } from "@/lib/store";
import { illumDensity, libraryCamera, patchPass, setVolume } from "./godraysPatch";
import { live } from "./skyLive";

/** The rays mix the picture towards the sun's colour before tone mapping, where a sunlit floor already reads above 1: the haze colour is lifted by this much to stay visible against it. */
const HAZE_GAIN = 1.6;
const SUN_COLOR = new Color();
/** Used while a plan has no walls, rooms or furniture to frame. */
const EMPTY_PLAN_BOUNDS = { x0: 0, y0: 0, x1: 10, y1: 10 };

type Applied = { strength: number; hex: number };

/** The pass's settings for a mode at a strength, in the library's own terms. gammaCorrection stays off: the tone map that follows encodes the picture once.
 *  No distance attenuation: the rays are short (the volume is the building), and the library's falloff is measured along the sun's whole 130 m shadow frustum. */
function settings(mode: Exclude<GodraysMode, "off">, strength: number, color: Color) {
  const p = godraysParams(mode, strength);
  return {
    adaptiveSteps: p.adaptiveSteps,
    resolutionScale: p.resolutionScale,
    upsampleQuality: p.sharpUpsample ? GodraysUpsampleQuality.HIGH : GodraysUpsampleQuality.LOW,
    density: p.density,
    maxDensity: p.maxDensity,
    distanceAttenuation: 0,
    color,
    blur: true,
    gammaCorrection: false,
  };
}

/** What the live sky asks of the rays right now: their strength (0 when the sun casts no shadow map to read) and the sun colour they take. */
function skyReading(sun: DirectionalLight): Applied {
  const strength = sun.castShadow ? quantizeStrength(godraysStrength({ sunY: live.sunDir.y, daylight: live.daylight, cloud: live.cloud })) : 0;
  return { strength, hex: live.look.sunC.getHex() };
}

const hazeColor = (): Color => SUN_COLOR.copy(live.look.sunC).multiplyScalar(HAZE_GAIN);

/**
 * Sunbeams in the air, from the sun's shadow map (three-good-godrays). Mount it inside PostFx's EffectComposer, after the render pass and before the tone map: it needs the
 * scene depth and adds light in the linear picture. The pass is built for this sun and this camera, and torn down with them (a lost graphics context rebuilds the whole
 * canvas, so nothing here outlives its context). Rays are made visible only in the air around the building (godraysPatch.ts). The strength follows the live sky every frame
 * and the pass switches itself off, costing nothing, when the sun gives no rays: at night, under an overcast sky.
 */
export default function Godrays({ sun, mode }: { sun: DirectionalLight; mode: Exclude<GodraysMode, "off"> }) {
  const camera = useThree((s) => s.camera);
  const plan = useStore((s) => s.plan);
  const { requestRebuild } = use(EffectComposerContext);
  const [pass, setPass] = useState<GodraysPass | null>(null);
  const applied = useRef<Applied | null>(null);
  const volume = useMemo(() => {
    const ceiling = Math.max(...sortedLevels(plan).map((l) => l.elevation + l.height));
    return godraysVolume(planBounds(plan) ?? EMPTY_PLAN_BOUNDS, ceiling);
  }, [plan]);

  // our own state changing does not re-render the composer, so ask it to walk its passes again (the same way its EffectGroup does)
  useLayoutEffect(() => requestRebuild(), [pass, requestRebuild]);

  useEffect(() => {
    // the isometric camera is orthographic and the library knows perspective only (see godraysPatch.ts): it gets a perspective stand-in and the patched shaders. The walkthrough's camera is perspective: the library takes it as it is
    const ortho = camera instanceof OrthographicCamera;
    if (!ortho && !(camera instanceof PerspectiveCamera)) return;
    // The pass is built with the real settings, not defaults to be changed later: on its first drawn frame the library's shadow-map pass puts back the settings it was constructed
    // with (see the density check below), which would otherwise be the wrong ones for that frame.
    const first = skyReading(sun);
    const built = new GodraysPass(sun, camera instanceof OrthographicCamera ? libraryCamera(camera) : camera, settings(mode, first.strength, hazeColor()));
    if (!patchPass(built, ortho)) {
      console.warn("God rays are off: three-good-godrays' shaders are not the ones components/scene/godraysPatch.ts rewrites for the orthographic camera.");
      built.dispose();
      return;
    }
    setVolume(built, volume.min, volume.max, volume.feather); // before its first frame: until then it would haze everywhere
    built.enabled = first.strength > 0;
    applied.current = first;
    setPass(built);
    return () => {
      built.enabled = false; // the composer may still hold it for one more frame
      built.dispose();
      setPass(null);
    };
  }, [sun, camera, mode]);

  useEffect(() => {
    if (pass) setVolume(pass, volume.min, volume.max, volume.feather);
  }, [pass, volume]);

  useFrame(() => {
    if (!pass) return;
    const now = skyReading(sun);
    pass.enabled = now.strength > 0;
    if (now.strength === 0) return;
    const was = applied.current;
    const reset = illumDensity(pass) !== godraysParams(mode, now.strength).density; // the library put its construction settings back
    if (!reset && was && was.strength === now.strength && was.hex === now.hex) return;
    pass.setParams(settings(mode, now.strength, hazeColor()));
    applied.current = now;
  });

  return pass && <primitive object={pass} />;
}
