// Is a point in the scene hidden behind a wall as seen from the camera? Pure: no three.js. The isometric camera is orthographic, so every
// sight line runs the same way; a label is "behind a wall" when the line from its anchor toward the camera passes through a wall slab.

/** A wall as a vertical slab: from (x, z) along the unit direction (ux, uz) for `len` metres, `r` = half thickness, between heights y0 and y1. */
export type Slab = { x: number; z: number; ux: number; uz: number; len: number; r: number; y0: number; y1: number };

const EPS = 1e-6;
const ON_WALL = 0.05; // a point this close to a slab is on it (a wall-mounted sensor, a door tag), not behind it

let t0 = 0;
let t1 = 0;

/** Narrow the ray's [t0, t1] to where it is inside [lo, hi] along one axis; false when it never is. */
function clip(o: number, d: number, lo: number, hi: number) {
  if (Math.abs(d) < EPS) return o >= lo && o <= hi;
  const a = (lo - o) / d;
  const b = (hi - o) / d;
  t0 = Math.max(t0, Math.min(a, b));
  t1 = Math.min(t1, Math.max(a, b));
  return t0 <= t1;
}

/**
 * True when the ray from (px, py, pz) along (dx, dy, dz) (toward the camera) crosses any slab. A point that sits on or inside a slab does not
 * count as hidden by it. Directions need not be unit length.
 */
export function occluded(px: number, py: number, pz: number, dx: number, dy: number, dz: number, slabs: readonly Slab[]): boolean {
  for (const s of slabs) {
    const rx = px - s.x;
    const rz = pz - s.z;
    const u = rx * s.ux + rz * s.uz;
    const v = rz * s.ux - rx * s.uz;
    const r = s.r;
    if (u >= -r - ON_WALL && u <= s.len + r + ON_WALL && Math.abs(v) <= r + ON_WALL && py >= s.y0 - ON_WALL && py <= s.y1 + ON_WALL) continue; // on the wall itself
    t0 = EPS;
    t1 = Infinity;
    if (clip(u, dx * s.ux + dz * s.uz, -r, s.len + r) && clip(v, dz * s.ux - dx * s.uz, -r, r) && clip(py, dy, s.y0, s.y1)) return true;
  }
  return false;
}
