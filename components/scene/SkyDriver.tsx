"use client";
import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import { Color, Fog, MathUtils, Vector3, type Camera, type Clock, type Scene } from "three";
import type { OrbitControls } from "three-stdlib";
import type { SkyState } from "@/lib/sky";
import { useStore } from "@/lib/store";
import { useSky } from "@/lib/useSky";
import { usePreviewSky } from "@/lib/daylightPreview";
import { blendLook } from "./Look";
import { useReducedMotion } from "./motion";
import { keepAlive } from "@/lib/framePacer";
import { live } from "./skyLive";
import { hdriLive } from "./hdriLive";
import { hdriGain } from "@/lib/polyhavenEnv";
import { gustAt, gustiness } from "@/lib/wind";
import { moonGain } from "@/lib/moon";
import { useKnobs } from "@/lib/quality";

const { damp, clamp } = MathUtils;
const RAD = Math.PI / 180;

const DAY_RATE = 2.2; // how fast the lighting follows a sky change (1/s): preset switches glide, real time just drifts
const WEATHER_RATE = 0.9; // rain / snow / fog fade in and out
const DRY_RATE = 0.12; // the ground dries slowly
const SUN_MIN_EL = 6 * RAD; // lowest light elevation: keeps shadows finite at sunrise
const MOON_EL = 38 * RAD;
const LIGHTNING_PULSE_GAP: [number, number] = [0.07, 0.17];
const LIGHTNING_WAIT: [number, number] = [15, 45];
const FLASH_MIN = 0.12; // flash strength of a thin storm / the most a fierce one reaches: kept soft, a flicker and not a strobe
const FLASH_MAX = 0.3;

const FOG_NIGHT = new Color("#161d29");
const FOG_DAY = new Color("#a3afb9");
const RAIN_NIGHT = new Color("#7f93b8");
const RAIN_DAY = new Color("#d4deea");
const GREY = new Color("#aeb6c2");
const BOLT = new Color("#d6e2ff");
const MOONLIGHT = new Color("#a9c4ff"); // the cool tint of a bright moon

const rand = ([a, b]: [number, number]) => a + Math.random() * (b - a);

const sunVec = (out: Vector3, azimuth: number, elevation: number) =>
  out.set(Math.sin(azimuth) * Math.cos(elevation), Math.sin(elevation), -Math.cos(azimuth) * Math.cos(elevation));

/** Target weather values derived from a sky. */
type Weather = { cloud: number; rain: number; pour: number; snow: number; fog: number; storm: number };

function weatherTargets(sky: SkyState): Weather {
  const { kind, intensity, cloud } = sky.weather;
  const raining = kind === "rain" ? intensity : kind === "storm" ? clamp((intensity - 0.4) * 1.7, 0, 1) : 0; // a thin storm is lightning without rain
  return {
    cloud,
    rain: raining,
    pour: kind === "rain" || kind === "storm" ? intensity : 0,
    snow: kind === "snow" ? intensity : 0,
    fog: kind === "fog" ? intensity : 0,
    storm: kind === "storm" ? intensity : 0,
  };
}

type Bolt = { wait: number; pulses: number; gap: number };

/** Scratch vectors for the light direction (written every frame, read at once). */
const TMP = { sun: new Vector3(), moon: new Vector3(), dir: new Vector3(), cam: new Vector3() };

/** The damping rate, or a snap on the first frame (start at the real sky, no fade-in from darkness). */
const rateOf = (snap: boolean, rate: number) => (snap ? 1000 : rate);

/** Daylight and the light direction: the real sun, handing over to a moon on the opposite side as it sets. */
function driveSun(s: SkyState, bearing: number, snap: boolean, dt: number) {
  live.daylight = damp(live.daylight, s.daylight, rateOf(snap, DAY_RATE), dt);
  live.moon = damp(live.moon, s.moon.illumination, rateOf(snap, DAY_RATE), dt);
  const el = s.elevation * RAD;
  const az = (s.azimuth - bearing) * RAD; // compass -> plan frame
  sunVec(TMP.sun, az, Math.max(el, SUN_MIN_EL));
  sunVec(TMP.moon, az + Math.PI, MOON_EL);
  const handover = clamp((s.elevation + 6) / 6, 0, 1);
  TMP.dir.copy(TMP.moon).lerp(TMP.sun, handover * handover * (3 - 2 * handover));
  const r = rateOf(snap, DAY_RATE);
  live.sunDir.set(damp(live.sunDir.x, TMP.dir.x, r, dt), damp(live.sunDir.y, TMP.dir.y, r, dt), damp(live.sunDir.z, TMP.dir.z, r, dt)).normalize();
}

