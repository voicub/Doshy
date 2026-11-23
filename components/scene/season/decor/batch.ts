import type { V3 } from "@/lib/mathUtil";

/** One decoration part: centre, size (box edge, sphere / cone / torus scale), Euler XYZ rotation, colour and, for glow parts, brightness. */
export type Piece = { p: V3; s: V3; r?: V3; c: string; /** glow brightness (>1 blooms) */ e?: number; /** twinkle phase in radians */ ph?: number; /** twinkle depth 0..1 */ tw?: number };

/** Everything one holiday draws, grouped by geometry so it renders as a handful of instanced meshes. */
export type Batch = {
  boxes: Piece[];
  cones: Piece[];
  spheres: Piece[];
  tori: Piece[];
  /** emissive spheres (string lights, ornaments' glints, the star): never tone mapped, so bloom picks them up */
  bulbs: Piece[];
  /** emissive boxes (jack-o-lantern faces, star arms) */
  glowBoxes: Piece[];
  /** flat additive pools on the ground (halloween orange, valentine pink) */
  pools: Piece[];
  /** wire segments, pairs of points */
  wire: V3[];
  wireColor: string;
};

export const emptyBatch = (wireColor = "#1c2b22"): Batch => ({ boxes: [], cones: [], spheres: [], tori: [], bulbs: [], glowBoxes: [], pools: [], wire: [], wireColor });

/**
 * A string of lights hanging between two points (sagging like a catenary), as bulbs plus wire.
 * `colors` cycle along the string; `twinkle` is the brightness dip depth.
 */
export function strand(b: Batch, a: V3, z: V3, o: { sag?: number; step?: number; colors: string[]; e?: number; r?: number; tw?: number; phase?: number }) {
  const len = Math.hypot(z[0] - a[0], z[1] - a[1], z[2] - a[2]);
  const n = Math.max(2, Math.round(len / (o.step ?? 0.17)));
  const sag = o.sag ?? 0.05;
  let prev: V3 | null = null;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const p: V3 = [a[0] + (z[0] - a[0]) * t, a[1] + (z[1] - a[1]) * t - sag * 4 * t * (1 - t), a[2] + (z[2] - a[2]) * t];
    if (prev) b.wire.push(prev, p);
    prev = p;
    const r = o.r ?? 0.028;
    b.bulbs.push({ p, s: [r, r, r], c: o.colors[(i + Math.round(o.phase ?? 0)) % o.colors.length], e: o.e ?? 2.2, ph: (i * 2.399 + (o.phase ?? 0)) % (Math.PI * 2), tw: o.tw ?? 0.55 });
  }
}
