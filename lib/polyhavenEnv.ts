// "Studio light from a real sky": the pure side of using a Poly Haven HDRI as the scene's image based light (docs/polyhaven.md). The saved setting and how it is scrubbed,
// where the sun is in a picture, how the picture is turned to put that sun where the app's sun is, and how strong it lights. The render side is
// components/scene/HdriEnv.tsx; the store is lib/lightingStore.ts. The node test runner loads this file directly: .ts import extensions, no React, no browser globals.
import { isRecord } from "./guards.ts";
import { isAssetId, type HdriRes } from "./polyhaven.ts";

/** Where the sun is in the picture, in the picture's own frame (see `sunDirection`): radians. */
export type PictureSun = { azimuth: number; elevation: number };

/** What is saved, once per device (`housey-lighting`). `null` anywhere means "the built-in light". */
export type HdriSetting = {
  /** The stored file ('hdri-<24 hex>', lib/polyhavenClient.ts keepAsResource): used from then on, so a device without internet keeps it. */
  resourceId: string;
  /** Which Poly Haven picture it is: only used to fetch it again when the stored file went missing. */
  assetId: string;
  name: string;
  authors: string[];
  /** The line shown under the picker. */
  credit: string;
  res: HdriRes;
  /** 0.2 .. 2: 1 is "as bright as designed". */
  intensity: number;
  /** Degrees, -180 .. 180: turns the sky around the building. */
  rotation: number;
  /** Studio view only: the sky behind the building, not just in its reflections. */
  background: boolean;
  /** Turn the picture so its sun stands where the app's sun does. */
  matchSun: boolean;
  /** Also use it for reflections in the Live (garden) view, dimmed by daylight. */
  alsoLive: boolean;
  /** Found once from the pixels when "match the sun" first needs it: undefined = not looked yet, null = the picture has no clear sun. */
  sun?: PictureSun | null;
};

export const INTENSITY_RANGE = { min: 0.2, max: 2, def: 1 } as const;
export const ROTATION_RANGE = { min: -180, max: 180 } as const;

