import type { Def } from "../catalog";
import { b, cy, sp } from "../partKit.ts";
import { M, PINKNOSE, limb, pair } from "./kit.ts";
import { quad, type Ctx, type Quad } from "./quad.ts";

// Dogs, cats, small pets, a garden fox and hedgehog, farm animals. Each is `quad()` with its own proportions (lib/animals/quad.ts). Metres.

const WHITE = "#f4efe6";
const DARKC = "#2b2623";
const TAN = "#c89a58";

type Rest = Omit<Quad, "label" | "kind" | "coats">;
const dog = (label: string, coats: string[], o: Rest) => quad({ label, kind: "dog", coats, hind2: true, ...o });
const cat = (label: string, coats: string[], o: Rest) => quad({ label, kind: "cat", coats, hind2: true, ear: "point", ...o });

/** spheres evenly spread over a back: fleece, spines, markings */
const dots = (x: Ctx, n: number, dia: number, y: number, c: string, m: boolean, spread = 1) =>
  Array.from({ length: n }, (_, i) => {
    const u = n === 1 ? 0 : i / (n - 1) - 0.5;
    const side = i % 2 ? 1 : -1;
    return sp(side * x.R * 0.45 * spread, y - Math.abs(u) * x.R * 0.3, x.zr + (x.zc - x.zr) * (0.5 + u), dia, c, m ? M : {});
  });

const horns = (x: Ctx, len: number, c: string) => {
  const head = x.g.bones.findIndex((k) => k.role === "head");
  for (const s of [1, -1]) {
    x.g.add(head, limb(s * x.o.hd * 0.28, x.hy + x.o.hd * 0.4, x.hz - x.o.hd * 0.05, x.hy + x.o.hd * 0.4 + len, x.hz - x.o.hd * 0.05 - len * 0.5, x.o.hd * 0.1, c));
  }
};