/** Cloud, rain, snow, fog, wet ground, snow cover and wind glide toward the sky's targets. */
function driveWeather(s: SkyState, w: Weather, bearing: number, snap: boolean, dt: number, elapsed: number) {
  const k = (rate: number) => rateOf(snap, rate);
  live.cloud = damp(live.cloud, w.cloud, k(WEATHER_RATE), dt);
  live.rain = damp(live.rain, w.rain, k(WEATHER_RATE), dt);
  live.pour = damp(live.pour, w.pour, k(WEATHER_RATE), dt);
  live.snow = damp(live.snow, w.snow, k(WEATHER_RATE), dt);
  live.fog = damp(live.fog, w.fog, k(WEATHER_RATE), dt);
  live.wet = damp(live.wet, clamp(live.rain * 2.2, 0, 1), k(live.rain * 2.2 > live.wet ? WEATHER_RATE : DRY_RATE), dt);
  live.snowCover = damp(live.snowCover, clamp(live.snow * 1.6, 0, 1), k(live.snow > 0.01 ? 0.25 : 0.05), dt);
  live.wind = damp(live.wind, s.weather.wind, k(0.5), dt);
  const to = ((s.weather.windFrom ?? 270) + 180 - bearing) * RAD;
  live.windX = damp(live.windX, Math.sin(to), k(0.5), dt);
  live.windZ = damp(live.windZ, -Math.cos(to), k(0.5), dt);
  live.gust = damp(live.gust, gustAt(elapsed, live.wind) * gustiness(live.wind, s.weather.gust), k(1.2), dt);
  live.windPhase = (live.windPhase + dt * (0.8 + 0.5 * live.wind) * (1 + 0.5 * live.gust)) % (Math.PI * 2000);
}

/** Lightning (Balanced and up only): rare, 15-45 s apart (sooner when it is fierce), a soft double-pulse each time. */
function driveLightning(b: Bolt, w: Weather, dt: number, reduced: boolean, enabled: boolean) {
  if (enabled && w.storm > 0.05 && live.cloud > 0.5) {
    b.wait -= dt;
    if (b.wait <= 0 && b.pulses === 0) {
      b.pulses = 2 + Math.floor(Math.random() * 2);
      b.gap = 0;
      b.wait = rand(LIGHTNING_WAIT) * (1.15 - 0.4 * w.storm);
    }
    if (b.pulses > 0) {
      b.gap -= dt;
      if (b.gap <= 0) {
        live.flash = Math.max(live.flash, (FLASH_MIN + (FLASH_MAX - FLASH_MIN) * w.storm) * (reduced ? 0.25 : 1) * (b.pulses === 1 ? 0.6 : 1));
        b.pulses--;
        b.gap = rand(LIGHTNING_PULSE_GAP);
      }
    }
  } else {
    b.pulses = 0;
  }
  live.flash *= Math.exp(-dt * 11);
  if (live.flash < 0.003) live.flash = 0;
}

const isSettling = (s: SkyState, w: Weather, lightning: boolean) =>
  live.flash > 0 ||
  (lightning && w.storm > 0.05 && live.cloud > 0.5) ||
  Math.abs(live.daylight - s.daylight) > 0.002 ||
  Math.abs(live.moon - s.moon.illumination) > 0.002 ||
  Math.abs(live.cloud - w.cloud) + Math.abs(live.rain - w.rain) + Math.abs(live.snow - w.snow) + Math.abs(live.fog - w.fog) > 0.004 ||
  Math.abs(live.wind - s.weather.wind) > 0.05 ||
  live.sunDir.angleTo(TMP.dir) > 5e-4;

