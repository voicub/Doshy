// Automatic graphics governor: decides when a slow machine should drop one quality tier. Pure (no timers, no browser): the scene feeds it one frame time per
// frame and acts on what it returns. It only ever steps DOWN, one tier at a time, so it cannot flap; the owner's own choice (`manual`) is never touched.
import { lowerTier, type Tier } from "./quality.ts";

export const GOVERNOR = {
  /** Frames are judged in windows of this much wall time, by their median (one hitch or a shader compile cannot trigger a drop). */
  windowMs: 2500,
  /** A window needs at least this many frames to count (a stalled page is not "slow rendering", it is stalled). */
  minFrames: 4,
  /** A median frame slower than this (about 22 fps) makes a window slow. */
  slowMs: 45,
  /** This many slow windows in a row are needed to step down (hysteresis: one bad window, e.g. right after a scene change, is forgiven). */
  slowWindows: 2,
  /** After load, a scene change or a tier change the shaders and textures rebuild: frames in this much time are not judged. */
  settleMs: 4000,
  /** A single frame longer than this was a stalled or hidden tab, not a measurement: dropped. */
  hitchMs: 1000,
} as const;

export const median = (xs: readonly number[]): number => {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

/** What the governor asks for: God rays off (the first thing to go, they are the costliest optional effect), or the next lighter tier. */
export type Step = Tier | "godrays";

export type Governor = {
  /** Feed one frame (ms). `godraysOn`: the picture has God rays, which are shed before the tier is lowered. Returns the step to take, or null to keep things as they are. */
  frame: (ms: number, tier: Tier, manual: boolean, godraysOn?: boolean) => Step | null;
  /** Start over: the scene changed (environment, mode, plan) or the tab came back. */
  reset: () => void;
};

export function createGovernor(cfg: typeof GOVERNOR = GOVERNOR): Governor {
  let samples: number[] = [];
  let elapsed = 0; // ms of the current window
  let settle: number = cfg.settleMs; // ms still to ignore
  let slow = 0; // consecutive slow windows
  const clear = (settleMs: number) => { samples = []; elapsed = 0; slow = 0; settle = settleMs; };

  return {
    reset: () => clear(cfg.settleMs),
    frame(ms, tier, manual, godraysOn = false) {
      if (manual || lowerTier(tier) === tier) { clear(cfg.settleMs); return null; } // nothing to decide: locked, or already at the floor (Eco)
      if (!(ms > 0) || ms > cfg.hitchMs) return null;
      if (settle > 0) { settle -= ms; return null; }
      samples.push(ms);
      elapsed += ms;
      if (elapsed < cfg.windowMs) return null;
      const judged = samples.length >= cfg.minFrames ? median(samples) : 0;
      samples = [];
      elapsed = 0;
      slow = judged > cfg.slowMs ? slow + 1 : 0;
      if (slow < cfg.slowWindows) return null;
      clear(cfg.settleMs);
      return godraysOn ? "godrays" : lowerTier(tier);
    },
  };
}
