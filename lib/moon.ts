/** The moon: its phase for a date (computed) or from Home Assistant's moon sensor, and how much light it gives at night. Pure. */

export const MOON_NAMES = ["new_moon", "waxing_crescent", "first_quarter", "waxing_gibbous", "full_moon", "waning_gibbous", "last_quarter", "waning_crescent"] as const;
export type MoonName = (typeof MOON_NAMES)[number];

export const MOON_LABEL: Record<MoonName, string> = {
  new_moon: "New moon",
  waxing_crescent: "Growing crescent",
  first_quarter: "First quarter",
  waxing_gibbous: "Growing moon",
  full_moon: "Full moon",
  waning_gibbous: "Shrinking moon",
  last_quarter: "Last quarter",
  waning_crescent: "Fading crescent",
};

export type Moon = {
  /** 0..1 through the 29.5 day cycle: 0 new, 0.25 first quarter, 0.5 full, 0.75 last quarter */
  phase: number;
  /** 0..1 share of the disc that is lit */
  illumination: number;
  name: MoonName;
};

const SYNODIC_DAYS = 29.530588853;
/** A known new moon: 2000-01-06 18:14 UTC. The mean cycle drifts from the real moon by about half a day at most. */
const NEW_MOON_EPOCH_MS = Date.UTC(2000, 0, 6, 18, 14);
const DAY_MS = 86400000;

const illuminationOf = (phase: number) => (1 - Math.cos(2 * Math.PI * phase)) / 2;

/** The eight named phases, each centred on its own eighth of the cycle (new moon wraps around 0). */
export const nameOf = (phase: number): MoonName => MOON_NAMES[Math.round(phase * 8) % 8];

/** The moon for an instant, from the mean synodic cycle. */
export function moonPhase(date: Date): Moon {
  const cycles = (date.getTime() - NEW_MOON_EPOCH_MS) / (SYNODIC_DAYS * DAY_MS);
  const phase = cycles - Math.floor(cycles);
  return { phase, illumination: illuminationOf(phase), name: nameOf(phase) };
}

/** A phase named by Home Assistant's moon sensor (`new_moon`, `waxing_gibbous`, ...), or undefined for anything else (unavailable, unknown). */
export function moonFromName(state: string): Moon | undefined {
  const i = MOON_NAMES.findIndex((n) => n === state);
  if (i < 0) return undefined;
  const phase = i / 8;
  return { phase, illumination: illuminationOf(phase), name: MOON_NAMES[i] };
}

/**
 * How much the night's moonlight is scaled for a lit share: a new moon leaves a dim floor (the scene is never black),
 * a half moon is the look the night was tuned for, a full moon is clearly brighter.
 */
export const moonGain = (illumination: number): number => 0.6 + 0.8 * Math.min(1, Math.max(0, illumination));

/** SVG path of the lit part of the moon's disc (radius `r`, centred on 0,0), lit on the right while it grows and on the left while it shrinks (as seen from the northern hemisphere). */
export function moonDiscPath(phase: number, r: number): string {
  const right = phase < 0.5;
  const k = Math.cos(2 * Math.PI * phase); // 1 new .. -1 full: how far the day/night line bulges
  const edge = right ? 1 : 0;
  const line = (k > 0) === right ? 0 : 1;
  const rx = Math.abs(k) * r;
  return `M0 ${-r}A${r} ${r} 0 0 ${edge} 0 ${r}A${rx} ${r} 0 0 ${line} 0 ${-r}Z`;
}
