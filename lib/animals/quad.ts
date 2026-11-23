import type { Def } from "../catalog";
import type { CritterSpec, Kind, Pose } from "../critters.ts";
import { EYE, HOOF, M, animal, limb, pair, rig, type Rig } from "./kit.ts";
import { b, cz, sp } from "../partKit.ts";

// One parametric four-legged animal: a capsule body (two spheres and a barrel), neck, head with muzzle, ears, tail and legs with a hock.
// Dogs, cats, rabbits, farm animals, a fox, a tortoise ... are all settings of it. Side view numbers in metres.

export type Quad = {
  label: string;
  kind: Kind;
  coats: string[]; // coats[0] is the default
  poses?: Pose[];
  ax: number; // height of the body's centre line above the ground
  D: number; // chest diameter
  L: number; // chest-to-rump distance
  leg: number; // leg thickness
  hind2?: boolean; // hind legs have a visible bend (thigh and shank)
  hoof?: boolean; // hooves instead of paws
  hd: number; // head diameter
  sn: number; // muzzle length
  sw: number; // muzzle width
  up?: number; // how high the head sits above the chest line
  fwd?: number; // how far the head sits in front of the chest
  neck?: number; // neck thickness (default 0.5 head)
  ear?: "floppy" | "point" | "long" | "none";
  earS?: number; // ear size relative to the head (1)
  tail?: "long" | "plume" | "pom" | "curl" | "stub" | "up" | "hang" | "none";
  tailL?: number;
  tailDrop?: number; // plume tails hang this fraction of their length (0.1 stands out behind, 0.7 hangs)
  c2?: string; // fixed secondary colour: chest patch and socks
  lc?: string; // fixed leg colour (default: the coat)
  hc?: string; // fixed head colour
  sock?: string; // fixed paw colour
  c3?: string; // fixed colour of the muzzle
  nose?: string;
  sitPitch?: number;
  roam?: number;
  extra?: (x: Ctx) => void; // horns, mane, udder, fleece, markings ...
};

export type Ctx = { g: Rig; o: Quad; R: number; ax: number; zc: number; zr: number; hy: number; hz: number; head: number };

const PAW = (t: number) => t * 1.3;

/** What the parts of a quadruped are laid out from: the rig, the settings, the default coat and the chest's radius and ends. */
type Base = { g: Rig; o: Quad; c: string; R: number; ax: number; zc: number; zr: number };

/** Legs and head may have their own fixed colour (a black-faced sheep); otherwise the coat, which the animation recolours. */
const colourOf = (c: string, fixed?: string): [string, { m?: true }] => (fixed ? [fixed, {}] : [c, M]);

/** Four legs, each its own bone; the hind ones with a hock when `hind2`. Returns the hind legs' z (the critter's hip). */
function legs({ g, o, c, R, ax, zc, zr }: Base): number {
  const { D, leg: t } = o;
  const fz = zc - D * 0.06;
  const hz = zr + D * 0.1;
  const lx = R * 0.52;
  const pawD = PAW(t);
  const [lc, lm] = colourOf(c, o.lc);
  const [sc, sm] = o.sock ? colourOf(c, o.sock) : [lc, lm];
  const foot = (x: number, z: number, side: "front" | "back") =>
    o.hoof ? b(x, t * 0.45, z, t * 1.05, t * 0.9, t * 1.15, HOOF) : sp(x, pawD / 2, z + (side === "front" ? pawD * 0.12 : pawD * 0.2), pawD, sc, sm);
  const bottom = o.hoof ? t * 0.9 : pawD * 0.55;
  for (const [side, rl] of [[1, "L"], [-1, "R"]] as const) {
    const x = side * lx;
    const f = g.bone(`legF${rl}`, [x, ax, fz]);
    g.add(f, limb(x, ax, fz, bottom, fz, t, lc, lm), foot(x, fz, "front"));
    const h = g.bone(`legB${rl}`, [x, ax, hz]);
    if (o.hind2) {
      const kz = hz + D * 0.2;
      const ky = ax * 0.55;
      g.add(h, limb(x, ax, hz, ky, kz, t * 1.6, lc, lm), sp(x, ky, kz, t * 1.5, lc, lm), limb(x, ky, kz, bottom, hz - D * 0.05, t * 0.85, lc, lm), foot(x, hz - D * 0.05, "back"));
    } else g.add(h, limb(x, ax, hz, bottom, hz, t * 1.1, lc, lm), foot(x, hz, "back"));
  }
  return hz;
}

