// Pure: how big a picture of the 3D view may be. The view is drawn again at a higher pixel ratio for the picture (components/ui/snapshotCapture.ts); too big a drawing buffer
// makes the browser lose the graphics context or refuse the canvas, so the size is clamped to what the graphics chip reports and to a total-pixel budget. The node test runner
// loads this file directly, so imports carry a .ts extension.
import type { Knobs, Tier } from "./quality.ts";
import type { Vp } from "./viewport.ts";

/** Sizes offered, as a multiple of the view's CSS size. */
export const SNAPSHOT_SCALES = [1, 2, 4] as const;
export type SnapshotScale = (typeof SNAPSHOT_SCALES)[number];
/** What is pre-selected, everywhere: even a small display stays at 2x or below (the 4x choice carries a warning there). */
export const DEFAULT_SNAPSHOT_SCALE: SnapshotScale = 2;

/** What the graphics context reports (`MAX_TEXTURE_SIZE`, `MAX_RENDERBUFFER_SIZE`, `MAX_VIEWPORT_DIMS`). */
export type GlLimits = { maxTexture: number; maxRenderbuffer: number; maxViewport: readonly [number, number] };

// Total pixels (width x height) of the drawing buffer. iOS Safari refuses canvases above 16.7 M pixels, and every extra pixel costs GPU memory in each buffer of the post stack
// (about 64 bytes per pixel with the full effects), so the full effects get less. A small display (a wall display's Raspberry Pi, a phone) gets what 4x of 800x480 needs and no more.
const BUDGET_CONSTRAINED = 6_500_000;
const BUDGET_FILM = 12_000_000;
const BUDGET_PLAIN = 16_000_000;
/** Used when the context reports a nonsense limit: what every WebGL2 chip supports. */
const SAFE_SIDE = 2048;

/** A small or weak device: the compact layout (a phone, a 7 inch display), a kiosk, or the Eco and Light tiers. Big pictures can run it out of graphics memory. */
export const isConstrained = (d: { tier: Tier; vp: Vp; kiosk: boolean }): boolean => d.vp !== "regular" || d.kiosk || d.tier === "eco" || d.tier === "low";

/** Total-pixel budget of a picture on this device and tier. */
export const pixelBudget = (constrained: boolean, fx: Knobs["fx"]): number => (constrained ? BUDGET_CONSTRAINED : fx === "film" ? BUDGET_FILM : BUDGET_PLAIN);

export type SnapshotSize = {
  /** Pixel ratio to give the renderer: the drawing buffer is floor(view x ratio) (the same arithmetic three.js does). */
  ratio: number;
  width: number;
  height: number;
  /** Smaller than asked for. */
  clamped: boolean;
  /** Why: the graphics chip's limit, or the memory budget (null when not clamped). */
  limit: "gpu" | "memory" | null;
};

const positive = (n: number, fallback: number): number => (Number.isFinite(n) && n > 0 ? n : fallback);

/** The longest side a picture may have: the smallest limit the chip reported (a limit it did not report is assumed to be the safe minimum). */
export const maxSide = (l: GlLimits): number => Math.min(positive(l.maxTexture, SAFE_SIDE), positive(l.maxRenderbuffer, SAFE_SIDE), positive(l.maxViewport[0], SAFE_SIDE), positive(l.maxViewport[1], SAFE_SIDE));

/** The size of a picture at `scale` times the view's CSS size, reduced (keeping the shape) until it fits the chip's limits and the pixel budget. Never zero. */
export function planSnapshotSize(view: { width: number; height: number }, scale: number, limits: GlLimits, budget: number): SnapshotSize {
  const w = positive(view.width, 1);
  const h = positive(view.height, 1);
  const wanted = positive(scale, 1);
  const side = maxSide(limits);
  const byGpu = side / Math.max(w, h);
  const byMemory = Math.sqrt(positive(budget, BUDGET_CONSTRAINED) / (w * h));
  const ratio = Math.min(wanted, byGpu, byMemory);
  const clamped = ratio < wanted;
  return {
    ratio,
    width: Math.max(1, Math.floor(w * ratio)),
    height: Math.max(1, Math.floor(h * ratio)),
    clamped,
    limit: !clamped ? null : byGpu <= byMemory ? "gpu" : "memory",
  };
}
