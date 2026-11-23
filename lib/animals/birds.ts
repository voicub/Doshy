import type { Def } from "../catalog";
import type { CritterSpec } from "../critters.ts";
import { b, cy, cz, sp } from "../partKit.ts";
import { BEAK, EYE, M, animal, limb, pair, rig, type Rig } from "./kit.ts";

// Chickens, ducks, geese, turkeys, pigeons, a parrot and the small cage pets. A bird is a round body, neck and head with beak, two wings and two legs.
// Left is +x. Metres.

const RED = "#c8322d";
const LEG = "#d9a23a";
const WOOD = "#8a6a45";

type Bird = {
  label: string;
  coats: string[];
  S: number; // body diameter
  legH: number;
  neck: number; // neck length above the shoulders
  hd: number; // head diameter
  beak: [number, number, number]; // beak w, h, l
  beakC?: string;
  legC?: string;
  comb?: number; // comb height / head diameter (0 none)
  wattle?: boolean;
  tail: "hen" | "rooster" | "duck" | "turkey" | "short";
  tailC?: string; // fixed tail colour
  headC?: string; // fixed head colour
  webbed?: boolean;
  sitDrop?: number;
  roam?: number;
};

function bird(o: Bird, g: Rig = rig(), at: { x: number; z: number } = { x: 0, z: 0 }): Rig {
  const { S, legH } = o;
  const c = o.coats[0];
  const by = legH + S * 0.5;
  const X = at.x;
  const Z = at.z;
  const water = o.tail === "duck";
  g.add(undefined, sp(X, by, Z, S, c, M), sp(X, by - S * 0.02, Z + S * 0.26, S * 0.85, c, M), sp(X, by + S * 0.05, Z - S * 0.3, S * 0.7, c, M));
  if (water) g.add(undefined, sp(X, by + S * 0.18, Z - S * 0.55, S * 0.4, c, M));
  const hd = o.hd;
  const nz = Z + S * 0.38;
  const hy = by + S * 0.35 + o.neck;
  const hz = nz + S * 0.06 + (water ? S * 0.1 : 0);
  const head = g.bone("head", [X, by + S * 0.3, Z + S * 0.3]);
  g.add(head, limb(X, by + S * 0.3, Z + S * 0.28, hy - hd * 0.2, hz - hd * 0.1, Math.max(hd * 0.8, S * 0.28), c, M));
  const hc = o.headC;
  g.add(head, sp(X, hy, hz, hd, hc ?? c, hc ? {} : M), b(X, hy - hd * 0.05, hz + hd * 0.5 + o.beak[2] / 2 - hd * 0.1, ...o.beak, o.beakC ?? BEAK));
  if (o.comb) g.add(head, b(X, hy + hd * 0.5 + (o.comb * hd) / 2 - hd * 0.1, hz - hd * 0.05, hd * 0.16, o.comb * hd, hd * 0.75, RED));
  if (o.wattle) g.add(head, sp(X, hy - hd * 0.5, hz + hd * 0.35, hd * 0.26, RED));
  const eyes = g.bone("eyes", [X, hy + hd * 0.1, hz + hd * 0.15], head);
  g.add(eyes, ...pair((x) => sp(X + x, hy + hd * 0.1, hz + hd * 0.15, Math.max(0.01, hd * 0.17), EYE), hd * 0.42));
  // wings
  for (const [s, rl] of [[1, "L"], [-1, "R"]] as const) {
    const w = g.bone(`wing${rl}`, [X + s * S * 0.46, by + S * 0.38, Z + S * 0.12]);
    g.add(w, b(X + s * S * 0.47, by + S * 0.02, Z - S * 0.08, S * 0.1, S * 0.5, S * 0.62, c, { ...M, r: [0.15, 0, s * 0.06] }));
  }
  // tail
  const tail = g.bone("tail", [X, by + S * 0.35, Z - S * 0.5]);
  const tc = o.tailC;
  if (o.tail === "rooster") {
    for (const a of [-0.32, 0, 0.32]) g.add(tail, b(X + a * S * 0.55, by + S * 0.95, Z - S * 0.82 - Math.abs(a) * 0.1, S * 0.08, S * 0.75, S * 0.22, tc ?? c, { ...(tc ? {} : M), r: [-0.55, 0, -a] }));
  } else if (o.tail === "turkey") {
    g.add(tail, cz(X, by + S * 0.65, Z - S * 0.78, S * 1.5, 0.03, tc ?? c, tc ? { r: [0.2, 0, 0] } : { ...M, r: [0.2, 0, 0] }));
  } else if (o.tail === "short") g.add(tail, b(X, by + S * 0.5, Z - S * 0.65, S * 0.2, S * 0.4, S * 0.1, tc ?? c, { ...(tc ? {} : M), r: [-0.7, 0, 0] }));
  else if (o.tail === "hen") g.add(tail, b(X, by + S * 0.78, Z - S * 0.72, S * 0.12, S * 0.55, S * 0.3, tc ?? c, { ...(tc ? {} : M), r: [-0.5, 0, 0] }));
  else g.add(tail, b(X, by + S * 0.55, Z - S * 0.68, S * 0.14, S * 0.18, S * 0.22, tc ?? c, { ...(tc ? {} : M), r: [-0.4, 0, 0] }));
  // legs
  for (const [s, rl] of [[1, "L"], [-1, "R"]] as const) {
    const x = X + s * S * 0.17;
    const leg = g.bone(`legF${rl}`, [x, legH + S * 0.12, Z + S * 0.02]);
    const lc = o.legC ?? LEG;
    g.add(leg, cy(x, (legH + S * 0.12) / 2 + 0.006, Z + S * 0.02, Math.max(0.012, S * 0.07), legH + S * 0.12 - 0.012, lc), o.webbed ? b(x, 0.006, Z + S * 0.1, S * 0.26, 0.012, S * 0.3, lc) : b(x, 0.006, Z + S * 0.08, S * 0.16, 0.012, S * 0.22, lc));
  }
  return g;
}

