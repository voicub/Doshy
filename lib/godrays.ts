// God rays: sunlight made visible in the air where a window, a door or a cut-away wall lets it through (the three-good-godrays pass, components/scene/Godrays.tsx).
// This module is the pure part: which mode a tier and a choice give, what each mode spends, and how strongly the sky lets the sun show. No browser, no three.
export type GodraysMode = "off" | "soft" | "rich";
/** What the owner picked: Automatic (the tier's own default) or a mode. */
export type GodraysChoice = "auto" | GodraysMode;

export const GODRAYS_MODES: readonly GodraysMode[] = ["off", "soft", "rich"];
export const GODRAYS_CHOICES: readonly GodraysChoice[] = ["auto", ...GODRAYS_MODES];
export const GODRAYS_LABEL: Record<GodraysChoice, string> = { auto: "Automatic", off: "Off", soft: "Soft", rich: "Rich" };

export const isGodraysChoice = (v: unknown): v is GodraysChoice => typeof v === "string" && (GODRAYS_CHOICES as readonly string[]).includes(v);

/**
 * The mode in force. It needs the film post stack (the pass reads the scene depth and runs between the render and the tone map), so Eco and Light never have it.
 * Automatic means the tier's own default, and none on a computer that draws in software (the raymarch would cost most of its frame time); a mode the owner picked is theirs.
 */
export function resolveGodrays(base: GodraysMode, fx: "film" | "lite" | "none", software: boolean, choice: GodraysChoice): GodraysMode {
  if (fx !== "film") return "off";
  if (choice !== "auto") return choice;
  return software ? "off" : base;
}

/**
 * What a mode spends per frame. The raymarch takes one step every `stepSize` metres of ray inside the volume (never fewer than `minSteps` or more than `maxSteps`), so a short
 * ray costs little; `resolutionScale` is the share of the screen's size the rays are computed at; `sharpUpsample` the 4x4 (instead of 2x2) depth-aware upscale to full size.
 */
export const GODRAYS_COST: Record<Exclude<GodraysMode, "off">, { stepSize: number; minSteps: number; maxSteps: number; resolutionScale: number; sharpUpsample: boolean }> = {
  soft: { stepSize: 0.4, minSteps: 6, maxSteps: 24, resolutionScale: 0.4, sharpUpsample: false },
  rich: { stepSize: 0.15, minSteps: 12, maxSteps: 64, resolutionScale: 0.6, sharpUpsample: true },
};

/** Density of the lit air per metre of ray, before the sky's strength: a few metres of sunlit air in a room reach a visible haze. */
const BASE_DENSITY = 1 / 70;
/** Brightness cap of the rays at full strength (mixed into the picture towards the sun's colour). */
const MAX_DENSITY = 0.18;

/** Air this far past the building's walls (m) is still inside the volume (where the rays have faded to nothing): the sun streams in through windows, doors and low walls from just outside. */
const VOLUME_MARGIN = 3;
/** Above the top storey's ceiling (m): the beams that fall through the open top of the building. */
const VOLUME_HEADROOM = 2.5;
/** The rays thin out over this many metres towards the volume's sides and top, so its edge never shows. */
const VOLUME_FEATHER = 3;

/** The box of air (world metres: x east, y up, z south) in which sunbeams are made visible: the building's footprint with a margin, from the ground to above the top storey, with the width of the soft edge. `ceiling` is the top storey's ceiling height. */
export function godraysVolume(b: { x0: number; y0: number; x1: number; y1: number }, ceiling: number): { min: [number, number, number]; max: [number, number, number]; feather: number } {
  return { min: [b.x0 - VOLUME_MARGIN, 0, b.y0 - VOLUME_MARGIN], max: [b.x1 + VOLUME_MARGIN, ceiling + VOLUME_HEADROOM, b.y1 + VOLUME_MARGIN], feather: VOLUME_FEATHER };
}

const smooth = (a: number, b: number, x: number): number => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/**
 * How much of the sun shows as rays, 0..1, from the live sky: none at night (the light then is the moon, whose rays would only haze the picture), full at dusk and
 * morning when the sun is low and the beams long, weaker with the sun overhead (the beams then fall steeply through the window and are short), fading out with cloud:
 * under an overcast sky there is no direct sun to see.
 * `sunY` is the sun's elevation as sin(angle) (0 horizon .. 1 overhead), `daylight` 0 night .. 1 day (0.5 dusk), `cloud` 0 clear .. 1 overcast.
 */
export function godraysStrength(sky: { sunY: number; daylight: number; cloud: number }): number {
  const day = smooth(0.2, 0.45, sky.daylight);
  const clear = 1 - smooth(0.15, 0.85, sky.cloud);
  const low = 1 - 0.45 * smooth(0.3, 0.95, sky.sunY);
  return day * clear * low;
}

/** The strength in sixteenths: the pass is told again only when this changes (a creeping sun must not rewrite its settings every frame). */
export const STRENGTH_STEPS = 16;
export const quantizeStrength = (s: number): number => Math.round(Math.min(1, Math.max(0, s)) * STRENGTH_STEPS) / STRENGTH_STEPS;

/** The pass's own numbers for a mode at a given (quantized) strength. */
export function godraysParams(mode: Exclude<GodraysMode, "off">, strength: number) {
  const c = GODRAYS_COST[mode];
  return { adaptiveSteps: { stepSize: c.stepSize, minSteps: c.minSteps, maxSteps: c.maxSteps }, resolutionScale: c.resolutionScale, sharpUpsample: c.sharpUpsample, density: BASE_DENSITY * strength, maxDensity: MAX_DENSITY * strength };
}