const RESOURCE_RE = /^hdri-[0-9a-f]{24}$/;
const TEXT_RE = /[\u0000-\u001f\u007f<>`"\\]/g;
const text = (v: unknown, max: number): string => (typeof v === "string" ? v.replace(TEXT_RE, " ").replace(/\s+/g, " ").trim().slice(0, max) : "");
const clampNum = (v: unknown, min: number, max: number, def: number): number => (typeof v === "number" && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : def);
const bool = (v: unknown, def: boolean): boolean => (typeof v === "boolean" ? v : def);

/** The credit line shown under the picker (Poly Haven asks for a visible credit wherever its pictures are used). */
export const lightingCredit = (name: string): string => `Lighting by ${name}, Poly Haven (CC0)`;

function sanitizeSun(v: unknown): PictureSun | null | undefined {
  if (v === null) return null;
  if (!isRecord(v)) return undefined;
  const { azimuth, elevation } = v;
  if (typeof azimuth !== "number" || typeof elevation !== "number" || !Number.isFinite(azimuth) || !Number.isFinite(elevation)) return undefined;
  return { azimuth: wrapRad(azimuth), elevation: Math.min(Math.PI / 2, Math.max(-Math.PI / 2, elevation)) };
}

/** Whatever was stored (any version, hand-edited, hostile) -> a valid setting or null. Nothing here is trusted: ids are shape checked, numbers clamped, text cleaned. */
export function sanitizeHdri(raw: unknown): HdriSetting | null {
  if (!isRecord(raw)) return null;
  const { resourceId, assetId } = raw;
  if (typeof resourceId !== "string" || !RESOURCE_RE.test(resourceId) || !isAssetId(assetId)) return null;
  const name = text(raw.name, 80) || assetId;
  const authors = Array.isArray(raw.authors) ? raw.authors.map((a) => text(a, 60)).filter(Boolean).slice(0, 6) : [];
  const sun = sanitizeSun(raw.sun);
  return {
    resourceId,
    assetId,
    name,
    authors,
    credit: text(raw.credit, 160) || lightingCredit(name),
    res: raw.res === "2k" ? "2k" : "1k",
    intensity: clampNum(raw.intensity, INTENSITY_RANGE.min, INTENSITY_RANGE.max, INTENSITY_RANGE.def),
    rotation: clampNum(raw.rotation, ROTATION_RANGE.min, ROTATION_RANGE.max, 0),
    background: bool(raw.background, false),
    matchSun: bool(raw.matchSun, false),
    alsoLive: bool(raw.alsoLive, false),
    ...(sun !== undefined ? { sun } : {}),
  };
}

// ---- strength ----------------------------------------------------------------------------------------------------------------

/** What "1" means: the built-in sky lights at about half of a raw HDRI's strength, and a raw one washes the sun's shadows out (tuned against the procedural sky). */
const STUDIO_BASE = 0.5;
/** Live reflections are a hint, not the light: the sun, sky and weather of the Live view stay in charge. */
const LIVE_BASE = 0.25;

/**
 * How strong the picture lights (`scene.environmentIntensity`). The Studio view is a lit stage: the slider alone decides, whatever the hour.
 * The Live (garden) view follows the real sky: the picture is dimmed by daylight (0 night .. 1 day, lib/sky.ts `daylightOf`), so night stays dark.
 */
export const hdriGain = (intensity: number, studio: boolean, daylight: number): number => {
  const k = Math.min(INTENSITY_RANGE.max, Math.max(INTENSITY_RANGE.min, Number.isFinite(intensity) ? intensity : INTENSITY_RANGE.def));
  return studio ? k * STUDIO_BASE : k * LIVE_BASE * Math.min(1, Math.max(0, Number.isFinite(daylight) ? daylight : 0));
};

/** What the scene does for a setting: nothing (`null`), or light from the picture in the Studio view or (opt-in) the Live view. Eco and Light (`ibl` false) never do. */
export const hdriMode = (s: HdriSetting | null, ibl: boolean, studio: boolean): "studio" | "live" | null => (!s || !ibl ? null : studio ? "studio" : s.alsoLive ? "live" : null);

// ---- turning the picture ------------------------------------------------------------------------------------------------------

/** Wrap an angle to (-pi, pi]. */
export const wrapRad = (a: number): number => {
  if (!Number.isFinite(a)) return 0;
  const t = a % (2 * Math.PI);
  return t > Math.PI ? t - 2 * Math.PI : t <= -Math.PI ? t + 2 * Math.PI : t;
};

/**
 * Frame of an equirectangular picture, the one three.js samples it in: direction (x, y, z) sits at u = atan2(z, x) / 2pi + 0.5 across and v = asin(y) / pi + 0.5 up.
 * Here `azimuth` is atan2(z, x) in radians, so a picture's sun and the app's sun (x east, y up, -z north in the plan frame) are compared in the same way.
 */
export const azimuthOf = (x: number, z: number): number => Math.atan2(z, x);

/** The unit direction a picture's sun points at in its own frame. */
export const sunDirection = (s: PictureSun): { x: number; y: number; z: number } => ({ x: Math.cos(s.azimuth) * Math.cos(s.elevation), y: Math.sin(s.elevation), z: Math.sin(s.azimuth) * Math.cos(s.elevation) });

/**
 * The angle (radians) to put in `scene.environmentRotation.y` so the picture's sun lands where the app's sun is. three.js turns the content of the sky by +angle around Y, which moves
 * a direction's azimuth by -angle, hence picture minus target. `appSun` is the light's direction in the plan frame (components/scene/skyLive.ts `sunDir`); straight overhead has no azimuth: 0.
 */
export function sunMatchRotation(picture: PictureSun, appSun: { x: number; z: number }): number {
  if (Math.hypot(appSun.x, appSun.z) < 1e-3) return 0;
  return wrapRad(picture.azimuth - azimuthOf(appSun.x, appSun.z));
}

/** The full turn of the sky (radians, around Y): the owner's slider plus, when asked and a sun was found, the turn that aligns the suns. */
export function hdriRotation(s: Pick<HdriSetting, "rotation" | "matchSun" | "sun">, appSun: { x: number; z: number }): number {
  const manual = (s.rotation * Math.PI) / 180;
  return s.matchSun && s.sun ? wrapRad(manual + sunMatchRotation(s.sun, appSun)) : manual;
}

// ---- finding the sun in the pixels ----------------------------------------------------------------------------------------------

/** A sun has to be this many times brighter (as a small patch) than the picture's average to count as one: an overcast sky or a plain studio never gets there. */
export const SUN_CONTRAST = 12;
/** Below this the "sun" is the horizon glow, which is not a direction to face. */
export const SUN_MIN_ELEVATION = (5 * Math.PI) / 180;
/** Patches are about 1/256 of the picture's width: big enough that one hot pixel is not a sun, small enough that a real sun is a whole patch. */
const PATCHES_ACROSS = 256;

/**
 * Where the brightest sun-like spot of an equirectangular picture is, or null when there is none. `data` is RGBA, `rows` top to bottom as in the file (the top row looks up);
 * `decode` turns a stored number into a float (half-float pictures: three's `DataUtils.fromHalfFloat`). A spot counts when it stands at least `SUN_CONTRAST` times above the
 * picture's average brightness (averaged by the solid angle each row covers) and above `SUN_MIN_ELEVATION`. The picture is judged in patches, then the brightest pixel of the
 * best patch is the sun.
 */
export function findSun(data: ArrayLike<number>, width: number, height: number, decode: (v: number) => number = (v) => v): PictureSun | null {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 8 || height < 4 || data.length < width * height * 4) return null;
  const luma = (i: number): number => {
    const r = decode(data[i]);
    const g = decode(data[i + 1]);
    const b = decode(data[i + 2]);
    const y = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    return y > 0 ? y : 0; // NaN and negatives count as dark
  };
  const patch = Math.max(2, Math.round(width / PATCHES_ACROSS));
  const elevationAt = (y: number): number => (0.5 - (y + 0.5) / height) * Math.PI;
  let sum = 0;
  let weights = 0;
  let best = { mean: 0, x: 0, y: 0 };
  for (let y0 = 0; y0 + patch <= height; y0 += patch) {
    const centre = elevationAt(y0 + patch / 2);
    const w = Math.cos(centre);
    for (let x0 = 0; x0 + patch <= width; x0 += patch) {
      let patchSum = 0;
      for (let y = y0; y < y0 + patch; y++) for (let x = x0; x < x0 + patch; x++) patchSum += luma((y * width + x) * 4);
      const mean = patchSum / (patch * patch);
      sum += mean * w;
      weights += w;
      if (centre >= SUN_MIN_ELEVATION && mean > best.mean) best = { mean, x: x0, y: y0 };
    }
  }
  const average = weights > 0 ? sum / weights : 0;
  if (!(average > 0) || best.mean < average * SUN_CONTRAST) return null;
  let peak = -1;
  let px = best.x;
  let py = best.y;
  for (let y = best.y; y < best.y + patch; y++) {
    for (let x = best.x; x < best.x + patch; x++) {
      const l = luma((y * width + x) * 4);
      if (l > peak) {
        peak = l;
        px = x;
        py = y;
      }
    }
  }
  const elevation = elevationAt(py);
  if (elevation < SUN_MIN_ELEVATION) return null; // the brightest pixel may sit at the patch's lower edge
  return { azimuth: wrapRad(((px + 0.5) / width - 0.5) * 2 * Math.PI), elevation };
}
