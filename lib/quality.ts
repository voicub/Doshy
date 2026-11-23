// Graphics quality: one tier setting (Eco .. Ultra) decides how much detail the scene spends. Every realism feature (rounded edges, procedural material
// textures, ambient occlusion, leaf density, furniture detail parts, ...) reads its numbers from `knobs()` so it scales down on a weak machine and the
// tool stays usable for anyone. Pure; the store is the only part that touches the browser.
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { isRecord } from "./guards.ts";
import { classifyDevice, readRenderer, readSignals, type DeviceClass } from "./deviceClass.ts";

export type Tier = "eco" | "low" | "medium" | "high" | "ultra";
export const TIER_ORDER: readonly Tier[] = ["eco", "low", "medium", "high", "ultra"];
export const TIER_LABEL: Record<Tier, string> = { eco: "Eco", low: "Light", medium: "Balanced", high: "Detailed", ultra: "Ultra" };

export type Knobs = {
  /** Highest device pixel ratio the canvas may use. */
  pixelRatio: number;
  /** Sun shadow map size in pixels. */
  shadowMap: number;
  /** The picture's finishing passes. film: ambient occlusion, depth of field, bloom, lens fringing, tone map, grade, vignette, anti-aliasing, grain (the full look).
   *  lite: one pass (tone map, grade, vignette) over a multisampled picture. none: no pass at all, the scene is drawn straight to the screen (tone mapping in the materials, multisampled by the browser). */
  fx: "film" | "lite" | "none";
  /** Ambient occlusion character (film only). true = the tuned one (wider reach, more samples, softer corners), false = the original cheap one. */
  ao: boolean;
  /** Image-based lighting from a procedural sky/room environment (reflections and soft fill on PBR materials). */
  ibl: boolean;
  /** When ibl is off: the cheap soft-box room environment still lights metals and glass. false = none (the hemisphere and sun lights only). */
  studioEnv: boolean;
  /** Rounded (bevelled) edges on box parts. 0 = sharp boxes. Number of rounding segments otherwise. */
  bevelSegments: 0 | 1 | 2 | 3;
  /** Procedural material textures: 0 flat colours, 1 colour + roughness variation, 2 also normal maps (grain, weave, plaster, mortar). */
  textures: 0 | 1 | 2;
  /** Side of a procedural texture tile in pixels (256, 512, 1024). */
  textureSize: 256 | 512 | 1024;
  /** Leaf and needle density multiplier for trees, shrubs and houseplants (1 = the current look). */
  foliage: number;
  /** Every plant uses the cheap far-away geometry (flat leaf cards), near or not. */
  cheapPlants: boolean;
  /** Grass blade and ground-cover density multiplier. */
  grass: number;
  /** Furniture and building detail parts: 0 the plain modelled parts, 1 + trims and mouldings, 2 + small details (stitching lines, handles, cushions, knobs). */
  detail: 0 | 1 | 2;
  /** Soft contact shadows under items on the floor. */
  contactShadows: boolean;
  /** N8AO sample count / denoise quality of the ambient occlusion pass. */
  aoQuality: "medium" | "high" | "ultra";
  /** AO computed at half resolution (cheaper, slightly softer). */
  aoHalfRes: boolean;
  /** Sun shadow edge softness: width of the blurred edge in metres (the PCF radius in texels follows from the map size and the lit area). */
  shadowSoft: number;
  /** The sun's shadow map covers just the building and a few metres around it (a small map then stays sharp), not the whole garden. */
  shadowTight: boolean;
  /** SMAA edge detection preset (film only; thin walls, window frames and plant stems). */
  smaa: "medium" | "high" | "ultra";
  /** How many lamps may light the scene with a real point light (the rest only glow and paint a pool on the floor). Each light costs every pixel of every lit surface. */
  pointLights: number;
  /** Lamps cast real shadows (a shadow map re-drawn every few frames per lamp). */
  pointShadows: boolean;
  /** Ambient life: swaying plants, drifting cloud shadows, dust in the light, sunbeams through windows, falling leaves. Off = a calm, still picture that costs nothing while nothing changes. */
  ambient: boolean;
  /** Rain, snow and ripple particle count multiplier. */
  weather: number;
  /** How much of the real surroundings (neighbour buildings, trees) is drawn: a multiplier of the usual counts. */
  site: number;
};

