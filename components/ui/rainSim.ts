import { clamp } from "@/lib/mathUtil";
import type { WeatherKind } from "@/lib/sky";

/** What the weather asks of the glass. Levels are targets 0..1; the simulation damps toward them. */
export type RainInput = { kind: WeatherKind; rain: number; snow: number; fog: number; tilt: number; show: number };

type Streak = { x: number; y: number; z: number };
type Drop = { x: number; y: number; r: number; rMax: number; life: number; sliding: boolean; moving: boolean; t: number; vy: number; ph: number; trail: number[] };
type Trail = { pts: number[]; w: number; a: number };
type Flake = { x: number; y: number; z: number; ph: number };
type Blob = { x: number; y: number; s: number; vx: number; ph: number };

/** Everything the rain animation remembers between frames. Mutated in place every frame (no per-frame allocation). */
export type Sim = {
  W: number;
  H: number;
  /** current (damped) levels, 0..1 */
  lv: { rain: number; snow: number; fog: number; show: number };
  streaks: Streak[];
  flakes: Flake[];
  drops: Drop[];
  trails: Trail[];
  blobs: Blob[];
  /** fractional glass drops waiting to be spawned */
  spawn: number;
  /** lightning flash brightness 0..1 */
  flash: number;
  nextFlash: number;
  lastBolt: number;
  clock: number;
};

const MAX_DROPS = 110;
const MAX_TRAILS = 70;

const rand = (a: number, b: number) => a + Math.random() * (b - a);
const damp = (cur: number, tgt: number, dt: number, tau: number) => cur + (tgt - cur) * (1 - Math.exp(-dt / tau));

export function createSim(): Sim {
  return {
    W: 0,
    H: 0,
    lv: { rain: 0, snow: 0, fog: 0, show: 0 },
    streaks: [],
    flakes: [],
    drops: [],
    trails: [],
    blobs: Array.from({ length: 4 }, (_, i) => ({ x: rand(0, 1), y: rand(0.15, 0.85), s: rand(0.8, 1.3), vx: rand(6, 16) * (i % 2 ? -1 : 1), ph: rand(0, 6) })),
    spawn: 0,
    flash: 0,
    nextFlash: rand(4, 9),
    lastBolt: -1e9,
    clock: 0,
  };
}

const maxStreaks = (s: Sim) => Math.round(Math.min(380, Math.max(70, (s.W * s.H) / 3200)));
const maxFlakes = (s: Sim) => Math.round(Math.min(200, Math.max(50, (s.W * s.H) / 8000)));

/** Put a streak or flake at a random spot just above (or, when `initial`, anywhere on) the screen. */
function fresh<T extends { x: number; y: number }>(s: Sim, o: T, initial: boolean, tilt: number, len: number): T {
  o.x = rand(tilt > 0 ? -s.H * tilt - 40 : -40, s.W + 40 + (tilt < 0 ? -s.H * tilt : 0));
  o.y = initial ? rand(-len, s.H) : -len - rand(0, s.H * 0.15);
  return o;
}

function stepLevels(s: Sim, inp: RainInput, dt: number) {
  const { lv } = s;
  lv.show = damp(lv.show, inp.show, dt, 0.45);
  lv.rain = damp(lv.rain, inp.rain, dt, inp.rain > lv.rain ? 1.1 : 1.8);
  lv.snow = damp(lv.snow, inp.snow, dt, inp.snow > lv.snow ? 1.4 : 2);
  lv.fog = damp(lv.fog, inp.fog, dt, 2.2);
  if (lv.show < 0.01 && inp.show === 0) {
    s.drops = [];
    s.trails = [];
  }
}

/** Rain streaks: the pool grows and shrinks with the level, so fade-in is a ramp of density. */
function stepStreaks(s: Sim, inp: RainInput, dt: number) {
  const want = Math.round(maxStreaks(s) * s.lv.rain);
  while (s.streaks.length < want) s.streaks.push(fresh(s, { x: 0, y: 0, z: rand(0.3, 1) }, true, inp.tilt, 40));
  if (s.streaks.length > want) s.streaks.length = want;
  const speedK = 0.8 + 0.4 * s.lv.rain;
  for (const st of s.streaks) {
    const v = (650 + 700 * st.z) * speedK;
    st.y += v * dt;
    st.x += v * inp.tilt * dt;
    if (st.y > s.H + 60 || (inp.tilt > 0 && st.x > s.W + 80) || (inp.tilt < 0 && st.x < -80)) fresh(s, st, false, inp.tilt, 40);
  }
}

function stepFlakes(s: Sim, inp: RainInput, dt: number) {
  const want = Math.round(maxFlakes(s) * s.lv.snow);
  while (s.flakes.length < want) s.flakes.push(fresh(s, { x: 0, y: 0, z: rand(0.25, 1), ph: rand(0, 6.28) }, true, inp.tilt, 10));
  if (s.flakes.length > want) s.flakes.length = want;
  for (const f of s.flakes) {
    const v = (22 + 40 * f.z) * (0.7 + 0.5 * s.lv.snow);
    f.y += v * dt;
    f.x += (Math.sin(s.clock * 0.6 + f.ph) * 14 + v * inp.tilt * 0.8) * dt;
    if (f.y > s.H + 10) fresh(s, f, false, inp.tilt, 10);
  }
}

