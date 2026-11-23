import type { Def, Part } from "./catalog";
import type { V3 } from "./mathUtil.ts";

/** The floor slab is this thick (RoomFloor): anything lower than its top is buried, so thin pieces are raised onto it. */
export const FLOOR_T = 0.06;
/** The same def with every part lifted by dy (and h grown to match). */
export const raise = (d: Def, dy: number): Def => ({ ...d, h: Math.round((d.h + dy) * 1000) / 1000, parts: d.parts.map((p) => ({ ...p, p: [p.p[0], p.p[1] + dy, p.p[2]] })) });

// Part helpers shared by the garage / energy / outdoor catalogs (same conventions as lib/catalog.home-office.ts).
// Local coords: centred on the footprint, y = part centre height, front = +z, x = width.
type Opt = { m?: true; glow?: true; glass?: true; r?: [number, number, number]; shape?: Part["shape"]; spin?: Part["spin"] };

export const b = (x: number, y: number, z: number, sx: number, sy: number, sz: number, c: string, o?: Opt): Part => ({ p: [x, y, z], s: [sx, sy, sz], c, ...o });
/** cylinder standing on y: diameter, height */
export const cy = (x: number, y: number, z: number, dia: number, h: number, c: string, o?: Opt) => b(x, y, z, dia, h, dia, c, { ...o, shape: "cyl" });
export const sp = (x: number, y: number, z: number, dia: number, c: string, o?: Opt) => b(x, y, z, dia, dia, dia, c, { ...o, shape: "sph" });
/** cylinder lying along x (wheels, drums, pipes): axis, diameter, length */
export const cx = (x: number, y: number, z: number, dia: number, len: number, c: string, o?: Opt) => b(x, y, z, dia, len, dia, c, { ...o, shape: "cyl", r: [0, 0, Math.PI / 2] });
/** cylinder lying along z */
export const cz = (x: number, y: number, z: number, dia: number, len: number, c: string, o?: Opt) => b(x, y, z, dia, len, dia, c, { ...o, shape: "cyl", r: [Math.PI / 2, 0, 0] });

/** square bar of thickness th from point a to point b (any direction): rails, rungs, slanted legs, blades. */
export const rod = (a: V3, e: V3, th: number, c: string, o?: Opt): Part => {
  const dx = e[0] - a[0], dy = e[1] - a[1], dz = e[2] - a[2];
  const len = Math.hypot(dx, dy, dz);
  return b((a[0] + e[0]) / 2, (a[1] + e[1]) / 2, (a[2] + e[2]) / 2, th, th, len, c, { ...o, r: [Math.atan2(-dy, dz), Math.atan2(dx, Math.hypot(dy, dz)), 0] });
};

/** vertical post + corner legs: n legs inset on a w x d rectangle */
export const legs = (w: number, d: number, h: number, c: string, t = 0.05) =>
  [-1, 1].flatMap((sx) => [-1, 1].map((sz) => b(sx * (w / 2 - t / 2), h / 2, sz * (d / 2 - t / 2), t, h, t, c)));

/** spoked wheel standing in the yz plane (axis x): a ring of segments + 3 spokes. dia = outer diameter. */
export const wheelRing = (x: number, y: number, z: number, dia: number, tyre: number, c: string, spoke = "#b8bcc2", seg = 12): Part[] => {
  const R = (dia - tyre) / 2;
  const L = 2 * R * Math.tan(Math.PI / seg) * 1.04;
  const ring = Array.from({ length: seg }, (_, i) => {
    const a = (i / seg) * Math.PI * 2;
    return b(x, y + R * Math.cos(a), z + R * Math.sin(a), tyre, tyre, L, c, { r: [a, 0, 0] });
  });
  const spokes = [0, 1, 2].map((i) => b(x, y, z, 0.006, 2 * R, 0.006, spoke, { r: [(i * Math.PI) / 3, 0, 0] }));
  return [...ring, ...spokes];
};

export const WHITE = "#f2f1ee";
export const BLACK = "#1c1d20";
export const DARK = "#3a3d42";
export const GREY = "#8d9299";
export const LGREY = "#b8bcc2";
export const STEEL = "#c4c8ce";
export const OAK = "#c9a26b";
export const WOOD = "#8a6a45";
export const DECK = "#a9825a";
export const LEAF1 = "#3f6b3a";
export const LEAF2 = "#4d7d3d";
export const LEAF3 = "#2f5530";
export const TRUNK = "#6b4a35";
export const STONE = "#9aa0a6";
export const CYAN = "#5ad7ff";

/** Axis-aligned box around all parts (honours each part's Euler XYZ rotation) in the footprint's local coords. */
export function bounds(parts: Part[]) {
  const o = { x0: Infinity, x1: -Infinity, y0: Infinity, y1: -Infinity, z0: Infinity, z1: -Infinity };
  for (const p of parts) {
    const h = [p.s[0] / 2, p.s[1] / 2, p.shape === "cyl" ? p.s[0] / 2 : p.s[2] / 2]; // an ellipsoid has its own z size; a cylinder is round
    const [rx, ry, rz] = p.r ?? [0, 0, 0];
    for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) {
      let x = sx * h[0], y = sy * h[1], z = sz * h[2];
      [x, y] = [x * Math.cos(rz) - y * Math.sin(rz), x * Math.sin(rz) + y * Math.cos(rz)];
      [x, z] = [x * Math.cos(ry) + z * Math.sin(ry), -x * Math.sin(ry) + z * Math.cos(ry)];
      [y, z] = [y * Math.cos(rx) - z * Math.sin(rx), y * Math.sin(rx) + z * Math.cos(rx)];
      x += p.p[0]; y += p.p[1]; z += p.p[2];
      o.x0 = Math.min(o.x0, x); o.x1 = Math.max(o.x1, x);
      o.y0 = Math.min(o.y0, y); o.y1 = Math.max(o.y1, y);
      o.z0 = Math.min(o.z0, z); o.z1 = Math.max(o.z1, z);
    }
  }
  return o;
}
