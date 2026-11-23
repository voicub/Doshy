import type { Def, Part } from "./catalog";
import type { V3 } from "./mathUtil.ts";

// Staircases for a 2.78 m storey (16 risers of 17.4 cm). Climb direction is -z: you step on at the front (+z, the floor you stand on) and arrive at the back
// edge of the floor above. Local origin = footprint centre; y 0 = the floor the stair stands on. Every def is as tall as the storey (def.h), the item is
// stretched to the real storey when placed (lib/voids.ts stairRise), the number of steps stays. A "down" stair is the same shape below y 0.
type Opt = { m?: true; glow?: true; r?: V3; shape?: Part["shape"]; spin?: Part["spin"] };
const b = (x: number, y: number, z: number, sx: number, sy: number, sz: number, c: string, o?: Opt): Part => ({ p: [x, y, z], s: [sx, sy, sz], c, ...o });
const cy = (x: number, y: number, z: number, dia: number, h: number, c: string, o?: Opt) => b(x, y, z, dia, h, dia, c, { ...o, shape: "cyl" });

const H = 2.78;
const N = 16;
const R = H / N; // riser
const G = 0.26; // going (tread depth)
const SW = 0.9; // stair width
const TREAD_T = 0.04;
const RAIL_H = 0.9;
const F = 0.06; // the finished floor lies this far above the level origin (RoomFloor): steps are measured from its surface

const WOOD = "#c9a05f";
const WHITE = "#f2f1ee";
const STEEL = "#2b2e33";
const HAND = "#5b4030";
const GLASS = "#bfe6f2";
const CONCRETE = "#9a9a96";

/** A thin rod / beam of square section between two points (long axis turned to the direction; roll does not matter for a square section). */
const rod = (a: V3, c: V3, t: number, colour: string, o?: Opt): Part => {
  const [dx, dy, dz] = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
  const len = Math.hypot(dx, dy, dz);
  // Euler XYZ turns +z to (sin b, -cos b sin a, cos b cos a)
  return b((a[0] + c[0]) / 2, (a[1] + c[1]) / 2, (a[2] + c[2]) / 2, t, t, len, colour, { ...o, r: [Math.atan2(-dy / len, dz / len), Math.asin(dx / len), 0] });
};

type Style = { open?: boolean; rail?: "wood" | "glass"; down?: boolean };
/** A straight run of `n` steps from (x, z) in direction (dx, dz); the first step is number i0 (its top is i0 risers above the floor). */
type Flight = { x: number; z: number; dx: -1 | 0 | 1; dz: -1 | 0 | 1; n: number; i0: number };

