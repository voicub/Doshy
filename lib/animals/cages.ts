import type { Def, Part } from "../catalog";
import { b, cy, sp } from "../partKit.ts";

// Pets that live in a case: hamster cage with a running wheel, fish tank. Plain parts, no wandering. Metres.

const def = (label: string, w: number, d: number, h: number, parts: Part[], extra: Partial<Def> = {}): Def => ({ label, brand: "Generic", cat: "Animals", w, d, h, parts, ...extra });
const BAR = "#b8bcc2";
const GLASS = "#bfe6ee";

/** Hamster cage 0.5 x 0.3 x 0.3 m: tray, wire bars, a wheel that turns while the linked sensor is active, house, bowl, a hamster. */
function hamsterCage(): Def {
  const parts: Part[] = [b(0, 0.04, 0, 0.5, 0.08, 0.3, "#d9d4c7"), b(0, 0.085, 0, 0.47, 0.01, 0.27, "#e3cf9a")];
  for (let i = 0; i <= 12; i++) parts.push(cy(-0.235 + (i * 0.47) / 12, 0.19, 0.145, 0.005, 0.22, BAR), cy(-0.235 + (i * 0.47) / 12, 0.19, -0.145, 0.005, 0.22, BAR));
  for (let i = 1; i < 6; i++) parts.push(cy(-0.235, 0.19, -0.145 + (i * 0.29) / 6, 0.005, 0.22, BAR), cy(0.235, 0.19, -0.145 + (i * 0.29) / 6, 0.005, 0.22, BAR));
  parts.push(b(0, 0.3, 0, 0.5, 0.02, 0.3, "#d9d4c7"), cx(0, 0.3, 0.15, 0.5, "#d9d4c7"), cx(0, 0.3, -0.15, 0.5, "#d9d4c7"));
  // house, bowl, wheel, hamster
  parts.push(b(-0.15, 0.13, -0.07, 0.12, 0.09, 0.1, "#c9a26b"), b(-0.15, 0.18, -0.07, 0.14, 0.02, 0.12, "#b8643f"));
  parts.push(cy(0.04, 0.1, 0.1, 0.06, 0.03, "#c8432d"));
  parts.push(b(0.17, 0.17, -0.03, 0.14, 0.012, 0.14, "#5ad7ff", { shape: "cyl", r: [0, 0, Math.PI / 2], spin: { axis: "x", rpm: 25 } }));
  parts.push(sp(0.04, 0.12, -0.02, 0.07, "#d9a05a"), sp(0.04, 0.15, 0.025, 0.05, "#d9a05a"), sp(0.04, 0.17, 0.05, 0.02, "#2a2321"));
  return def("Hamster cage 0.5 x 0.3 m", 0.5, 0.3, 0.32, parts, { tags: "hamster mouse rat gerbil rodent pet cage wheel" });
}

/** Cylinder lying along x with a flat end (a rim bar): length, centre z. */
function cx(x: number, y: number, z: number, len: number, c: string): Part {
  return b(x, y, z, 0.012, len, 0.012, c, { shape: "cyl", r: [0, 0, Math.PI / 2] });
}

/** Aquarium 0.8 x 0.35 x 0.5 m on a stand: three glass sides and a back (the front is left open so you can see in), gravel, plants, rocks, fish, a light bar. */
function fishTank(): Def {
  const parts: Part[] = [
    b(0, 0.2, 0, 0.8, 0.4, 0.35, "#4a3f36"),
    b(0, 0.405, 0, 0.82, 0.01, 0.37, "#2a2e33"),
    b(0, 0.47, -0.17, 0.78, 0.13, 0.012, "#7fc8d8"),
    b(0.395, 0.47, 0, 0.012, 0.13, 0.34, GLASS),
    b(-0.395, 0.47, 0, 0.012, 0.13, 0.34, GLASS),
    b(0, 0.425, 0, 0.78, 0.03, 0.34, "#e3cf9a"),
    b(0, 0.535, 0.17, 0.8, 0.012, 0.012, "#2a2e33"),
    b(0.4, 0.535, 0, 0.012, 0.012, 0.35, "#2a2e33"),
    b(-0.4, 0.535, 0, 0.012, 0.012, 0.35, "#2a2e33"),
    b(0, 0.56, 0, 0.8, 0.03, 0.2, "#2a2e33"),
    b(0, 0.54, 0.05, 0.6, 0.012, 0.03, "#dff7ff", { glow: true }),
    sp(-0.25, 0.46, -0.05, 0.13, "#7a7f86"),
    sp(-0.18, 0.455, -0.08, 0.1, "#8a8f96"),
    cy(0.22, 0.5, -0.1, 0.02, 0.1, "#3f8a4a"),
    cy(0.26, 0.52, -0.08, 0.02, 0.14, "#2f7a3a"),
    cy(-0.32, 0.51, -0.1, 0.02, 0.12, "#3f8a4a"),
    sp(0.1, 0.5, 0.0, 0.05, "#f2872d"),
    b(0.07, 0.5, 0.0, 0.03, 0.04, 0.012, "#f2872d", { r: [0, 0, 0.3] }),
    sp(-0.05, 0.54, 0.06, 0.04, "#5ad7ff"),
    b(-0.075, 0.54, 0.06, 0.025, 0.03, 0.01, "#5ad7ff"),
    sp(0.3, 0.45, 0.07, 0.035, "#f2d255"),
    b(0.325, 0.45, 0.07, 0.02, 0.025, 0.01, "#f2d255"),
  ];
  return def("Fish tank 0.8 x 0.35 m", 0.82, 0.37, 0.57, parts, { light: { y: 0.53, color: "#cfefff", k: 0.5 }, tags: "aquarium fish tank pet water" });
}

export const CAGES: Record<string, Def> = { an_hamster_cage: hamsterCage(), an_fish_tank: fishTank() };