const spec = (o: Bird, extra: Partial<CritterSpec> = {}): Omit<CritterSpec, "bones"> => ({
  kind: "fowl",
  coats: o.coats,
  poses: ["stand", "sit"],
  hip: [o.legH + o.S * 0.12, 0],
  sitPitch: 0,
  sitDrop: o.sitDrop ?? Math.max(0.02, o.legH * 0.85),
  lieDrop: o.sitDrop ?? Math.max(0.02, o.legH * 0.85),
  r: Math.max(0.12, o.S * 0.8),
  ...extra,
});

const single = (o: Bird, extra: Partial<CritterSpec> = {}): Def => {
  const g = bird(o);
  return animal(o.label, g, spec(o, extra));
};

const HEN: Bird = { label: "Hen", coats: ["#a8703a", "#f2eee6", "#3a3330", "#d98a3c", "#8a8d92"], S: 0.24, legH: 0.1, neck: 0.07, hd: 0.085, beak: [0.03, 0.025, 0.045], comb: 0.3, wattle: true, tail: "hen" };

/** Chicks: a little group, each with a head that pecks on its own beat. */
function chicks(): Def {
  const g = rig();
  const o: Bird = { label: "Chicks", coats: ["#f2d255", "#f4efe6", "#3a3a3a", "#b58a4a"], S: 0.075, legH: 0.04, neck: 0.012, hd: 0.05, beak: [0.014, 0.01, 0.02], tail: "short", wattle: false };
  for (const [x, z] of [[-0.11, -0.06], [0.1, -0.1], [0.0, 0.1], [-0.05, 0.22], [0.14, 0.14]] as const) bird(o, g, { x, z });
  return animal("Chicks, group of five", g, spec(o, { roam: 0, poses: ["stand"] }));
}

/** A parrot on a floor perch stand. */
function parrot(): Def {
  const g = rig();
  const c = "#3aa05a";
  g.add(undefined, cy(0, 0.012, 0, 0.26, 0.024, WOOD), cy(0, 0.3, 0, 0.03, 0.56, "#6b5a45"), cy(0, 0.585, 0, 0.1, 0.012, WOOD), b(0, 0.6, 0, 0.02, 0.02, 0.2, "#6b5a45"));
  g.add(undefined, sp(0, 0.7, 0, 0.1, c, M), sp(0, 0.72, 0.03, 0.09, "#e8e2c8"), b(0, 0.64, -0.06, 0.04, 0.2, 0.03, "#2f6bc8", { r: [0.25, 0, 0] }));
  const head = g.bone("head", [0, 0.76, 0.02]);
  g.add(head, sp(0, 0.8, 0.03, 0.075, c, M), sp(0, 0.795, 0.075, 0.035, "#2a2a2a"), sp(0, 0.77, 0.085, 0.022, "#2a2a2a"));
  const eyes = g.bone("eyes", [0, 0.81, 0.06], head);
  g.add(eyes, ...pair((x) => sp(x, 0.81, 0.06, 0.012, EYE), 0.03));
  for (const [s, rl] of [[1, "L"], [-1, "R"]] as const) {
    const w = g.bone(`wing${rl}`, [s * 0.05, 0.75, 0]);
    g.add(w, b(s * 0.054, 0.69, -0.02, 0.02, 0.15, 0.07, c, { ...M, r: [0.15, 0, s * 0.06] }));
  }
  const tail = g.bone("tail", [0, 0.64, -0.05]);
  g.add(tail, b(0, 0.55, -0.075, 0.035, 0.2, 0.02, "#2f6bc8", { r: [0.2, 0, 0] }));
  const o: Bird = { ...HEN, label: "Parrot on perch", coats: [c, "#c8332e", "#2e6fc8", "#8a8d92"], S: 0.1, legH: 0.6 };
  return animal("Parrot on a perch stand", g, spec(o, { roam: 0, poses: ["stand"], hip: [0.65, 0], sitDrop: 0, lieDrop: 0, r: 0.15 }));
}