function flight(f: Flight, st: Style, rails: number[] = []): Part[] {
  const sgn = st.down ? -1 : 1;
  const top = (i: number) => F + sgn * i * R;
  const at = (s: number, lat = 0): [number, number] => [f.x + f.dx * s + f.dz * lat, f.z + f.dz * s + f.dx * lat]; // lateral axis: +x for a run along z, +z for a run along x
  const box = (s: number, lat: number, len: number, wide: number, y: number, h: number, c: string, o?: Opt) => {
    const [x, z] = at(s, lat);
    return b(x, y, z, f.dx ? len : wide, h, f.dx ? wide : len, c, o);
  };
  const nosing = (s: number) => F + sgn * (f.i0 * R + (s * R) / G); // line through the front edge of every tread
  const parts: Part[] = [];
  for (let k = 0; k < f.n; k++) {
    const i = f.i0 + k;
    const s = (k + 0.5) * G;
    parts.push(box(s - 0.01, 0, G + 0.02, SW, top(i) - TREAD_T / 2, TREAD_T, WOOD, { m: true }));
    if (!st.open || k === 0) {
      const lo = st.down ? F - H : 0;
      const hi = top(i) - TREAD_T;
      if (hi - lo > 0.01) parts.push(box(s, 0, G, SW, (hi + lo) / 2, hi - lo, WHITE));
    }
  }
  if (st.open) {
    // two steel beams under the treads
    const s0 = 0.5; // the beams start above the floor, the first step stands on a block
    const run = f.n * G - s0;
    const rise = run * (R / G);
    const mid = s0 + run / 2;
    const slope = sgn * Math.atan2(rise, run);
    const len = Math.hypot(run, rise);
    const t = 0.22;
    for (const lat of [-1, 1]) {
      const yTop = nosing(mid) - (st.down ? 0 : R) - TREAD_T;
      const [x, z] = at(mid, lat * (SW / 2 - 0.1));
      const yc = yTop - t / 2 / Math.cos(slope);
      parts.push(f.dx ? b(x, yc, z, len, t, 0.05, STEEL, { r: [0, 0, f.dx * slope] }) : b(x, yc, z, 0.05, t, len, STEEL, { r: [-f.dz * slope, 0, 0] }));
    }
  }
  for (const lat of rails) {
    const l = lat * (SW / 2 - 0.02);
    const end = f.n * G;
    const pt = (s: number): V3 => {
      const [x, z] = at(s, l);
      return [x, nosing(s) + RAIL_H, z];
    };
    parts.push(rod(pt(0), pt(end), 0.05, HAND, { m: true }));
    for (let k = 0; k < f.n; k++) {
      const s = (k + 0.5) * G;
      const [x, z] = at(s, l);
      const base = top(f.i0 + k);
      if (st.rail === "glass") parts.push(f.dx ? b(x, base + 0.44, z, G, 0.88, 0.012, GLASS) : b(x, base + 0.44, z, 0.012, 0.88, G, GLASS));
      else {
        const h = nosing(s) + RAIL_H - base;
        parts.push(b(x, base + h / 2, z, 0.03, h, 0.03, STEEL));
      }
    }
  }
  return parts;
}

/** A flat landing, one step high. */
const landing = (x: number, z: number, w: number, d: number, i: number, st: Style): Part[] => {
  const hi = F + i * R - TREAD_T;
  return [b(x, F + i * R - TREAD_T / 2, z, w, TREAD_T, d, WOOD, { m: true }), b(x, hi / 2, z, w - 0.02, hi, d - 0.02, st.open ? STEEL : WHITE)];
};

const mirror = (parts: Part[]): Part[] => parts.map((p) => ({ ...p, p: [-p.p[0], p.p[1], p.p[2]], ...(p.r ? { r: [p.r[0], -p.r[1], -p.r[2]] as V3 } : {}) }));

const L_RUN = 7;
const L_D = L_RUN * G + SW;
const lShape = (st: Style): Part[] => {
  const x1 = -L_D / 2 + SW / 2;
  const zL = L_D / 2 - L_RUN * G - SW / 2;
  return [
    ...flight({ x: x1, z: L_D / 2, dx: 0, dz: -1, n: L_RUN, i0: 1 }, st, [1]),
    ...landing(x1, zL, SW, SW, L_RUN + 1, st),
    ...flight({ x: x1 + SW / 2, z: zL, dx: 1, dz: 0, n: L_RUN, i0: L_RUN + 2 }, st, [1]),
    b(x1 + SW / 2 - 0.02, F + (L_RUN + 1) * R + RAIL_H / 2, zL + SW / 2 - 0.02, 0.06, RAIL_H, 0.06, HAND, { m: true }), // newel post at the inner corner
  ];
};

const U_W = 2 * SW + 0.1;
const uShape = (st: Style): Part[] => {
  const zL = L_D / 2 - L_RUN * G - SW / 2;
  return [
    ...flight({ x: -U_W / 2 + SW / 2, z: L_D / 2, dx: 0, dz: -1, n: L_RUN, i0: 1 }, st, [1]),
    ...landing(0, zL, U_W, SW, L_RUN + 1, st),
    ...flight({ x: U_W / 2 - SW / 2, z: zL + SW / 2, dx: 0, dz: 1, n: L_RUN, i0: L_RUN + 2 }, st, [-1]),
  ];
};

