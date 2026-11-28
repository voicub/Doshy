// Wall display: settings and the small pure rules around them (night dimming, burn-in pixel shift). The slide scheduler is lib/rotation.ts; the store that
// persists the settings is lib/wallStore.ts. Pure; the node test runner loads this file directly.
import { isRecord } from "./guards.ts";

/** Window events: the wall display started or stopped (`detail: { running: boolean }`, for the 3D view to pause drawing on the opaque slides); asking to try it now. */
export const WALL_EVENT = "housey:wall";
export const WALL_TRY_EVENT = "housey:wall-try";

/** What a wall display can show, in the order it shows them. */
export const SLIDE_KINDS = ["overview", "rooms", "clock", "house", "sky", "advisor"] as const;
export type SlideKind = (typeof SLIDE_KINDS)[number];
export const SLIDE_LABEL: Record<SlideKind, string> = { overview: "The whole home, turning slowly", rooms: "A tour of the rooms", clock: "Clock and weather", house: "House now", sky: "Tonight’s sky", advisor: "Advisor Today" };

/** Seconds a slide stays (a room never stays shorter than 8 or longer than 12: see lib/rotation.ts). */
export const SECONDS_CHOICES: readonly number[] = [8, 12, 20, 30, 60];
/** Minutes without a touch before it starts; 0 = always on: it starts at once and comes back a minute after each touch. */
export const START_CHOICES: readonly number[] = [0, 1, 2, 5, 15];
const MAX_START_MINUTES = 240;

export type WallSettings = {
  on: boolean;
  kinds: SlideKind[];
  secs: number;
  startMin: number;
  /** Darken the screen when the sun is down (a bright wall in a dark bedroom). */
  dim: boolean;
  /** Move the picture by a few pixels every minute, so a fixed clock never burns into the panel. */
  shift: boolean;
};
export const WALL_DEFAULTS: WallSettings = { on: false, kinds: ["overview", "rooms", "clock", "house"], secs: 20, startMin: 2, dim: true, shift: true };

/** Keeps only valid values from whatever was stored; anything else falls back to the default. The kinds keep the fixed order and never repeat. */
export function cleanWall(raw: unknown): WallSettings {
  const r = isRecord(raw) ? raw : {};
  const stored: unknown[] | null = Array.isArray(r.kinds) ? r.kinds : null;
  const kinds = stored ? SLIDE_KINDS.filter((k) => stored.includes(k)) : WALL_DEFAULTS.kinds;
  const secs = typeof r.secs === "number" && Number.isFinite(r.secs) ? Math.min(300, Math.max(5, Math.round(r.secs))) : WALL_DEFAULTS.secs;
  const startMin = typeof r.startMin === "number" && Number.isFinite(r.startMin) && r.startMin >= 0 ? Math.min(MAX_START_MINUTES, r.startMin) : WALL_DEFAULTS.startMin;
  return {
    on: typeof r.on === "boolean" ? r.on : WALL_DEFAULTS.on,
    kinds: [...kinds],
    secs,
    startMin,
    dim: typeof r.dim === "boolean" ? r.dim : WALL_DEFAULTS.dim,
    shift: typeof r.shift === "boolean" ? r.shift : WALL_DEFAULTS.shift,
  };
}

/** How long to wait with no touch before the wall display starts; "always on" waits a minute after a touch. */
export const startMs = (s: WallSettings): number => Math.round(Math.max(1, s.startMin) * 60_000);

const MAX_DIM = 0.55;
/** The darkening (0..1 opacity of a black cover) for the sky's daylight (0 night .. 1 day, lib/sky.ts): none in daylight, the full amount once the sun is well down, smooth between. */
export function nightDim(daylight: number): number {
  if (!Number.isFinite(daylight)) return 0;
  const t = Math.min(1, Math.max(0, daylight / 0.35));
  return Math.round(MAX_DIM * (1 - t * t * (3 - 2 * t)) * 1000) / 1000;
}

/** Where the picture sits (px) in minute number `minute`: a slow walk round a few spots, never more than 4 px from the middle. Every spot comes round again, so nothing sits on one place for long. */
const SPOTS: readonly { x: number; y: number }[] = [
  { x: 0, y: 0 }, { x: 3, y: 1 }, { x: 4, y: -2 }, { x: 1, y: -4 }, { x: -2, y: -3 }, { x: -4, y: 0 }, { x: -3, y: 3 }, { x: 0, y: 4 }, { x: 3, y: 3 },
];
export function pixelShift(minute: number): { x: number; y: number } {
  const n = SPOTS.length;
  return SPOTS[((Math.floor(minute) % n) + n) % n];
}