/** Neck, head with muzzle and nose, and the eyes bone. Returns the head bone and where the head sits. */
function headAndNeck({ g, o, c, R, ax, zc }: Base) {
  const hd = o.hd;
  const hy = ax + R + (o.up ?? 0.02);
  const hzz = zc + R * 0.5 + (o.fwd ?? R * 0.55);
  const head = g.bone("head", [0, ax + R * 0.35, zc + R * 0.3]);
  const sy = hy - hd * 0.12;
  const [hc, hm] = colourOf(c, o.hc);
  g.add(
    head,
    limb(0, ax + R * 0.3, zc + R * 0.2, hy - hd * 0.05, hzz - hd * 0.2, o.neck ?? hd * 0.62, c, M),
    sp(0, hy, hzz, hd, hc, hm),
    b(0, sy, hzz + hd * 0.28 + o.sn / 2, o.sw, o.sw * 0.82, o.sn, o.c3 ?? hc, o.c3 ? {} : hm),
    sp(0, sy + o.sw * 0.16, hzz + hd * 0.28 + o.sn, o.sw * 0.5, o.nose ?? "#2a2321"),
  );
  const eyes = g.bone("eyes", [0, hy + hd * 0.12, hzz + hd * 0.34], head);
  g.add(eyes, ...pair((x) => sp(x, hy + hd * 0.12, hzz + hd * 0.34, Math.max(0.012, hd * 0.14), EYE), hd * 0.26));
  return { head, hy, hzz };
}

/** Floppy, pointed or long ears, one bone each, hung on the head bone. */
function ears({ g, o, c }: Base, head: number, hy: number, hzz: number) {
  const hd = o.hd;
  const es = o.earS ?? 1;
  if (o.ear === "floppy") {
    const eh = hd * 0.62 * es;
    for (const [s, rl] of [[1, "L"], [-1, "R"]] as const) {
      const ex = s * hd * 0.5;
      const e = g.bone(`ear${rl}`, [ex, hy + hd * 0.32, hzz - hd * 0.05], head);
      g.add(e, b(ex, hy + hd * 0.32 - eh / 2, hzz - hd * 0.05, hd * 0.1, eh, hd * 0.36, c, { ...M, r: [0, 0, -s * 0.22] }));
    }
  } else if (o.ear === "point" || o.ear === "long") {
    const long = o.ear === "long";
    const eh = hd * (long ? 1.5 : 0.62) * es;
    for (const [s, rl] of [[1, "L"], [-1, "R"]] as const) {
      const ex = s * hd * (long ? 0.2 : 0.3);
      const by = hy + hd * (long ? 0.38 : 0.42);
      const e = g.bone(`ear${rl}`, [ex, by, hzz - hd * 0.1], head);
      g.add(e, b(ex, by + eh / 2 * 0.95, hzz - hd * 0.1 - (long ? eh * 0.1 : 0), hd * (long ? 0.2 : 0.14), eh, hd * (long ? 0.12 : 0.28), c, { ...M, r: [long ? -0.2 : 0, 0, -s * (long ? 0.12 : 0.18)] }));
    }
  }
}