// quarter turn with three winders (pie-shaped steps) instead of a flat landing
const WIN_A = 5;
const WIN_B = 7;
const winders = (st: Style): Part[] => {
  const d = WIN_A * G + SW;
  const w = WIN_B * G + SW;
  const x1 = -w / 2 + SW / 2;
  const zL = d / 2 - WIN_A * G - SW / 2;
  const px = x1 + SW / 2; // pivot: inner corner of the turn
  const pz = zL + SW / 2;
  const fan = [0, 1, 2].flatMap((k) => {
    const a = ((k + 0.5) * 30 * Math.PI) / 180; // angle from the -x axis toward -z
    const len = SW * 0.95;
    const wide = 0.5;
    const top = F + (WIN_A + 1 + k) * R;
    const mid = len / 2;
    return [
      b(px - Math.cos(a) * mid, top - TREAD_T / 2, pz - Math.sin(a) * mid, len, TREAD_T, wide, WOOD, { m: true, r: [0, Math.PI - a, 0] }),
      b(px - Math.cos(a) * mid, (top - TREAD_T) / 2, pz - Math.sin(a) * mid, len - 0.03, top - TREAD_T, wide - 0.03, st.open ? STEEL : WHITE, { r: [0, Math.PI - a, 0] }),
    ];
  });
  return [
    ...flight({ x: x1, z: d / 2, dx: 0, dz: -1, n: WIN_A, i0: 1 }, st, [1]),
    ...fan,
    ...flight({ x: px, z: zL, dx: 1, dz: 0, n: WIN_B, i0: WIN_A + 4 }, st, [1]),
    b(px - 0.02, F + (WIN_A + 2) * R + RAIL_H / 2, pz - 0.02, 0.06, RAIL_H, 0.06, HAND, { m: true }),
  ];
};

// spiral: a centre column and one wedge-ish tread per step, a full turn up
const SPIRAL_D = 1.6;
const spiral = (): Part[] => {
  const turn = (2 * Math.PI) / (N - 1);
  const parts: Part[] = [cy(0, H / 2, 0, 0.16, H, STEEL)];
  for (let i = 1; i < N; i++) {
    const a = i * turn - Math.PI / 2; // first step at the front (+z)... climbing counter-clockwise seen from above
    const mid = 0.45;
    const ca = Math.cos(a);
    const sa = Math.sin(a);
    const top = F + i * R;
    parts.push(b(ca * mid, top - TREAD_T / 2, -sa * mid, 0.7, TREAD_T, 0.38, WOOD, { m: true, r: [0, a, 0] }));
    parts.push(b(ca * 0.78, top + RAIL_H / 2, -sa * 0.78, 0.025, RAIL_H, 0.025, STEEL)); // balusters at the rim
    const n = i + 1;
    if (n < N) {
      const an = n * turn - Math.PI / 2;
      parts.push(rod([ca * 0.78, top + RAIL_H, -sa * 0.78], [Math.cos(an) * 0.78, F + n * R + RAIL_H, -Math.sin(an) * 0.78], 0.04, HAND, { m: true }));
    }
  }
  return parts;
};

// floating: treads stuck into the wall on the left (-x), nothing underneath
const floating = (glass: boolean): Part[] => {
  const d = (N - 1) * G;
  const parts: Part[] = [];
  for (let i = 1; i < N; i++) {
    const z = d / 2 - (i - 0.5) * G;
    parts.push(b(0, F + i * R - 0.03, z, SW, 0.06, G + 0.02, WOOD, { m: true }));
    parts.push(b(-SW / 2 + 0.06, F + i * R - 0.09, z, 0.12, 0.06, 0.1, STEEL)); // the steel the tread hangs from, inside the wall
    if (glass) parts.push(b(SW / 2 - 0.03, F + i * R + 0.44, z, 0.012, 0.88, G, GLASS));
  }
  if (glass) parts.push(rod([SW / 2 - 0.03, F + R + RAIL_H, d / 2], [SW / 2 - 0.03, F + N * R + RAIL_H, -d / 2], 0.045, STEEL));
  return parts;
};

// loft ladder: two rails and rungs leaning against the hatch
const ladder = (): Part[] => {
  const w = 0.6;
  const run = 0.9;
  const z0 = 0.55;
  const parts: Part[] = [];
  for (const sx of [-1, 1]) parts.push(rod([sx * (w / 2 - 0.025), 0, z0], [sx * (w / 2 - 0.025), H + F, z0 - run], 0.05, WOOD, { m: true }));
  const rungs = 11;
  for (let k = 1; k <= rungs; k++) {
    const t = k / (rungs + 1);
    parts.push(b(0, F + t * H, z0 - run * t, w - 0.05, 0.035, 0.05, WOOD, { m: true }));
  }
  parts.push(b(0, H + F - 0.015, z0 - run - 0.1, w + 0.2, 0.03, 0.3, WHITE)); // the hatch panel folded open at the top
  return parts;
};