/** A round bird cage with a canary on its perch. */
function canaryCage(): Def {
  const g = rig();
  g.add(undefined, cy(0, 0.03, 0, 0.36, 0.05, "#3a3d42"), cy(0, 0.5, 0, 0.36, 0.012, "#c9a45a"), sp(0, 0.5, 0, 0.12, "#c9a45a"), cy(0, 0.545, 0, 0.012, 0.09, "#c9a45a"));
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    g.add(undefined, cy(0.165 * Math.cos(a), 0.275, 0.165 * Math.sin(a), 0.006, 0.44, "#c9a45a"));
  }
  g.add(undefined, b(0, 0.16, 0, 0.3, 0.012, 0.012, "#8a6a45"), cy(0, 0.1, 0, 0.12, 0.05, "#e8e0d0"));
  const c = "#f2cf3a";
  g.add(undefined, sp(0, 0.2, 0, 0.065, c, M), sp(0, 0.205, 0.03, 0.055, c, M));
  const head = g.bone("head", [0, 0.215, 0.03]);
  g.add(head, sp(0, 0.235, 0.055, 0.05, c, M), b(0, 0.23, 0.085, 0.012, 0.012, 0.02, "#d98a3c"));
  const eyes = g.bone("eyes", [0, 0.24, 0.075], head);
  g.add(eyes, ...pair((x) => sp(x, 0.24, 0.075, 0.008, EYE), 0.02));
  const tail = g.bone("tail", [0, 0.2, -0.03]);
  g.add(tail, b(0, 0.19, -0.075, 0.03, 0.012, 0.07, c, { ...M, r: [0.2, 0, 0] }));
  const o: Bird = { ...HEN, coats: [c, "#e8e2c8", "#d98a3c"], S: 0.065, legH: 0.16 };
  return animal("Canary in a bird cage", g, spec(o, { roam: 0, poses: ["stand"], hip: [0.2, 0], sitDrop: 0, lieDrop: 0, r: 0.1 }));
}

export const BIRDS: Record<string, Def> = {
  an_hen: single(HEN),
  an_rooster: single({ ...HEN, label: "Rooster", coats: ["#b5612a", "#f2eee6", "#2b2623", "#8a5a30"], S: 0.3, legH: 0.16, neck: 0.16, hd: 0.1, beak: [0.03, 0.028, 0.05], comb: 0.6, tail: "rooster", tailC: "#2c4a3a" }),
  an_chicks: chicks(),
  an_duck: single({ label: "Duck", coats: ["#f4efe6", "#c9b49a", "#8a8d92", "#6b5645"], S: 0.3, legH: 0.07, neck: 0.1, hd: 0.1, beak: [0.05, 0.02, 0.06], beakC: "#e8883a", legC: "#e8883a", tail: "duck", webbed: true, wattle: false }),
  an_goose: single({ label: "Goose", coats: ["#f4efe6", "#8a8d92", "#6b5645"], S: 0.4, legH: 0.12, neck: 0.3, hd: 0.1, beak: [0.045, 0.03, 0.07], beakC: "#e8883a", legC: "#e8883a", tail: "duck", webbed: true }),
  an_turkey: single({ label: "Turkey", coats: ["#5a4636", "#f2eee6", "#2b2623"], S: 0.44, legH: 0.22, neck: 0.2, hd: 0.1, beak: [0.03, 0.03, 0.05], beakC: "#c9b49a", legC: "#9a8a7a", headC: "#c4687a", wattle: true, tail: "turkey", tailC: "#7a5a3a" }),
  an_pigeon: single({ label: "Pigeon", coats: ["#8a8d92", "#f2eee6", "#5a5d62"], S: 0.14, legH: 0.06, neck: 0.025, hd: 0.06, beak: [0.014, 0.012, 0.025], beakC: "#3a3a3a", legC: "#d98c8c", tail: "short", wattle: false }, { roam: 2 }),
  an_parrot: parrot(),
  an_canary_cage: canaryCage(),
};