export const MAMMALS: Record<string, Def> = {
  // ---- dogs ----
  an_dog_terrier: dog("Terrier, small dog", ["#f2eee6", "#d8c4a0", "#a8703a"], {
    ax: 0.21, D: 0.15, L: 0.24, leg: 0.04, hd: 0.11, sn: 0.06, sw: 0.05, ear: "floppy", earS: 0.7, tail: "up", tailL: 0.14, roam: 1.2,
    extra: (x) => x.g.add(undefined, sp(0.02, x.ax + x.R * 0.55, 0.0, 0.1, "#a8703a"), sp(-0.01, x.ax + x.R * 0.4, 0.07, 0.07, "#a8703a")),
  }),
  an_dog_chihuahua: dog("Chihuahua, tiny dog", ["#d9b27a", DARKC, "#f0e2c8"], { ax: 0.14, D: 0.1, L: 0.15, leg: 0.026, hd: 0.085, sn: 0.03, sw: 0.035, ear: "point", earS: 1.7, tail: "up", tailL: 0.1, up: 0.025, roam: 1 }),
  an_dog_beagle: dog("Beagle", ["#b5733a", "#8a5a30", DARKC], {
    ax: 0.24, D: 0.2, L: 0.3, leg: 0.05, hd: 0.13, sn: 0.07, sw: 0.065, ear: "floppy", earS: 1.15, tail: "plume", tailL: 0.22, c2: WHITE, sock: WHITE,
    extra: (x) => x.g.add(undefined, sp(0, x.ax - x.R * 0.45, 0, x.o.D * 0.5, WHITE)),
  }),
  an_dog_spaniel: dog("Spaniel", ["#9a5a2e", DARKC, "#d9d0c0"], { ax: 0.27, D: 0.2, L: 0.3, leg: 0.055, hd: 0.14, sn: 0.075, sw: 0.07, ear: "floppy", earS: 1.6, tail: "plume", tailL: 0.15, c2: WHITE }),
  an_dog_labrador: dog("Labrador, large dog", ["#d9b574", DARKC, "#5b3b27", "#f0e6d0"], { ax: 0.33, D: 0.27, L: 0.38, leg: 0.075, hd: 0.17, sn: 0.1, sw: 0.085, ear: "floppy", earS: 0.95, tail: "plume", tailL: 0.34 }),
  an_dog_golden: dog("Golden retriever, large dog", ["#d49a45", "#e8c27a", "#a8642a"], { ax: 0.34, D: 0.28, L: 0.4, leg: 0.075, hd: 0.17, sn: 0.1, sw: 0.085, ear: "floppy", earS: 1.05, tail: "plume", tailL: 0.42 }),
  an_dog_shepherd: dog("German shepherd, large dog", [TAN, "#8a5a30", "#cfcfcf"], {
    ax: 0.38, D: 0.27, L: 0.46, leg: 0.07, hd: 0.17, sn: 0.12, sw: 0.075, ear: "point", earS: 1.25, tail: "plume", tailL: 0.4, c3: "#2f2926", lc: TAN, sitPitch: 0.7,
    extra: (x) => x.g.add(undefined, sp(0, x.ax + x.R * 0.42, 0.02, 0.22, DARKC)),
  }),
  an_dog_husky: dog("Husky, large dog", ["#8f959c", DARKC, "#f2efe9", "#b5733a"], { ax: 0.33, D: 0.26, L: 0.4, leg: 0.07, hd: 0.16, sn: 0.08, sw: 0.07, ear: "point", earS: 0.95, tail: "curl", c2: "#f4f1ec", c3: "#f4f1ec", sock: "#f4f1ec" }),
  an_dog_dachshund: dog("Dachshund, long small dog", ["#7a4a2a", DARKC, "#b5733a"], { ax: 0.12, D: 0.14, L: 0.42, leg: 0.045, hd: 0.11, sn: 0.09, sw: 0.05, ear: "floppy", earS: 1.1, tail: "long", tailL: 0.22, hind2: false, up: 0.01, roam: 1.2 }),
  an_dog_bulldog: dog("Bulldog, stocky dog", ["#e6d3b3", "#c9b08a", "#7a5a3a"], { ax: 0.26, D: 0.3, L: 0.3, leg: 0.09, hd: 0.22, sn: 0.035, sw: 0.13, ear: "floppy", earS: 0.45, tail: "stub", hind2: false, up: -0.01, fwd: 0.07, nose: DARKC, c3: "#d9b896" }),
  an_dog_poodle: dog("Poodle", ["#f2efe9", DARKC, "#c9a36a", "#8a8a8a"], {
    ax: 0.34, D: 0.22, L: 0.3, leg: 0.045, hd: 0.14, sn: 0.12, sw: 0.055, ear: "floppy", earS: 1.1, tail: "pom", tailL: 0.2,
    extra: (x) => {
      const head = x.g.bones.findIndex((k) => k.role === "head");
      x.g.add(head, sp(0, x.hy + x.o.hd * 0.5, x.hz - x.o.hd * 0.1, x.o.hd * 0.85, x.o.coats[0], M));
      x.g.add(undefined, ...[1, -1].flatMap((s) => [sp(s * x.R * 0.52, 0.06, x.zc - 0.02, 0.1, x.o.coats[0], M), sp(s * x.R * 0.52, 0.06, x.zr + 0.04, 0.1, x.o.coats[0], M)]));
    },
  }),

  // ---- cats ----
  an_cat: cat("Cat, short hair", ["#8a8d92", "#d98a3c", DARKC, "#f2eee6", "#c9b49a"], {
    ax: 0.17, D: 0.14, L: 0.22, leg: 0.035, hd: 0.105, sn: 0.035, sw: 0.045, earS: 1.1, tail: "up", tailL: 0.32, nose: PINKNOSE, sitPitch: 0.85,
    extra: (x) => x.g.add(undefined, ...[-0.06, 0, 0.06].map((z) => b(0, x.ax + x.R * 0.96, z, 0.075, 0.012, 0.014, "#5d6066"))),
  }),
  an_cat_fluffy: cat("Cat, long hair", ["#e8dcc4", "#8a8d92", DARKC, "#d98a3c"], {
    ax: 0.18, D: 0.17, L: 0.22, leg: 0.045, hd: 0.12, sn: 0.03, sw: 0.05, earS: 0.9, tail: "plume", tailL: 0.3, nose: PINKNOSE, sitPitch: 0.85,
    extra: (x) => {
      const head = x.g.bones.findIndex((k) => k.role === "head");
      x.g.add(head, ...pair((s) => sp(s, x.hy - x.o.hd * 0.3, x.hz + x.o.hd * 0.1, x.o.hd * 0.55, x.o.coats[0], M), x.o.hd * 0.32));
    },
  }),
  an_kitten: cat("Kitten", ["#d98a3c", "#8a8d92", DARKC, "#f2eee6"], { ax: 0.09, D: 0.08, L: 0.11, leg: 0.022, hd: 0.07, sn: 0.02, sw: 0.03, earS: 1.3, tail: "up", tailL: 0.14, nose: PINKNOSE, sitPitch: 0.85, roam: 1 }),

  // ---- small pets and garden visitors ----
  an_rabbit: quad({ label: "Rabbit", kind: "hop", coats: ["#b59a7a", "#f2eee6", "#7a7a7a", DARKC], ax: 0.1, D: 0.13, L: 0.14, leg: 0.03, hind2: true, hd: 0.085, sn: 0.025, sw: 0.04, ear: "long", earS: 1.15, tail: "stub", poses: ["stand", "sit", "lie"], sitPitch: 0.5, nose: PINKNOSE }),
  an_guinea_pig: quad({ label: "Guinea pig", kind: "small", coats: ["#c9a36a", "#f2eee6", DARKC, "#8a5a30"], ax: 0.06, D: 0.11, L: 0.12, leg: 0.022, hd: 0.07, sn: 0.02, sw: 0.04, ear: "floppy", earS: 0.35, tail: "none", poses: ["stand", "lie"], nose: PINKNOSE }),
  an_hedgehog: quad({
    label: "Hedgehog", kind: "slow", coats: ["#6b5645", "#8a7a66"], ax: 0.05, D: 0.12, L: 0.1, leg: 0.022, hd: 0.06, sn: 0.04, sw: 0.03, ear: "none", tail: "none", poses: ["stand"], hc: "#d9c7a8", lc: "#d9c7a8",
    extra: (x) => x.g.add(undefined, sp(0, x.ax + x.R * 0.35, x.zr + 0.08, 0.15, "#6b5645", M), sp(0, x.ax + x.R * 0.25, x.zr + 0.02, 0.13, "#7a6552", M)),
  }),
  an_fox: quad({
    label: "Fox (garden visitor)", kind: "dog", coats: ["#c8632a"], ax: 0.28, D: 0.16, L: 0.36, leg: 0.04, hind2: true, hd: 0.12, sn: 0.1, sw: 0.05, ear: "point", earS: 1.5, tail: "plume", tailL: 0.42, c2: WHITE, sock: DARKC, c3: "#d9a07a", poses: ["stand", "sit", "lie"], roam: 2,
  }),
  an_tortoise: quad({
    label: "Tortoise", kind: "slow", coats: ["#6a7a3a", "#8a6a3a", "#4a5a3a"], ax: 0.05, D: 0.1, L: 0.1, leg: 0.03, hd: 0.05, sn: 0.02, sw: 0.03, ear: "none", tail: "none", poses: ["stand"], hc: "#9a8a6a", lc: "#9a8a6a",
    extra: (x) => x.g.add(undefined, sp(0, 0.08, 0, 0.16, x.o.coats[0], M), sp(0, 0.1, 0.0, 0.1, "#4a5a2a")),
  }),

  // ---- farm animals ----
  an_goat: quad({
    label: "Goat", kind: "hoof", coats: ["#f2eee6", "#8a5a30", DARKC, "#c9b49a"], ax: 0.5, D: 0.27, L: 0.45, leg: 0.05, hind2: true, hoof: true, hd: 0.15, sn: 0.1, sw: 0.075, ear: "floppy", earS: 0.75, tail: "up", tailL: 0.1, poses: ["stand", "lie"], up: 0.08, fwd: 0.12,
    extra: (x) => {
      horns(x, 0.12, "#5a5148");
      x.g.add(x.g.bones.findIndex((k) => k.role === "head"), b(0, x.hy - x.o.hd * 0.55, x.hz + x.o.hd * 0.3, 0.03, 0.07, 0.03, "#e8e2d6"));
    },
  }),
  an_sheep: quad({
    label: "Sheep", kind: "hoof", coats: ["#efece4", "#4a4440", "#8a7a66"], ax: 0.48, D: 0.4, L: 0.38, leg: 0.05, hind2: true, hoof: true, hd: 0.14, sn: 0.08, sw: 0.07, ear: "floppy", earS: 0.7, tail: "stub", poses: ["stand", "lie"], hc: "#3a3330", lc: "#3a3330", fwd: 0.06, up: 0.0,
    extra: (x) => x.g.add(undefined, ...dots(x, 6, 0.24, x.ax + x.R * 0.62, x.o.coats[0], true), sp(0, x.ax + x.R * 0.7, x.zc + 0.06, 0.2, x.o.coats[0], M)),
  }),
  an_pig: quad({
    label: "Pig", kind: "hoof", coats: ["#e8b4b0", "#4a3f3a", "#a86a4a"], ax: 0.36, D: 0.4, L: 0.5, leg: 0.07, hoof: true, hd: 0.22, sn: 0.07, sw: 0.12, ear: "floppy", earS: 0.7, tail: "curl", poses: ["stand", "lie"], up: -0.04, fwd: 0.04, nose: "#c98a8a",
    extra: (x) => x.g.add(x.g.bones.findIndex((k) => k.role === "head"), cy(0, x.hy - x.o.hd * 0.12 + 0.005, x.hz + x.o.hd * 0.28 + x.o.sn + 0.005, 0.1, 0.02, "#d99a98", { r: [Math.PI / 2, 0, 0] })),
  }),
  an_cow: quad({
    label: "Cow", kind: "hoof", coats: ["#f0ece4", "#8a5a3a", DARKC, "#c88a4a"], ax: 0.82, D: 0.6, L: 0.78, leg: 0.14, hind2: true, hoof: true, hd: 0.3, sn: 0.16, sw: 0.22, ear: "floppy", earS: 0.45, tail: "hang", tailL: 0.62, poses: ["stand", "lie"], up: -0.12, fwd: 0.2, neck: 0.24, nose: "#c98a8a", c3: "#e8c4c0", roam: 3,
    extra: (x) => {
      horns(x, 0.1, "#e8e2d6");
      x.g.add(undefined, sp(0.12, x.ax + x.R * 0.7, 0.08, 0.3, DARKC), sp(-0.15, x.ax + x.R * 0.5, -0.15, 0.26, DARKC), sp(0.2, x.ax + x.R * 0.2, x.zr + 0.04, 0.25, DARKC), sp(0, x.ax - x.R * 0.8, x.zr + 0.1, 0.2, "#e0a9a5"));
    },
  }),
  an_horse: quad({
    label: "Horse", kind: "hoof", coats: ["#7a4a2a", DARKC, "#e8e2d6", "#a8703a", "#c9a36a"], ax: 1.08, D: 0.56, L: 0.85, leg: 0.125, hind2: true, hoof: true, hd: 0.26, sn: 0.22, sw: 0.14, ear: "point", earS: 0.6, tail: "plume", tailL: 0.6, tailDrop: 0.6, poses: ["stand", "lie"], up: 0.28, fwd: 0.42, neck: 0.27, roam: 3,
    extra: (x) => {
      const head = x.g.bones.findIndex((k) => k.role === "head");
      x.g.add(head, ...[0.0, 0.2, 0.4].map((k) => b(0, x.ax + x.R * 0.45 + k * 0.5, x.zc + x.R * 0.15 - k * 0.15, 0.04, 0.12, 0.1, DARKC)));
    },
  }),
  an_pony: quad({
    label: "Pony", kind: "hoof", coats: ["#a8703a", DARKC, "#e8e2d6", "#7a4a2a"], ax: 0.68, D: 0.42, L: 0.68, leg: 0.095, hind2: true, hoof: true, hd: 0.2, sn: 0.15, sw: 0.11, ear: "point", earS: 0.7, tail: "plume", tailL: 0.5, tailDrop: 0.6, poses: ["stand", "lie"], up: 0.22, fwd: 0.3, neck: 0.2, roam: 3,
    extra: (x) => {
      const head = x.g.bones.findIndex((k) => k.role === "head");
      x.g.add(head, ...[0.0, 0.2, 0.4].map((k) => b(0, x.ax + x.R * 0.45 + k * 0.3, x.zc + x.R * 0.15 - k * 0.1, 0.035, 0.09, 0.08, "#2b2623")));
    },
  }),
  an_donkey: quad({
    label: "Donkey", kind: "hoof", coats: ["#8a8a8a", "#6a5a4a", "#c9c2b6"], ax: 0.76, D: 0.44, L: 0.7, leg: 0.09, hind2: true, hoof: true, hd: 0.2, sn: 0.16, sw: 0.12, ear: "long", earS: 0.95, tail: "hang", tailL: 0.5, poses: ["stand", "lie"], up: 0.2, fwd: 0.26, neck: 0.19, c3: "#d9d2c4", roam: 3,
  }),
  an_alpaca: quad({
    label: "Alpaca", kind: "hoof", coats: ["#e8dcc4", "#8a6a4a", DARKC, "#f2eee6"], ax: 0.68, D: 0.36, L: 0.5, leg: 0.06, hind2: true, hoof: true, hd: 0.15, sn: 0.05, sw: 0.08, ear: "point", earS: 0.8, tail: "stub", poses: ["stand", "lie"], up: 0.5, fwd: 0.16, neck: 0.12, roam: 2,
    extra: (x) => {
      const head = x.g.bones.findIndex((k) => k.role === "head");
      x.g.add(undefined, sp(0, x.ax + x.R * 0.55, 0, 0.3, x.o.coats[0], M));
      x.g.add(head, sp(0, x.hy + x.o.hd * 0.42, x.hz, 0.12, x.o.coats[0], M));
    },
  }),
};
