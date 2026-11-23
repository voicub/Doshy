// Display settings for small and always-on screens (Raspberry Pi wall display, phone): interface size, wake lock, screensaver. Pure; the node test runner loads this file directly.
// The layout choice (auto / compact / regular) lives in lib/viewport.ts; the store that persists the rest is lib/displayStore.ts.
import { isRecord } from "./guards.ts";

/** Window events: the screensaver started or stopped (`detail: { idle: boolean }`, for the 3D view to pause drawing); asking to open the Display settings; asking for the screensaver now / for waking it. */
export const IDLE_EVENT = "housey:idle";
export const OPEN_DISPLAY_EVENT = "housey:display";
export const SLEEP_EVENT = "housey:sleep";
export const WAKE_EVENT = "housey:wake";

/** How big the interface (not the 3D view) is drawn. "xlarge" is for 1280x800 panels, where a 7 inch screen packs the pixels very tightly. */
export type UiSize = "small" | "normal" | "large" | "xlarge";
export const UI_SIZES: readonly UiSize[] = ["small", "normal", "large", "xlarge"];
export const UI_SIZE_LABEL: Record<UiSize, string> = { small: "Small", normal: "Normal", large: "Large", xlarge: "Extra large" };
const UI_SCALE: Record<UiSize, number> = { small: 0.9, normal: 1, large: 1.25, xlarge: 1.5 };

const isUiSize = (v: unknown): v is UiSize => typeof v === "string" && (UI_SIZES as readonly string[]).includes(v);
/** The zoom factor of the interface for a size choice. */
export const scaleOf = (size: UiSize): number => UI_SCALE[size];

/** The shortest side (in interface pixels) the compact layouts are made for; a bigger interface is held back so it never shrinks the screen below this. */
const MIN_HUD_SIDE = 360;

/** The zoom actually applied on a screen of this size: the chosen one, but never so big that the interface would have fewer than MIN_HUD_SIDE pixels on its short side (a phone at Extra large would be unusable). Shrinking (Small) is never held back. */
export function appliedScale(size: UiSize, width: number, height: number): number {
  const want = scaleOf(size);
  if (want <= 1) return want;
  return Math.max(1, Math.min(want, Math.floor((Math.min(width, height) / MIN_HUD_SIDE) * 100) / 100));
}

/** The screen as the interface sees it: a bigger interface leaves fewer CSS pixels, so the compact layouts must be picked from this, not from the window. */
export function effectiveSize(width: number, height: number, scale: number): { width: number; height: number } {
  const s = scale > 0 ? scale : 1;
  return { width: Math.round(width / s), height: Math.round(height / s) };
}

/** What the screensaver shows after the idle time: a calm clock with the indoor temperature and the next event, or just a dark screen. */
export type SaverStyle = "clock" | "dim";
export const SAVER_STYLES: readonly SaverStyle[] = ["clock", "dim"];
/** Minutes of no touch before the screensaver; 0 = off. */
export const SAVER_CHOICES: readonly number[] = [0, 2, 5, 15, 30];
const KIOSK_SAVER_MINUTES = 15;
const MAX_SAVER_MINUTES = 240;

export type DisplaySettings = {
  size: UiSize;
  /** null = follow the default: on in a kiosk, off elsewhere. */
  wake: boolean | null;
  /** Minutes; null = follow the default: 15 in a kiosk, off elsewhere. */
  saver: number | null;
  style: SaverStyle;
};
export const DISPLAY_DEFAULTS: DisplaySettings = { size: "normal", wake: null, saver: null, style: "clock" };

/** Keeps only valid values from whatever was stored; anything else falls back to the default. */
export function cleanDisplay(raw: unknown): DisplaySettings {
  const r = isRecord(raw) ? raw : {};
  const saver = typeof r.saver === "number" && Number.isFinite(r.saver) && r.saver >= 0 ? Math.min(r.saver, MAX_SAVER_MINUTES) : null;
  return {
    size: isUiSize(r.size) ? r.size : DISPLAY_DEFAULTS.size,
    wake: typeof r.wake === "boolean" ? r.wake : null,
    saver,
    style: SAVER_STYLES.includes(r.style as SaverStyle) ? (r.style as SaverStyle) : DISPLAY_DEFAULTS.style,
  };
}

export const wakeWanted = (s: DisplaySettings, kiosk: boolean): boolean => s.wake ?? kiosk;
export const saverMinutes = (s: DisplaySettings, kiosk: boolean): number => s.saver ?? (kiosk ? KIOSK_SAVER_MINUTES : 0);
export const saverMs = (s: DisplaySettings, kiosk: boolean): number => Math.round(saverMinutes(s, kiosk) * 60_000);