/** Blends the daylight stops, then lets weather dim, grey and flash them. */
function gradeLook() {
  const L = blendLook(live.daylight, live.look);
  const c = live.cloud;
  const day = live.daylight;
  const wetness = Math.max(live.rain, live.snow * 0.7);
  const night = 1 - day;
  const moonK = moonGain(live.moon); // a full moon lights and tints the night, a new moon leaves it dim (never black)
  L.sunI *= 1 + (moonK - 1) * night;
  L.hemiI *= 1 + (moonK - 1) * 0.5 * night;
  L.sunC.lerp(MOONLIGHT, live.moon * 0.45 * night);
  L.hemiSky.lerp(MOONLIGHT, live.moon * 0.25 * night);
  L.sunI *= 1 - 0.75 * c;
  L.sunC.lerp(GREY, c * 0.55 * (0.4 + 0.6 * day));
  L.hemiI *= 1 + 0.35 * c * day;
  L.hemiSky.lerp(GREY, c * 0.4 * day);
  L.fillI *= 1 + 0.3 * c;
  L.env *= 1 + 0.3 * c * day;
  L.shaft *= 1 - 0.9 * c;
  L.saturation *= 1 - 0.3 * c - 0.1 * wetness;
  L.contrast *= 1 - 0.25 * c;
  const f = live.flash;
  if (f > 0) {
    L.sunI += f * 4;
    L.sunC.lerp(BOLT, Math.min(1, f * 1.5));
    L.hemiI += f * 2;
    L.hemiSky.lerp(BOLT, Math.min(1, f * 1.5));
    L.env += f * 0.6;
    L.bloom += f * 0.9;
  }
  return L;
}

/** Haze: fog proper, plus a little for heavy rain and snow; the fog and the backdrop take its colour. */
function driveFog(fog: Fog, scene: Scene, base: Color, camera: Camera, target: Vector3 | undefined) {
  const c = live.cloud;
  const day = live.daylight;
  const haze = Math.max(live.fog, live.rain * 0.22, live.snow * 0.3);
  live.fogColor.copy(FOG_NIGHT).lerp(FOG_DAY, day * (1 - 0.25 * c)).lerp(BOLT, live.flash * 0.5);
  live.rainColor.copy(RAIN_NIGHT).lerp(RAIN_DAY, day);
  const dist = target ? camera.position.distanceTo(target) : TMP.cam.copy(camera.position).length();
  fog.color.copy(live.fogColor);
  fog.near = dist + MathUtils.lerp(240, -6, haze);
  fog.far = dist + MathUtils.lerp(480, 30, haze);
  if (scene.background instanceof Color) scene.background.copy(base).lerp(live.fogColor, Math.min(1, live.fog * 0.9 + haze * 0.2));
}

/**
 * Turns the HA / settings sky into live per-frame lighting and weather values (see skyLive). Renders nothing.
 * Mount before anything that reads `live`.
 */
export default function SkyDriver({ backdrop }: { backdrop: string }) {
  const sky = usePreviewSky(useSky()); // the day-lighting panel's sun while it is open (lib/daylightPreview.ts), else the real sky
  const target = useRef(sky);
  target.current = sky;
  const weather = useMemo(() => weatherTargets(sky), [sky]); // once per sky change, not once per frame
  const targets = useRef(weather);
  targets.current = weather;
  const bearing = useRef(0);
  bearing.current = useStore((st) => st.plan.bearing ?? 0); // compass bearing of the plan's up direction

  const scene = useThree((s) => s.scene);
  const controls = useThree((s) => s.controls) as OrbitControls | null;
  const fog = useMemo(() => new Fog("#000000", 100, 400), []);
  const base = useMemo(() => new Color(backdrop), [backdrop]);
  const reduced = useReducedMotion();
  const lightning = useKnobs().ambient; // flashes (and the frames they need) only from Balanced up: the light tiers keep the dim, grey storm without them
  const bolt = useRef<Bolt>({ wait: rand(LIGHTNING_WAIT), pulses: 0, gap: 0 });
  const first = useRef(true);

  useEffect(() => {
    scene.fog = fog;
    return () => void (scene.fog = null);
  }, [scene, fog]);

  useFrame(({ camera, clock }: { camera: Camera; clock: Clock }, rawDt) => {
    const dt = Math.min(rawDt, 0.1);
    const s = target.current;
    const w = targets.current;
    const snap = first.current; // first frame: start at the real sky, no fade-in from darkness
    first.current = false;
    driveSun(s, bearing.current, snap, dt);
    driveWeather(s, w, bearing.current, snap, dt, clock.elapsedTime);
    driveLightning(bolt.current, w, dt, reduced, lightning);
    if (isSettling(s, w, lightning)) keepAlive(false); // the sun's shadow map follows the sun on its own (Scene3D Lighting)
    const L = gradeLook();
    driveFog(fog, scene, base, camera, controls?.target);
    scene.environmentIntensity = hdriLive.on ? hdriGain(hdriLive.intensity, hdriLive.studio, live.daylight) : L.env; // a chosen real sky (HdriEnv) sets its own strength
  });

  return null;
}
