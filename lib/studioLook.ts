// The Studio ground as numbers: the colours of the satin floor and where its pool of light fades into the backdrop. Pure; components/scene/StudioFloor.tsx
// turns these into a shader, so nothing here needs a canvas or a big texture.

/** The Studio's clear colour. The floor fades to exactly this, so the horizon is seamless whatever the zoom. */
export const STUDIO_BACKDROP = "#030406";

export const STUDIO_FLOOR = {
  /** Colour under the building, in the middle of the pool of light, and halfway out. */
  centre: "#46515f",
  mid: "#1f2630",
  /** Colour of the measuring grid lines. */
  line: "#a9cde0",
  /** Metres: the pool of light reaches its edge at `pool`; the floor starts to melt into the backdrop at `fadeFrom` and has gone at `fadeTo`. */
  pool: 20,
  fadeFrom: 22,
  fadeTo: 52,
  /** Strength of the 1 m and 5 m grid lines (0..1 mix toward `line`). */
  grid: { minor: 0.06, major: 0.15 },
  /** Strength of the fine satin cloudiness (relative brightness swing). */
  grain: 0.12,
  /** Metres the soft footprint shadow reaches past the walls, and how dark it is at the wall. */
  halo: { pad: 1.1, strength: 0.6 },
} as const;

const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);

/** 0..1 smoothstep between `a` and `b`: the same curve the shader uses, so what is tested is what is drawn. */
export const smoothstep = (a: number, b: number, x: number): number => {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};

/** How much of the floor (as against the backdrop) is left `r` metres from the middle: 1 near the building, 0 beyond `fadeTo`. */
export const floorVisibility = (r: number): number => 1 - smoothstep(STUDIO_FLOOR.fadeFrom, STUDIO_FLOOR.fadeTo, r);

/** Brightness of the pool of light `r` metres from the middle: 1 at the centre, easing to 0 at `pool` (a curve steeper than a plain smoothstep keeps a bright core). */
export const poolLight = (r: number): number => Math.pow(1 - smoothstep(0, STUDIO_FLOOR.pool, r), 1.6);