/** Fog haze drifts slowly. */
function stepBlobs(s: Sim, dt: number) {
  for (const b of s.blobs) {
    b.ph += dt * 0.08;
    b.x += (b.vx * dt) / Math.max(s.W, 1);
    if (b.x > 1.4) b.x = -0.4;
    if (b.x < -0.4) b.x = 1.4;
  }
}

/**
 * Advances one glass drop by `dt`: it grows while gathering water, then slides leaving a trail and swallowing small
 * static drops on the way. True when the drop is finished and should be removed.
 */
function stepDrop(d: Drop, drops: Drop[], dt: number, dry: number, rain: number, H: number): boolean {
  d.life -= dt * dry;
  if (!d.sliding) {
    if (d.rMax > d.r) {
      d.r = Math.min(d.rMax, d.r + dt * 0.55 * (0.4 + rain));
      if (d.r >= d.rMax) {
        d.sliding = true;
        d.trail = [d.x, d.y];
      }
    }
    return d.life <= 0;
  }
  d.t -= dt;
  if (d.t <= 0) {
    d.moving = Math.random() < 0.7;
    d.t = d.moving ? rand(0.25, 0.9) : rand(0.1, 0.5);
  }
  const target = d.moving ? 45 + 26 * d.r : 0;
  d.vy = damp(d.vy, target, dt, 0.18);
  const dy = d.vy * dt;
  d.y += dy;
  d.x += Math.sin(d.y * 0.04 + d.ph) * 6 * dt;
  d.r -= dy * 0.0032;
  const n = d.trail.length;
  if (n < 2 || d.y - d.trail[n - 1] > 5) d.trail.push(d.x, d.y);
  for (const o of drops) {
    if (o !== d && !o.sliding && Math.abs(o.y - d.y) < d.r + o.r && Math.abs(o.x - d.x) < d.r + o.r) {
      d.r = Math.min(8, d.r + o.r * 0.3);
      o.life = 0;
    }
  }
  return d.life <= 0 || d.r < 1.1 || d.y > H + 20;
}

/** Glass drops: spawn with rain, grow while gathering water, then slide and leave trails. */
function stepGlass(s: Sim, dt: number) {
  const { lv, W, H } = s;
  if (lv.rain > 0.02 && lv.show > 0.05) {
    s.spawn += (3 + 14 * lv.rain) * lv.rain * dt * Math.max(0.6, (W * H) / 1.3e6);
    while (s.spawn >= 1) {
      s.spawn -= 1;
      if (s.drops.length >= MAX_DROPS) break;
      const big = Math.random() < 0.3;
      const r = big ? rand(2, 3.4) : rand(0.9, 2);
      s.drops.push({ x: rand(0, W), y: rand(0, H), r, rMax: big ? rand(4, 8) : r, life: rand(big ? 12 : 6, big ? 40 : 20), sliding: false, moving: true, t: 0, vy: 0, ph: rand(0, 6.28), trail: [] });
    }
  }
  const dry = 1 + 3 * (1 - clamp(lv.rain * 3, 0, 1)); // drops evaporate quickly once the rain stops
  for (let i = s.drops.length - 1; i >= 0; i--) {
    const d = s.drops[i];
    if (!stepDrop(d, s.drops, dt, dry, lv.rain, H)) continue;
    if (d.sliding && d.trail.length > 4 && d.y < H) {
      s.trails.push({ pts: d.trail, w: Math.max(0.8, d.rMax * 0.45), a: 1 });
      if (s.trails.length > MAX_TRAILS) s.trails.shift();
    }
    s.drops.splice(i, 1);
  }
  for (let i = s.trails.length - 1; i >= 0; i--) {
    s.trails[i].a -= dt / 7;
    if (s.trails[i].a <= 0) s.trails.splice(i, 1);
  }
}

/** Lightning: the scene dispatches `housey:lightning`; without it (40 s of silence) we time our own. */
function stepLightning(s: Sim, inp: RainInput, dt: number, bolt: () => void) {
  s.flash = Math.max(0, s.flash - dt * 4.5);
  if (inp.kind !== "storm" || s.lv.rain <= 0.3) return;
  s.nextFlash -= dt;
  if (s.nextFlash > 0) return;
  s.nextFlash = rand(7, 19);
  if (s.clock - s.lastBolt > 40) bolt();
}

/** One simulation step. `bolt` starts a self-timed lightning flash. */
export function stepSim(s: Sim, inp: RainInput, dt: number, bolt: () => void) {
  s.clock += dt;
  stepLevels(s, inp, dt);
  stepStreaks(s, inp, dt);
  stepFlakes(s, inp, dt);
  stepBlobs(s, dt);
  stepGlass(s, dt);
  stepLightning(s, inp, dt, bolt);
}

/** Anything the screen still shows or is still fading out: the animation loop keeps running while this is true. */
export function isBusy(s: Sim, inp: RainInput): boolean {
  const { lv } = s;
  return inp.rain > 0 || inp.snow > 0 || inp.fog > 0 || lv.rain > 0.003 || lv.snow > 0.003 || lv.fog > 0.003 || s.drops.length > 0 || s.trails.length > 0 || s.flash > 0.01;
}