// a few concrete steps: n risers of `rise`
const steps = (n: number, rise: number, w: number, c: string): { parts: Part[]; d: number } => {
  const g = 0.3;
  const parts = Array.from({ length: n }, (_, k) => {
    const top = (k + 1) * rise;
    return b(0, top / 2, ((n - 1) / 2 - k) * g, w, top, g, c, { m: true });
  });
  return { parts, d: n * g };
};
const entry = steps(3, 0.5 / 3, 1.2, CONCRETE);
const garden = steps(2, 0.3 / 2, 1.0, "#a39a8c");

// Surface class per material colour (tex/bevel/rough only: every step and rail part keeps its geometry).
const SURFACE: Record<string, Partial<Part>> = {
  [WOOD]: { tex: "wood", rough: 0.55, bevel: 0.006 }, [HAND]: { tex: "wood", rough: 0.5, bevel: 0.01 }, [WHITE]: { tex: "paint", rough: 0.6 },
  [STEEL]: { tex: "metal", metal: 0.85, rough: 0.45 }, [GLASS]: { rough: 0.05, bevel: 0 }, [CONCRETE]: { tex: "stone", rough: 0.85 }, "#a39a8c": { tex: "stone", rough: 0.8 },
};
const stairDef = (label: string, stair: Def["stair"], w: number, d: number, parts: Part[], h = H): Def => ({ label, brand: "Generic", cat: "Stairs", w, d, h, parts: parts.map((p) => ({ ...SURFACE[p.c], ...p })), solid: true, stair });
const STRAIGHT_D = (N - 1) * G;
const straight = (st: Style, rails: number[]) => flight({ x: 0, z: STRAIGHT_D / 2, dx: 0, dz: -1, n: N - 1, i0: 1 }, st, rails);

export const STAIRS: Record<string, Def> = {
  stairs_straight_closed: stairDef("Straight stairs, closed", "up", SW, STRAIGHT_D, straight({}, [])),
  stairs_straight_open: stairDef("Straight stairs, open steps", "up", SW, STRAIGHT_D, straight({ open: true }, [])),
  stairs_straight_rail: stairDef("Straight stairs, wooden handrail", "up", SW, STRAIGHT_D, straight({}, [1])),
  stairs_straight_glass: stairDef("Straight stairs, glass balustrade", "up", SW, STRAIGHT_D, straight({ open: true, rail: "glass" }, [1])),
  stairs_l_right: stairDef("L-shaped stairs, turns right", "up", L_D, L_D, lShape({})),
  stairs_l_left: stairDef("L-shaped stairs, turns left", "up", L_D, L_D, mirror(lShape({}))),
  stairs_u: stairDef("U-shaped stairs (half turn)", "up", U_W, L_D, uShape({})),
  stairs_winder: stairDef("Winder stairs (quarter turn)", "up", WIN_B * G + SW, WIN_A * G + SW, winders({})),
  stairs_spiral: stairDef("Spiral stairs", "up", SPIRAL_D, SPIRAL_D, spiral()),
  stairs_floating: stairDef("Floating stairs (wall-mounted)", "up", SW, STRAIGHT_D, floating(false)),
  stairs_floating_glass: stairDef("Floating stairs, glass balustrade", "up", SW, STRAIGHT_D, floating(true)),
  stairs_loft_ladder: stairDef("Loft ladder", "up", 0.8, 1.2, ladder()),
  stairs_basement: stairDef("Basement stairs (going down)", "down", SW, STRAIGHT_D, straight({ down: true }, [1])),
  stairs_entry: stairDef("Entry steps", "step", 1.2, entry.d, entry.parts, 0.5),
  stairs_garden: stairDef("Garden steps", "step", 1.0, garden.d, garden.parts, 0.3),
};
