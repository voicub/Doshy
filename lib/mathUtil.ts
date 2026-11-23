// Small numeric helpers shared by the pure lib modules (geometry, car/vegetation/site generators, textures). One copy each: a seeded generator
// or hash that drifts between modules would make the "same" id or seed look different from place to place.

export const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** FNV-1a: a stable 32-bit hash of a string (item, building and area ids seed their look, so it never changes on re-render). */
export function hashStr(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

export type Rng = () => number;
/** A point or vector in 3D: [x, y, z]. */
export type V3 = [number, number, number];

/** Deterministic random numbers in [0, 1) (mulberry32). Named `rngOf` so it never collides with the `rng` parameters the builders take. */
export function rngOf(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
