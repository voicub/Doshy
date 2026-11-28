/**
 * The garden's year as one continuous curve instead of four steps. Pure: no React, no three.js, so it runs under `node --test`.
 *
 * `yearPhase` turns a date into 0..1 (the hemisphere already applied: the southern half of the world is shifted by half a year, so every
 * curve below is written once, for the north). `yearLook` then answers, for that phase, what the garden shows: how full the deciduous canopy
 * is, how far its leaves have turned, blossom, leaves in the air and on the ground, the lawn's growth and colour, and snow cover.
 * It changes by the day, so the scene reads it once per day and never per frame.
 */
import { SEASONS, seasonPalette, type Season, type SeasonBlend, type SeasonPalette } from "./season.ts";

const DAYS = 365;
const DAY_MS = 86_400_000;

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const smooth = (a: number, b: number, x: number) => {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};

/** Local calendar day of the year, 0 for 1 January (the time of day does not matter: the garden changes once a day). */
export function dayOfYear(date: Date): number {
  const start = Date.UTC(date.getFullYear(), 0, 1);
  return Math.round((Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) - start) / DAY_MS);
}

/**
 * 0..1 position in the year, middle of the local day, shifted by half a year south of the equator: 0 is mid-winter's start in the north,
 * and a Bucharest 1 July and a Sydney 1 January land on the same phase (about 0.5, high summer).
 */
export function yearPhase(date: Date, lat: number): number {
  const base = (dayOfYear(date) + 0.5) / DAYS;
  return (lat < 0 ? base + 0.5 : base) % 1;
}

/** The date of day number `day` (0 = 1 January) of `year`, at the time of day of `clock`: the preview slider's date, so the sun stands where it does now on that day. */
export const dateOfDay = (year: number, day: number, clock: Date): Date => new Date(year, 0, 1 + day, clock.getHours(), clock.getMinutes(), clock.getSeconds());

// ---------------------------------------------------------------- the season ring

/**
 * Where on the ring spring(0) summer(1) autumn(2) winter(3) spring(4) ... a day stands, as [day, position] anchors joined by straight lines.
 * The lawn greens through March and April, is at its summer best on 1 July, turns golden in late summer and is autumn by the end of October.
 */
const LAWN_RING: readonly (readonly [number, number])[] = [[0, 3], [60, 3], [110, 4], [182, 5], [237, 5.3], [293, 6], [335, 7], [365, 7]];
/** Leaves turn later than the lawn: green until the third week of September, then yellow, orange and brown by the first of December. */
const LEAF_RING: readonly (readonly [number, number])[] = [[0, 3], [85, 3], [120, 4], [155, 5], [262, 5], [285, 5.5], [305, 6], [335, 7], [365, 7]];

function along(anchors: readonly (readonly [number, number])[], day: number): number {
  const i = anchors.findIndex(([d]) => d > day);
  if (i <= 0) return anchors[i < 0 ? anchors.length - 1 : 0][1];
  const [d0, v0] = anchors[i - 1], [d1, v1] = anchors[i];
  return v0 + ((v1 - v0) * (day - d0)) / (d1 - d0);
}

/** A position on the ring as the season blend the palettes already understand. */
export function ringBlend(pos: number): SeasonBlend {
  const whole = Math.floor(pos + 1e-9);
  const season = SEASONS[((whole % 4) + 4) % 4];
  return { season, next: SEASONS[(SEASONS.indexOf(season) + 1) % 4], mix: Math.round(clamp01(pos - whole) * 1000) / 1000 };
}

// ---------------------------------------------------------------- the curves

/** 0..1 how full the deciduous canopy is: bare to mid April, buds opening to the third week of May, full to early October, bare again by late November. */
export const canopyFullness = (day: number) => smooth(100, 145, day) * (1 - smooth(280, 325, day));
/** 0..1 blossom on fruit trees and shrubs: out from mid April to the first week of May, before the leaves are full. */
export const blossomAt = (day: number) => smooth(95, 108, day) * (1 - smooth(112, 128, day));
/** 0..1 how many leaves are in the air: the weeks the canopy is dropping them. */
export const leafFallAt = (day: number) => smooth(268, 292, day) * (1 - smooth(318, 345, day));
/** 0..1 how deep the fallen leaves lie: piling up from mid October, kept through the winter, raked and rotted away by April. */
export const leafPileAt = (day: number) => (day >= 180 ? smooth(285, 325, day) : 1 - smooth(45, 100, day));
/** 0..1 how old the fallen leaves are (fresh orange in November, brown by midwinter). */
export const leafPileAge = (day: number) => (day >= 180 ? smooth(300, 365, day) : 1);
/** 0.55..1 how thick the lawn stands: thin after the winter, full from late spring, thinning again as the cold comes. */
export const lawnGrowthAt = (day: number) => (day < 200 ? 0.55 + 0.45 * smooth(50, 140, day) : 1 - 0.45 * smooth(290, 345, day));

