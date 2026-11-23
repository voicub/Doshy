// Frame pacing for a 3D view that may stay on for months (a wall display) on a small computer. Pure decisions, no timers and no browser: components/scene/FrameDriver.tsx
// owns the timers. The scene does not draw at the screen's speed all the time: while the owner touches it, or something moves, it draws at the tier's rate (30 per second
// in the light tiers on a kiosk or small screen); when nothing moves it draws one frame every couple of seconds (so the sun and the clock still creep along) and nothing in
// between, so a wall display idles at about zero CPU and GPU. Anything that moves on its own calls `keepAlive()` from its frame callback while it moves.
import type { Tier } from "./quality.ts";
import type { Vp } from "./viewport.ts";

export const PACE = {
  /** After the owner touches the screen or the keys: keep drawing this long (the camera eases out, hover and drag follow the finger). */
  activeMs: 2500,
  /** After a frame nobody here asked for (a device changed, a panel opened, a reading arrived: the scene changed): keep drawing this long so new shaders, textures and layout settle. Easings keep themselves going with keepAlive(). */
  settleMs: 300,
  /** Nothing moves: one frame this often, so the sun, sky and clock keep up. */
  idleMs: 2000,
  /** Something that casts a shadow keeps moving (a fan, a drum, a swaying curtain): the sun's shadow map is redrawn at most this often. */
  shadowMs: 100,
} as const;

/** 30 fps cap: 1000 / 30. */
export const FPS30_MS = 1000 / 30;

type FramePolicy = {
  /** Draw only when something asks for a frame (and at the idle heartbeat), instead of on every screen refresh. */
  demand: boolean;
  /** Shortest time between two frames in ms; 0 = the screen's refresh rate. */
  capMs: number;
};

/** Which pacing a tier gets. The heavy tiers on a normal desktop screen keep the plain always-drawing loop (exactly what they always did); everything else idles when still. */
export function framePolicy(tier: Tier, vp: Vp, kiosk: boolean): FramePolicy {
  const small = vp !== "regular";
  const demand = tier === "eco" || tier === "low" || tier === "medium" || kiosk || small;
  const capMs = tier === "eco" || (tier === "low" && (kiosk || small)) ? FPS30_MS : 0;
  return { demand, capMs };
}

type Pacer = {
  /** The owner did something: draw continuously for `ms` (default PACE.activeMs). */
  poke: (now: number, ms?: number) => void;
  /** A frame starts at `now` (call before the scene's own frame callbacks). `planned`: this pacer asked for it (false = a React change, the camera controls or a resize asked).
   *  `cameraMoved`: the camera is not where it was last frame. Returns whether anything that casts a shadow may have moved since the last frame (a scene change that was not
   *  just the camera, a settle burst after one, or an animation still running): a tier that redraws the sun's shadow map only when needed does so on `true`. */
  begin: (now: number, planned: boolean, cameraMoved: boolean) => boolean;
  /** A frame ended at `now`. `kept`: something called keepAlive() during it; `shadowsMoved` (default: same as `kept`): something that casts a shadow did. Returns the delay in ms until the next frame should be requested. */
  end: (now: number, kept: boolean, shadowsMoved?: boolean) => number;
};

export function createPacer(capMs: number, cfg: typeof PACE = PACE): Pacer {
  let activeUntil = 0;
  let dirtyUntil = 0;
  let started = 0;
  let shadowPending = true; // a caster may have moved since the shadow map was drawn; the first frames after a (re)start draw everything, shadows included
  let shadowAt = -Infinity;
  const poke = (now: number, ms: number = cfg.activeMs) => void (activeUntil = Math.max(activeUntil, now + ms));
  return {
    poke,
    begin(now, planned, cameraMoved) {
      started = now;
      if (!planned) poke(now, cfg.settleMs);
      if (!planned && !cameraMoved) dirtyUntil = Math.max(dirtyUntil, now + cfg.settleMs);
      // a scene change redraws the shadows every frame of its settle burst; something that moves on its own, at most every shadowMs (a fan turning all day does not need 30 shadow passes a second)
      if (now >= dirtyUntil && !(shadowPending && now - shadowAt >= cfg.shadowMs)) return false;
      shadowPending = false;
      shadowAt = now;
      return true;
    },
    end(now, kept, shadowsMoved = kept) {
      if (shadowsMoved) shadowPending = true;
      const wait = kept || now < activeUntil ? Math.max(0, started + capMs - now) : cfg.idleMs;
      // the last move of an animation must reach the shadow map even if nothing else asks for a frame
      return shadowPending ? Math.min(wait, Math.max(started + capMs - now, shadowAt + cfg.shadowMs - now, 0)) : wait;
    },
  };
}

/** Shared with the scene's lights: whether the current frame may have moved a shadow caster (set by FrameDriver from Pacer.begin; true whenever no driver paces the loop). */
export const frameFlags = { shadowsDirty: true };

/** What was raised during a frame: `alive` = draw again straight away, `shadows` = something that casts a shadow moved. */
export type Kept = { alive: boolean; shadows: boolean };
const raised: Kept = { alive: false, shadows: false };
const taken: Kept = { alive: false, shadows: false };
/**
 * Called from a frame callback by anything that is moving on its own (an easing that has not arrived, a loop, a particle, a pulse): the next frame is drawn straight away.
 * `shadowsMoved` (default true): what moves casts a shadow, so the tiers that redraw the sun's shadow map only when needed redraw it. Pass false for things that do not
 * (glow, weather, overlays, the camera, material fades): the frame is drawn but the shadow pass is skipped, about a quarter of what a frame costs on a small GPU.
 */
export const keepAlive = (shadowsMoved = true): void => {
  raised.alive = true;
  if (shadowsMoved) raised.shadows = true;
};
/** Read and clear what was raised (the driver, once per frame, after every frame callback ran). The result is reused: read it before the next call. */
export const takeKept = (): Readonly<Kept> => {
  taken.alive = raised.alive;
  taken.shadows = raised.shadows;
  raised.alive = raised.shadows = false;
  return taken;
};
