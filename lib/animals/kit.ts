import type { Def, Part } from "../catalog";
import type { Bone, CritterSpec, Role } from "../critters.ts";
import type { V3 } from "../mathUtil.ts";
import { b, bounds, cy, sp } from "../partKit.ts";

// Building blocks for animals: a rig collects parts and the bones that move them (lib/critters.ts), `limb` draws a round bar between two points,
// `animal` fits the footprint round the result. Left (L) is +x, right (R) is -x, front is +z.

export const M = { m: true } as const;
export const EYE = "#17191c";
export const PINKNOSE = "#d98c8c";
export const HOOF = "#2e2a28";
export const BEAK = "#e8a93a";

export type Rig = {
  parts: Part[];
  bones: Bone[];
  /** Start a bone (a group of parts that swings about `pivot`). Returns its index. */
  bone: (role: Role, pivot: V3, parent?: number) => number;
  /** Add parts, to a bone or (undefined) to the fixed body. */
  add: (to: number | undefined, ...ps: Part[]) => void;
};

export function rig(): Rig {
  const parts: Part[] = [];
  const bones: Bone[] = [];
  return {
    parts,
    bones,
    bone: (role, pivot, parent) => bones.push({ role, pivot, parent, parts: [] }) - 1,
    add: (to, ...ps) => {
      for (const p of ps) {
        parts.push(p);
        if (to !== undefined) bones[to].parts.push(parts.length - 1);
      }
    },
  };
}

/** A round bar at x from (y0, z0) to (y1, z1) in the side view: legs, necks, tails, ear shafts. */
export const limb = (x: number, y0: number, z0: number, y1: number, z1: number, dia: number, c: string, o?: { m?: true }): Part =>
  cy((x), (y0 + y1) / 2, (z0 + z1) / 2, dia, Math.hypot(y1 - y0, z1 - z0), c, { ...o, r: [Math.atan2(z1 - z0, y1 - y0), 0, 0] });

const r3 = (v: number) => Math.round(v * 1000) / 1000;

/**
 * Turn a rig into a catalog def: the footprint is fitted round the parts (centred in x and z) and the bones follow the shift.
 * `m` parts are the recolourable coat; `spec.coats[0]` is their default colour.
 */
export function animal(label: string, g: Rig, spec: Omit<CritterSpec, "bones">, extra: Partial<Def> = {}): Def {
  const bb = bounds(g.parts);
  const dx = -(bb.x0 + bb.x1) / 2;
  const dz = -(bb.z0 + bb.z1) / 2;
  const parts = g.parts.map((p) => ({ ...p, p: [r3(p.p[0] + dx), r3(p.p[1]), r3(p.p[2] + dz)] as V3 }));
  const bones = g.bones.map((k) => ({ ...k, pivot: [r3(k.pivot[0] + dx), r3(k.pivot[1]), r3(k.pivot[2] + dz)] as V3 }));
  return {
    label,
    brand: "Generic",
    cat: "Animals",
    w: Math.ceil((bb.x1 - bb.x0) * 100 + 1) / 100,
    d: Math.ceil((bb.z1 - bb.z0) * 100 + 1) / 100,
    h: Math.ceil((bb.y1 + 0.001) * 100) / 100,
    parts,
    critter: { ...spec, hip: [spec.hip[0], r3(spec.hip[1] + dz)], bones },
    ...extra,
  };
}

/** A pair of mirrored parts at +-x. */
export const pair = (f: (x: number, side: 1 | -1) => Part | Part[], x: number): Part[] => [1, -1].flatMap((s) => f(s * x, s as 1 | -1));

export { b, cy, sp };