export const TIERS: Record<Tier, Knobs> = {
  eco: { pixelRatio: 1, shadowMap: 1024, fx: "none", ao: false, ibl: false, studioEnv: false, bevelSegments: 0, textures: 0, textureSize: 256, foliage: 0.3, cheapPlants: true, grass: 0.2, detail: 0, contactShadows: true, aoQuality: "medium", aoHalfRes: true, shadowSoft: 0.06, shadowTight: true, smaa: "medium", pointLights: 0, pointShadows: false, ambient: false, weather: 0.25, site: 0.15 },
  low: { pixelRatio: 1.25, shadowMap: 2048, fx: "lite", ao: false, ibl: false, studioEnv: true, bevelSegments: 0, textures: 0, textureSize: 256, foliage: 0.6, cheapPlants: false, grass: 0.5, detail: 0, contactShadows: true, aoQuality: "medium", aoHalfRes: true, shadowSoft: 0.06, shadowTight: false, smaa: "medium", pointLights: 4, pointShadows: false, ambient: false, weather: 0.5, site: 0.4 },
  medium: { pixelRatio: 1.5, shadowMap: 2048, fx: "film", ao: false, ibl: true, studioEnv: true, bevelSegments: 1, textures: 1, textureSize: 256, foliage: 1, cheapPlants: false, grass: 1, detail: 1, contactShadows: true, aoQuality: "medium", aoHalfRes: true, shadowSoft: 0.06, shadowTight: false, smaa: "medium", pointLights: 99, pointShadows: true, ambient: true, weather: 1, site: 1 },
  high: { pixelRatio: 1.75, shadowMap: 4096, fx: "film", ao: true, ibl: true, studioEnv: true, bevelSegments: 2, textures: 2, textureSize: 512, foliage: 1.8, cheapPlants: false, grass: 1.6, detail: 2, contactShadows: true, aoQuality: "high", aoHalfRes: true, shadowSoft: 0.08, shadowTight: false, smaa: "high", pointLights: 99, pointShadows: true, ambient: true, weather: 1, site: 1 },
  ultra: { pixelRatio: 2, shadowMap: 4096, fx: "film", ao: true, ibl: true, studioEnv: true, bevelSegments: 3, textures: 2, textureSize: 1024, foliage: 2.6, cheapPlants: false, grass: 2.2, detail: 2, contactShadows: true, aoQuality: "ultra", aoHalfRes: false, shadowSoft: 0.1, shadowTight: false, smaa: "ultra", pointLights: 99, pointShadows: true, ambient: true, weather: 1, site: 1 },
};

export const knobsOf = (tier: Tier): Knobs => TIERS[tier];
export const lowerTier = (tier: Tier): Tier => TIER_ORDER[Math.max(0, TIER_ORDER.indexOf(tier) - 1)];
/** The lighter of two tiers. */
export const lighterTier = (a: Tier, b: Tier): Tier => (TIER_ORDER.indexOf(a) <= TIER_ORDER.indexOf(b) ? a : b);
/** What a device nobody has measured starts on. */
const DEFAULT_DEVICE: DeviceClass = { tier: "high", reasons: [] };
export type QualityChoice = "auto" | Tier;

/** What picking a choice in the panel does: Automatic goes back to the device's own tier and lets the governor work, a tier is the owner's and stays. */
export const chosen = (choice: QualityChoice, device: DeviceClass): { tier: Tier; manual: boolean } => (choice === "auto" ? { tier: device.tier, manual: false } : { tier: choice, manual: true });

/** A new reading of the device: the owner's tier stays, an automatic one is never heavier than the device allows. */
export const withDevice = (s: { tier: Tier; manual: boolean }, device: DeviceClass): { device: DeviceClass; tier: Tier } => ({ device, tier: s.manual ? s.tier : lighterTier(s.tier, device.tier) });

/** The saved tier at load: nothing usable saved = the device's own; an automatic one is lowered to what the device allows (a Pi that once ran "Detailed" does not start there). */
export function restored(saved: { tier?: unknown; manual?: unknown } | null | undefined, device: DeviceClass): { tier: Tier; manual: boolean } | null {
  const tier = saved?.tier;
  if (typeof tier !== "string" || !(TIER_ORDER as readonly string[]).includes(tier)) return null;
  const manual = saved?.manual === true;
  return { manual, tier: manual ? (tier as Tier) : lighterTier(tier as Tier, device.tier) };
}

type QualityState = {
  tier: Tier;
  /** true once the owner picked a tier by hand: the automatic frame-time governor then never changes it. */
  manual: boolean;
  /** What this device is and the tier Automatic starts from (never persisted: it is read from the device each time). */
  device: DeviceClass;
  setTier: (tier: Tier, manual?: boolean) => void;
  /** The settings panel / palette: "auto" restarts the governor from the device's tier, a tier is the owner's own choice. */
  choose: (choice: QualityChoice) => void;
  /** The graphics chip's name arrived (first GL context): classify again, and step an untouched automatic tier down if the chip is a small one. */
  learnRenderer: (renderer: string | undefined) => void;
};

const browserDevice = (renderer?: string): DeviceClass => (typeof window === "undefined" ? DEFAULT_DEVICE : classifyDevice(readSignals(renderer)));

/** Automatic starts from what the device is (a Raspberry Pi starts on Eco, a phone on Light, a desktop on Detailed); the governor (components/scene/QualityGovernor.tsx)
 *  steps down when frames are slow unless the owner chose the tier. Persisted per device; a saved automatic tier that is heavier than the device allows is lowered at load. */
export const useQuality = create<QualityState>()(
  persist(
    (set, get) => {
      const device = browserDevice();
      return {
        tier: device.tier,
        manual: false,
        device,
        setTier: (tier, manual = true) => set({ tier, manual }),
        choose: (choice) => set(chosen(choice, get().device)),
        learnRenderer: (renderer) => set(withDevice(get(), browserDevice(renderer))),
      };
    },
    {
      name: "housey-quality",
      version: 1,
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({ tier: s.tier, manual: s.manual }),
      merge: (saved, current) => ({ ...current, ...restored(isRecord(saved) ? saved : null, current.device) }),
    },
  ),
);

/** The browser's graphics chip, from the live context (called once per canvas). */
export function reportRenderer(gl: WebGLRenderingContext | WebGL2RenderingContext) {
  useQuality.getState().learnRenderer(readRenderer(gl));
}

/** The knobs of the current tier, as a hook. */
export const useKnobs = (): Knobs => TIERS[useQuality((s) => s.tier)];