/** 0..1 the cold part of the year as a wide window (late October to early April): temperature decides within it when the weather is known. */
const coldWindow = (day: number) => (day < 200 ? 1 - smooth(70, 110, day) : smooth(305, 340, day));
/** The calendar's own snow season (December to February) for a home whose weather is unknown. */
const snowWindow = (day: number) => (day < 200 ? 1 - smooth(52, 70, day) : smooth(325, 340, day));

/**
 * 0..1 snow lying on the garden. With a temperature (the linked weather entity) it is cold weather inside the cold season: frost at or below -1 C
 * keeps snow, +4 C or more melts it. Without one it follows the calendar's winter, thinning toward the tropics (none under 28 degrees of latitude).
 */
export function lyingSnow(day: number, lat: number, tempC?: number): number {
  if (tempC !== undefined && Number.isFinite(tempC)) return clamp01((4 - tempC) / 5) * coldWindow(day);
  return snowWindow(day) * clamp01((Math.abs(lat) - 28) / 14);
}

// ---------------------------------------------------------------- the look

export type YearLook = {
  /** 0..1 position in the year with the hemisphere applied (see yearPhase) */
  phase: number;
  /** the lawn, shrub and conifer palette's place on the season ring */
  palette: SeasonBlend;
  /** the deciduous leaf colour's place on the ring (it turns later than the lawn) */
  leaf: SeasonBlend;
  /** canopy fullness, blossom, leaves in the air and on the ground, lawn thickness, all 0..1 (lawn 0.55..1) */
  leafy: number;
  blossom: number;
  falling: number;
  pile: number;
  pileAge: number;
  growth: number;
  /** snow lying on ground and branches: the season's own, the weather's wet snow comes on top of it (see FoliageDriver) */
  snow: number;
};

/** The garden on `phase`: the northern day the phase stands for, `snow` as decided by lyingSnow. */
export function yearLook(phase: number, snow: number): YearLook {
  const day = ((phase % 1) + 1) % 1 * DAYS;
  return {
    phase,
    palette: ringBlend(along(LAWN_RING, day)),
    leaf: ringBlend(along(LEAF_RING, day)),
    leafy: canopyFullness(day),
    blossom: blossomAt(day),
    falling: leafFallAt(day),
    pile: leafPileAt(day),
    pileAge: leafPileAge(day),
    growth: lawnGrowthAt(day),
    snow: Math.round(clamp01(snow) * 20) / 20, // in 5% steps: a temperature drifting by a hundredth of a degree must not repaint the garden
  };
}

/** The garden on `date` at a home on latitude `lat`, with the weather's temperature when it is known (it decides where snow lies). */
export function yearAt(date: Date, lat: number, tempC?: number): YearLook {
  const phase = yearPhase(date, lat);
  return yearLook(phase, lyingSnow(phase * DAYS, lat, tempC));
}

/** What a season chosen by hand looks like: the palette exactly as the four-step garden had it, the curves at that season's typical values. */
const FORCED: Record<Season, { day: number; leafy: number; blossom: number; falling: number; pile: number; snow: number }> = {
  spring: { day: 118, leafy: 0.85, blossom: 1, falling: 0, pile: 0.03, snow: 0 },
  summer: { day: 200, leafy: 1, blossom: 0, falling: 0, pile: 0.03, snow: 0 },
  autumn: { day: 300, leafy: 0.75, blossom: 0, falling: 1, pile: 1, snow: 0 },
  winter: { day: 15, leafy: 0, blossom: 0, falling: 0, pile: 0.3, snow: 1 },
};

/** The garden in `season`, by hand from the HUD. */
export function forcedYear(season: Season): YearLook {
  const f = FORCED[season];
  const here = ringBlend(SEASONS.indexOf(season));
  return { ...yearLook((f.day + 0.5) / DAYS, f.snow), palette: here, leaf: here, leafy: f.leafy, blossom: f.blossom, falling: f.falling, pile: f.pile, snow: f.snow };
}

/** The lawn, shrub and hedge palette the garden, the surroundings' lawn and the petals use: the ring position with this year's snow. */
export const yearPalette = (y: YearLook): SeasonPalette => seasonPalette(y.palette.season, y.palette.mix, y.snow);


/** What the garden is doing, in a few plain words for the date preview. */
export function gardenWords(y: YearLook): string {
  if (y.snow >= 0.5) return "Under snow";
  if (y.leafy < 0.05) return y.pile > 0.4 ? "Bare branches, leaves on the ground" : "Bare branches";
  if (y.blossom > 0.4) return "Blossom out";
  if (y.falling > 0.3) return "Leaves falling";
  if (y.leafy < 0.95) return y.phase < 0.5 ? "Buds opening" : "Last leaves";
  if (y.leaf.season === "autumn" || (y.leaf.season === "summer" && y.leaf.mix > 0.25)) return "Leaves turning";
  return y.palette.season === "summer" && y.palette.mix > 0.2 ? "Lawn going golden" : "Green and full";
}