/** The tail bone and its shape. */
function tailOf({ g, o, c, R, ax, zr }: Base) {
  const { D, L } = o;
  const Rr = R * 0.92;
  const tl = o.tailL ?? L * 0.5;
  const tpY = ax + R * 0.2;
  const tpZ = zr - Rr * 0.8;
  const tail = g.bone("tail", [0, tpY, tpZ]);
  const tw = D * 0.18;
  switch (o.tail ?? "long") {
    case "long":
      g.add(tail, limb(0, tpY, tpZ, tpY + tl * 0.45, tpZ - tl * 0.9, tw, c, M));
      break;
    case "plume": {
      const drop = o.tailDrop ?? 0.1;
      const [ey, ez] = [tpY - tl * drop, tpZ - tl * Math.sqrt(1 - drop * drop)];
      g.add(tail, limb(0, tpY, tpZ, ey, ez, D * 0.3, c, M), sp(0, ey, ez, D * 0.28, o.c2 ?? c, o.c2 ? {} : M));
      break;
    }
    case "hang": // a cow's rope of a tail with a tuft
      g.add(tail, limb(0, tpY, tpZ, tpY - tl, tpZ - 0.04, tw * 0.8, c, M), sp(0, tpY - tl, tpZ - 0.04, D * 0.16, o.c2 ?? c, o.c2 ? {} : M));
      break;
    case "pom":
      g.add(tail, limb(0, tpY, tpZ, tpY + tl * 0.5, tpZ - tl * 0.5, tw * 0.7, c, M), sp(0, tpY + tl * 0.55, tpZ - tl * 0.55, D * 0.3, c, M));
      break;
    case "curl":
      g.add(tail, sp(0, tpY + R * 0.45, tpZ + R * 0.15, D * 0.3, c, M), sp(0, tpY + R * 0.6, tpZ + R * 0.5, D * 0.22, c, M));
      break;
    case "stub":
      g.add(tail, sp(0, tpY + R * 0.05, tpZ - D * 0.04, D * 0.2, c, M));
      break;
    case "up":
      g.add(tail, limb(0, tpY - R * 0.1, tpZ + R * 0.1, tpY + tl * 0.55, tpZ - tl * 0.25, tw, c, M), limb(0, tpY + tl * 0.55, tpZ - tl * 0.25, tpY + tl * 0.85, tpZ - tl * 0.05, tw * 0.9, c, M));
      break;
    case "none":
      g.add(tail, sp(0, tpY, tpZ + R * 0.3, 0.02, c, M));
  }
}

export function quad(o: Quad): Def {
  const g = rig();
  const { ax, D, L } = o;
  const R = D / 2;
  const Rr = R * 0.92;
  const zc = L / 2;
  const zr = -L / 2;
  const c = o.coats[0];
  // body
  g.add(undefined, sp(0, ax, zc, D, c, M), cz(0, ax, 0, D * 0.96, L, c, M), sp(0, ax - D * 0.02, zr, D * 0.92, c, M));
  if (o.c2) g.add(undefined, sp(0, ax - R * 0.2, zc + R * 0.42, D * 0.62, o.c2));
  const base: Base = { g, o, c, R, ax, zc, zr };
  const hz = legs(base);
  const { head, hy, hzz } = headAndNeck(base);
  ears(base, head, hy, hzz);
  tailOf(base);
  o.extra?.({ g, o, R, ax, zc, zr, hy, hz: hzz, head });
  const spec: Omit<CritterSpec, "bones"> = {
    kind: o.kind,
    coats: o.coats,
    poses: o.poses ?? ["stand", "sit", "lie"],
    hip: [ax, hz],
    sitPitch: o.sitPitch ?? 0.62,
    sitDrop: Math.max(0, ax - D * 0.02 - Rr),
    lieDrop: Math.max(0, ax - D * 0.5),
    r: Math.min(0.7, (L + D) * 0.45),
    ...(o.roam !== undefined ? { roam: o.roam } : {}),
  };
  return animal(o.label, g, spec);
}
