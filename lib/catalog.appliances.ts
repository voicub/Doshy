import type { Def, Part } from "./catalog";
import { APPLIANCES_CLIMATE } from "./catalog.appliances-climate.ts";
import { APPLIANCES_DEVICES } from "./catalog.appliances-devices.ts";
import { b, cy, rotor, PI2, WHITE, SEAM, STEEL, DSTEEL, GRAPHITE, BLACK, GLASS, CHROME } from "./catalog.appliances-parts.ts";
import { turned, FAB } from "./partsKit.ts";
// Kitchen and laundry appliances. Every def keeps its front handles inside its footprint depth.
const GAP = "#6f7378"; // dark gap between doors
const kn = (x: number, y: number, z: number, dia = 0.04, c = BLACK) => cy(x, y, z, dia, 0.02, c, { r: [PI2, 0, 0] }); // knob facing front, centred on z (depth 0.02)
const vbar = (x: number, y: number, len: number, z: number, c = CHROME) => b(x, y, z, 0.018, len, 0.018, c, { bevel: 0.007 }); // vertical handle
const hbar = (x: number, y: number, len: number, z: number, c = CHROME) => b(x, y, z, len, 0.018, 0.018, c, { bevel: 0.007 }); // horizontal handle

// ---------- fridges: doors 30 mm thick, front plane 20 mm behind the handle line ----------
type Layout = "bottom" | "side" | "french" | "under" | "mini";
const fridge = (layout: Layout, w: number, d: number, h: number, c: string, plinth = 0.06): Def["parts"] => {
  const zf = d / 2 - 0.02; // door front plane
  const dz = zf - 0.015; // door centre z
  const door = (x: number, y0: number, y1: number, dw: number): Part => b(x, (y0 + y1) / 2, dz, dw, y1 - y0, 0.03, c, { m: true, bevel: 0.01 });
  const top = h - 0.01;
  const parts: Part[] = [
    b(0, plinth / 2, -0.01, w - 0.04, plinth, d - 0.08, BLACK),
    b(0, (h + plinth) / 2, -0.025, w, h - plinth, d - 0.05, c, { m: true, bevel: 0.012 }),
  ];
  if (layout === "bottom") {
    const fz = 0.62;
    parts.push(door(0, plinth + 0.01, fz, w - 0.01), door(0, fz + 0.006, top, w - 0.01));
    parts.push(b(0, fz + 0.003, zf - 0.005, w, 0.008, 0.01, GAP), hbar(0, fz - 0.04, w * 0.6, zf + 0.01, DSTEEL), vbar(-w / 2 + 0.05, fz + 0.4, 0.5, zf + 0.01, DSTEEL));
    parts.push(b(0.12, top - 0.2, zf + 0.003, 0.14, 0.05, 0.006, GLASS, { glow: true }));
  } else if (layout === "french") {
    const fz = 0.62;
    const hw = (w - 0.016) / 2;
    parts.push(door(-hw / 2 - 0.003, fz + 0.006, top, hw), door(hw / 2 + 0.003, fz + 0.006, top, hw), door(0, plinth + 0.01, fz, w - 0.01));
    parts.push(b(0, fz + 0.003, zf - 0.005, w, 0.008, 0.01, GAP), b(0, (fz + top) / 2, zf - 0.005, 0.008, top - fz, 0.01, GAP));
    parts.push(vbar(-0.035, 1.2, 0.5, zf + 0.01, DSTEEL), vbar(0.035, 1.2, 0.5, zf + 0.01, DSTEEL), hbar(0, fz - 0.04, w * 0.55, zf + 0.01, DSTEEL));
    parts.push(b(0.2, top - 0.3, zf + 0.003, 0.12, 0.05, 0.006, GLASS, { glow: true }));
  } else if (layout === "side") {
    const lw = w * 0.38;
    const rw = w - lw - 0.016;
    const lx = -w / 2 + 0.005 + lw / 2;
    const rx = w / 2 - 0.005 - rw / 2;
    parts.push(door(lx, plinth + 0.01, top, lw), door(rx, plinth + 0.01, top, rw));
    parts.push(b(lx + lw / 2 + 0.005, (plinth + top) / 2, zf - 0.005, 0.008, top - plinth, 0.01, GAP));
    parts.push(vbar(lx + lw / 2 - 0.035, 1.1, 0.7, zf + 0.01, DSTEEL), vbar(rx - rw / 2 + 0.035, 1.1, 0.7, zf + 0.01, DSTEEL));
    parts.push(b(lx - 0.02, 1.2, zf + 0.004, 0.17, 0.34, 0.008, "#101214"), b(lx - 0.02, 1.0, zf + 0.012, 0.12, 0.02, 0.02, DSTEEL)); // water dispenser alcove and tray
    parts.push(b(lx - 0.02, 1.43, zf + 0.004, 0.12, 0.04, 0.008, GLASS, { glow: true }));
  } else if (layout === "under") {
    const fz = h - 0.2;
    parts.push(door(0, plinth + 0.01, fz, w - 0.01), door(0, fz + 0.006, top, w - 0.01));
    parts.push(b(0, fz + 0.003, zf - 0.005, w, 0.008, 0.01, GAP), vbar(-w / 2 + 0.05, (plinth + fz) / 2 + 0.1, 0.3, zf + 0.01), hbar(0, top - 0.025, 0.12, zf + 0.01, DSTEEL));
    parts.push(b(0.2, fz - 0.05, zf + 0.003, 0.08, 0.03, 0.006, GLASS, { glow: true }));
  } else {
    parts.push(door(0, plinth + 0.01, top, w - 0.01), vbar(w / 2 - 0.05, h * 0.55, 0.22, zf + 0.01, DSTEEL), b(-0.08, h * 0.85, zf + 0.003, 0.1, 0.03, 0.006, GLASS, { glow: true }));
  }
  return parts;
};

const chestFreezer: Part[] = [
  ...[-1, 1].flatMap((sx) => [-1, 1].map((sz) => cy(sx * 0.44, 0.03, sz * 0.25, 0.05, 0.06, BLACK))),
  b(0, 0.43, -0.005, 0.97, 0.74, 0.59, WHITE, { m: true, bevel: 0.015 }),
  b(0, 0.825, 0, 1.0, 0.05, 0.62, WHITE, { m: true, bevel: 0.015 }),
  b(0, 0.8, 0.307, 0.98, 0.006, 0.01, GAP), // lid seam
  b(0, 0.835, 0.31, 0.5, 0.02, 0.01, "#9aa0a6"), // lid grip
  b(-0.35, 0.62, 0.296, 0.14, 0.12, 0.01, GRAPHITE),
  b(-0.35, 0.65, 0.302, 0.05, 0.025, 0.004, GLASS, { glow: true }),
  kn(-0.38, 0.6, 0.3, 0.035),
  b(0.42, 0.62, 0.296, 0.03, 0.03, 0.01, CHROME), // lock
  b(0, 0.76, 0.296, 0.4, 0.02, 0.01, "#9aa0a6"),
];

// ---------- cooking ----------
const ovenBuiltIn: Part[] = [
  b(0, 0.3, -0.02, 0.6, 0.6, 0.53, STEEL, { m: true, bevel: 0.008 }),
  b(0, 0.54, 0.255, 0.6, 0.12, 0.02, GRAPHITE),
  b(0, 0.555, 0.267, 0.12, 0.03, 0.004, GLASS, { glow: true }),
  ...[-0.2, -0.13, 0.13, 0.2].map((x) => kn(x, 0.54, 0.275, 0.035)),
  b(0, 0.25, 0.255, 0.58, 0.42, 0.02, GLASS), // door glass
  b(0, 0.25, 0.266, 0.46, 0.28, 0.006, "#0b0c0e"),
  b(0, 0.485, 0.265, 0.6, 0.006, 0.02, GAP),
  hbar(0, 0.44, 0.48, 0.275),
  ...[-0.22, 0.22].map((x) => b(x, 0.44, 0.263, 0.018, 0.018, 0.018, CHROME)),
];

const ovenTower: Part[] = [
  b(0, 1.05, -0.01, 0.6, 2.1, 0.58, "#4a4e55"),
  b(0, 0.04, 0.26, 0.56, 0.08, 0.04, BLACK),
  b(0, 0.47, 0.285, 0.596, 0.76, 0.03, "#42464c", { m: true }), // lower unit door
  vbar(-0.24, 0.5, 0.4, 0.3, BLACK),
  b(0, 1.435, 0.286, 0.596, 0.1, 0.028, "#42464c", { m: true }),
  b(0, 1.44, 0.3, 0.12, 0.03, 0.004, GLASS, { glow: true }),
  ...[-0.2, -0.13, 0.13, 0.2].map((x) => kn(x, 1.43, 0.3, 0.035)),
  b(0, 1.16, 0.286, 0.58, 0.45, 0.028, GLASS), // oven door
  b(0, 1.16, 0.3, 0.46, 0.3, 0.006, "#0b0c0e"),
  hbar(0, 1.36, 0.48, 0.302),
  b(0, 1.755, 0.285, 0.596, 0.64, 0.03, "#42464c", { m: true }), // upper unit door
  vbar(-0.24, 1.55, 0.3, 0.3, BLACK),
  b(0, 0.855, 0.286, 0.6, 0.006, 0.03, GAP),
  b(0, 1.495, 0.286, 0.6, 0.006, 0.03, GAP),
];

// 90 cm gas range: five burners with cast-iron grates, two ovens
const range90: Part[] = (() => {
  const burners: [number, number, number][] = [[-0.3, -0.12, 0.1], [-0.3, 0.14, 0.1], [0, 0.0, 0.13], [0.3, -0.12, 0.1], [0.3, 0.14, 0.1]];
  return [
    b(0, 0.04, 0.0, 0.86, 0.08, 0.6, BLACK),
    b(0, 0.47, -0.02, 0.9, 0.78, 0.62, STEEL, { m: true }),
    b(0, 0.9, -0.02, 0.9, 0.04, 0.62, BLACK), // hob top
    b(0, 0.93, -0.3, 0.9, 0.06, 0.02, STEEL, { m: true }), // rear upstand
    ...burners.flatMap(([x, z, r]) => [
      cy(x, 0.926, z, r * 1.0, 0.012, GRAPHITE),
      cy(x, 0.935, z, r * 0.45, 0.012, STEEL),
      b(x, 0.945, z, r * 2.0, 0.014, 0.02, BLACK),
      b(x, 0.945, z, 0.02, 0.014, r * 2.0, BLACK),
      cy(x, 0.952, z, r * 0.35, 0.012, "#2a2c30", { detail: 1 }), // burner cap
    ]),
    b(0, 0.8, 0.29, 0.9, 0.1, 0.03, STEEL, { m: true }),
    ...[-0.32, -0.16, 0.16, 0.32].map((x) => kn(x, 0.8, 0.31, 0.04)),
    b(0, 0.8, 0.307, 0.12, 0.03, 0.004, GLASS, { glow: true }),
    b(-0.16, 0.42, 0.29, 0.5, 0.58, 0.02, GLASS), // big oven door
    b(-0.16, 0.4, 0.302, 0.4, 0.38, 0.006, "#0b0c0e"),
    hbar(-0.16, 0.68, 0.46, 0.307),
    b(0.28, 0.42, 0.29, 0.3, 0.58, 0.02, GLASS), // second oven
    b(0.28, 0.4, 0.302, 0.22, 0.38, 0.006, "#0b0c0e"),
    hbar(0.28, 0.68, 0.26, 0.307),
    b(0.1, 0.42, 0.29, 0.008, 0.6, 0.02, GAP),
  ];
})();

const stove60: Part[] = [
  b(0, 0.04, 0.0, 0.56, 0.08, 0.58, BLACK),
  b(0, 0.46, -0.02, 0.6, 0.76, 0.6, WHITE, { m: true }),
  b(0, 0.89, -0.02, 0.6, 0.02, 0.6, GLASS), // ceramic hob
  ...[[-0.15, -0.13, 0.16], [0.15, -0.13, 0.2], [-0.15, 0.1, 0.2], [0.15, 0.1, 0.14]].flatMap(([x, z, r]) => [cy(x, 0.9, z, r, 0.003, "#4a2a2a"), cy(x, 0.903, z, r - 0.02, 0.003, GLASS)]),
  b(0, 0.8, 0.29, 0.6, 0.1, 0.02, GRAPHITE),
  ...[-0.21, -0.07, 0.07, 0.21].map((x) => kn(x, 0.8, 0.31, 0.045, "#2a2c30")),
  b(0, 0.835, 0.301, 0.1, 0.02, 0.004, GLASS, { glow: true }),
  b(0, 0.4, 0.29, 0.52, 0.5, 0.02, GRAPHITE),
  b(0, 0.38, 0.302, 0.42, 0.32, 0.006, "#0b0c0e"),
  hbar(0, 0.62, 0.5, 0.307),
];

const hobInduction: Part[] = [
  b(0, 0.0125, 0, 0.6, 0.025, 0.52, STEEL),
  b(0, 0.03, 0, 0.594, 0.02, 0.514, GLASS),
  ...[[-0.15, -0.09, 0.18], [0.15, -0.09, 0.21], [-0.15, 0.1, 0.21], [0.15, 0.1, 0.18]].flatMap(([x, z, r]) => [cy(x, 0.0405, z, r, 0.001, "#4b4f58"), cy(x, 0.0412, z, r - 0.012, 0.001, GLASS)]),
  b(0, 0.0415, 0.225, 0.3, 0.001, 0.02, "#2c3038"),
  b(0, 0.0422, 0.225, 0.08, 0.001, 0.012, GLASS, { glow: true }),
];

const hoodChimney: Part[] = [
  b(0, 1.64, 0.0, 0.6, 0.08, 0.5, STEEL, { m: true }),
  b(0, 1.74, -0.04, 0.5, 0.12, 0.4, STEEL, { m: true }),
  b(0, 2.2, -0.15, 0.3, 0.76, 0.2, STEEL, { m: true }),
  b(0, 1.598, 0.0, 0.5, 0.004, 0.4, GRAPHITE),
  b(0, 1.642, 0.249, 0.5, 0.03, 0.004, GLASS),
  ...[-0.1, 0, 0.1].map((x) => b(x, 1.642, 0.2515, 0.025, 0.012, 0.004, "#dff0ff", { glow: true })),
  ...[-0.15, 0.15].map((x) => cy(x, 1.596, 0.12, 0.05, 0.004, "#dff0ff", { glow: true })),
];

const hoodIsland: Part[] = [
  b(0, 1.74, 0, 0.9, 0.06, 0.6, STEEL, { m: true }),
  b(0, 1.82, 0, 0.7, 0.1, 0.42, STEEL, { m: true }),
  b(0, 2.23, 0, 0.3, 0.7, 0.3, STEEL, { m: true }),
  b(0, 2.585, 0, 0.36, 0.03, 0.36, DSTEEL),
  b(0, 1.708, 0, 0.8, 0.004, 0.5, GRAPHITE),
  ...[-0.3, -0.1, 0.1, 0.3].map((x) => cy(x, 1.706, 0.18, 0.05, 0.004, "#dff0ff", { glow: true })),
  ...[-0.3, -0.1, 0.1, 0.3].map((x) => cy(x, 1.706, -0.18, 0.05, 0.004, "#dff0ff", { glow: true })),
];

// ---------- dishwashers ----------
const dishwasher: Part[] = [
  b(0, 0.03, -0.01, 0.56, 0.06, 0.56, BLACK),
  b(0, 0.455, -0.03, 0.6, 0.79, 0.56, WHITE, { m: true, bevel: 0.01 }),
  b(0, 0.4, 0.265, 0.6, 0.68, 0.03, WHITE, { m: true, bevel: 0.008 }),
  b(0, 0.7975, 0.265, 0.6, 0.105, 0.03, WHITE, { m: true, bevel: 0.008 }),
  b(0, 0.742, 0.282, 0.6, 0.005, 0.005, GAP),
  b(0, 0.8, 0.282, 0.5, 0.05, 0.004, GLASS),
  b(0.12, 0.8, 0.285, 0.12, 0.022, 0.004, "#dff0ff", { glow: true }),
  ...[-0.2, -0.14, -0.08].map((x) => b(x, 0.8, 0.285, 0.03, 0.02, 0.004, DSTEEL)),
  ...[-0.2, 0.2].map((x) => b(x, 0.69, 0.2925, 0.015, 0.015, 0.015, CHROME)),
  hbar(0, 0.69, 0.46, 0.301),
];

const dishwasherIntegrated: Part[] = [
  b(0, 0.04, -0.01, 0.56, 0.08, 0.54, BLACK),
  b(0, 0.45, -0.025, 0.58, 0.74, 0.5, "#d9d8d4"),
  b(0, 0.45, 0.255, 0.598, 0.74, 0.03, GRAPHITE, { m: true }), // cabinet-style front
  b(0, 0.805, 0.272, 0.598, 0.02, 0.005, BLACK), // control strip on the top edge
  ...[-0.08, 0, 0.08].map((x) => b(x, 0.805, 0.2755, 0.04, 0.008, 0.004, "#dff0ff", { glow: true })),
  b(0, 0.71, 0.275, 0.36, 0.014, 0.02, BLACK), // pull
];

// ---------- microwaves ----------
const microwave: Part[] = [
  ...[-1, 1].flatMap((sx) => [-1, 1].map((sz) => b(sx * 0.19, 0.008, sz * 0.12, 0.03, 0.016, 0.03, BLACK))),
  b(0, 0.138, -0.01, 0.46, 0.244, 0.32, GRAPHITE, { m: true, bevel: 0.012 }),
  b(-0.0775, 0.138, 0.16, 0.3, 0.23, 0.02, GRAPHITE, { m: true }),
  b(-0.08, 0.14, 0.172, 0.24, 0.16, 0.004, "#0d0f12"),
  b(0.165, 0.138, 0.157, 0.125, 0.23, 0.014, "#2a2c30"),
  b(0.165, 0.2, 0.166, 0.09, 0.03, 0.004, GLASS, { glow: true }),
  kn(0.165, 0.12, 0.17, 0.05, STEEL),
  ...[0.145, 0.185].map((x) => b(x, 0.065, 0.166, 0.03, 0.015, 0.004, DSTEEL)),
  vbar(0.088, 0.14, 0.18, 0.171, STEEL),
  b(0, 0.262, -0.01, 0.3, 0.002, 0.2, "#101113"),
];

const microwaveBuiltIn: Part[] = [
  b(0, 0.19, -0.02, 0.6, 0.38, 0.5, STEEL, { m: true }),
  b(-0.07, 0.19, 0.26, 0.44, 0.36, 0.02, GLASS),
  b(-0.07, 0.2, 0.272, 0.36, 0.22, 0.004, "#0b0c0e"),
  b(0.245, 0.19, 0.262, 0.11, 0.36, 0.02, STEEL, { m: true }),
  b(0.245, 0.3, 0.274, 0.08, 0.03, 0.004, GLASS, { glow: true }),
  kn(0.245, 0.19, 0.276, 0.05, GRAPHITE),
  hbar(-0.07, 0.04, 0.4, 0.275),
];

// ---------- small kitchen appliances ----------
const coffeeEspresso: Part[] = [
  b(0, 0.02, 0.09, 0.3, 0.04, 0.22, STEEL),
  b(0, 0.043, 0.09, 0.27, 0.006, 0.19, GRAPHITE),
  b(0, 0.19, -0.14, 0.3, 0.38, 0.12, GRAPHITE, { m: true }),
  b(0, 0.3, -0.05, 0.3, 0.16, 0.26, GRAPHITE, { m: true }),
  b(0, 0.375, -0.1, 0.22, 0.05, 0.12, "#9fc9e6"), // water tank
  cy(0, 0.255, 0.1, 0.07, 0.04, STEEL),
  cy(0, 0.235, 0.125, 0.065, 0.025, BLACK),
  b(0, 0.235, 0.16, 0.02, 0.02, 0.07, BLACK),
  cy(-0.06, 0.075, 0.1, 0.06, 0.06, WHITE),
  cy(0.12, 0.2, 0.08, 0.012, 0.14, STEEL),
  kn(0.09, 0.32, 0.084, 0.05, STEEL),
  b(-0.07, 0.34, 0.084, 0.08, 0.025, 0.004, GLASS, { glow: true }),
];

const coffeePod: Part[] = [
  b(0, 0.02, 0.05, 0.13, 0.04, 0.2, BLACK),
  b(0, 0.17, -0.1, 0.13, 0.34, 0.1, BLACK, { m: true }),
  b(0, 0.27, -0.03, 0.13, 0.1, 0.2, BLACK, { m: true }),
  cy(0, 0.215, 0.04, 0.06, 0.04, STEEL),
  b(0, 0.215, 0.1, 0.03, 0.01, 0.01, "#dff0ff", { glow: true }),
  cy(0, 0.07, 0.04, 0.06, 0.07, WHITE),
  b(0, 0.31, 0.065, 0.1, 0.012, 0.004, STEEL),
];

const kettle: Def["parts"] = [
  cy(-0.02, 0.015, 0, 0.17, 0.03, BLACK),
  cy(-0.02, 0.036, 0, 0.172, 0.006, "#dff0ff", { glow: true }),
  turned(-0.02, 0.04, 0, [[0.075, 0], [0.08, 0.02], [0.075, 0.12], [0.06, 0.2]], STEEL, { tex: "metal", metal: 1, rough: 0.3, m: true }),
  cy(-0.02, 0.245, 0, 0.12, 0.016, BLACK),
  b(-0.02, 0.26, 0, 0.03, 0.01, 0.025, BLACK),
  b(-0.095, 0.22, 0, 0.05, 0.03, 0.045, STEEL), // spout
  b(0.085, 0.145, 0, 0.018, 0.17, 0.03, BLACK),
  b(0.065, 0.225, 0, 0.04, 0.02, 0.03, BLACK),
  b(0.065, 0.075, 0, 0.04, 0.02, 0.03, BLACK),
];

const toaster: Part[] = [
  ...[-1, 1].flatMap((sx) => [-1, 1].map((sz) => b(sx * 0.12, 0.008, sz * 0.06, 0.03, 0.016, 0.03, BLACK))),
  b(0, 0.11, 0, 0.3, 0.19, 0.17, STEEL, { m: true, bevel: 0.035 }),
  b(0, 0.2, 0, 0.31, 0.01, 0.175, BLACK),
  b(0, 0.206, -0.04, 0.22, 0.004, 0.03, "#0c0c0e"),
  b(0, 0.206, 0.04, 0.22, 0.004, 0.03, "#0c0c0e"),
  b(0.153, 0.12, 0.0, 0.012, 0.045, 0.034, BLACK), // lever
  b(0.153, 0.14, 0.0, 0.006, 0.09, 0.012, DSTEEL),
  kn(-0.11, 0.12, 0.09, 0.04, BLACK),
  b(0.1, 0.17, 0.087, 0.015, 0.012, 0.004, "#dff0ff", { glow: true }),
];

const standMixer: Part[] = [
  b(0, 0.03, 0.0, 0.22, 0.06, 0.3, "#b32f2a", { m: true, bevel: 0.015 }),
  b(0, 0.16, -0.1, 0.16, 0.22, 0.12, "#b32f2a", { m: true, bevel: 0.03 }),
  b(0, 0.29, -0.01, 0.15, 0.12, 0.3, "#b32f2a", { m: true, bevel: 0.04, tex: "paint", rough: 0.25 }),
  b(0, 0.29, 0.14, 0.12, 0.08, 0.01, "#8f2420"),
  turned(0, 0.06, 0.07, [[0.06, 0], [0.085, 0.02], [0.1, 0.1], [0.105, 0.14]], STEEL, { tex: "metal", metal: 1, rough: 0.3 }), // mixing bowl
  cy(0, 0.205, 0.07, 0.21, 0.012, DSTEEL),
  cy(0, 0.2, 0.07, 0.018, 0.1, DSTEEL, { spin: { axis: "y", rpm: 120 } }),
  b(0, 0.14, 0.07, 0.11, 0.09, 0.012, STEEL, { spin: { axis: "y", rpm: 120 } }), // beater
  b(0.085, 0.3, 0.0, 0.016, 0.02, 0.06, BLACK),
  b(0, 0.32, 0.135, 0.015, 0.012, 0.004, "#dff0ff", { glow: true }),
];

const airFryer: Part[] = [
  ...[-1, 1].flatMap((sx) => [-1, 1].map((sz) => b(sx * 0.1, 0.008, sz * 0.14, 0.03, 0.016, 0.03, BLACK))),
  b(0, 0.17, -0.03, 0.28, 0.31, 0.3, "#1f2023", { m: true, bevel: 0.04 }),
  b(0, 0.12, 0.14, 0.26, 0.2, 0.04, "#2b2d31", { m: true }), // basket front
  b(0, 0.15, 0.175, 0.15, 0.03, 0.03, BLACK),
  b(0, 0.31, 0.06, 0.24, 0.03, 0.1, GRAPHITE),
  b(0, 0.327, 0.06, 0.12, 0.004, 0.05, GLASS, { glow: true }),
  ...[-0.06, 0, 0.06].map((x) => b(x, 0.32, -0.08, 0.04, 0.004, 0.1, "#0c0c0e")),
  ...[-0.09, 0.09].map((x) => cy(x, 0.325, 0.06, 0.035, 0.008, DSTEEL)),
];

// glass-front wine fridge: dark glass door with bottle bottoms showing
const wine = (w: number, d: number, h: number, shelves: number): Part[] => {
  const zf = d / 2 - 0.02;
  const gh = h - 0.12;
  const rows = Array.from({ length: shelves }, (_, r) => {
    const y = 0.1 + ((r + 0.5) * (gh - 0.08)) / shelves;
    return Array.from({ length: 6 }, (_, i) => cy(-0.2 + i * 0.08, y, zf + 0.0, 0.07, 0.016, i % 3 === 0 ? "#2f4a2b" : i % 3 === 1 ? "#4a2f24" : "#1c2a1c", { r: [PI2, 0, 0] }));
  }).flat();
  return [
    b(0, 0.03, -0.01, w - 0.04, 0.06, d - 0.08, BLACK),
    b(0, (h + 0.06) / 2, -0.025, w, h - 0.06, d - 0.05, GRAPHITE, { m: true }),
    b(0, 0.06 + gh / 2 + 0.01, zf - 0.008, w - 0.04, gh, 0.016, "#2a323a"), // glass
    b(0, h - 0.03, zf - 0.005, w - 0.01, 0.04, 0.02, STEEL),
    b(0, 0.075, zf - 0.005, w - 0.01, 0.03, 0.02, STEEL),
    ...[-1, 1].map((sx) => b(sx * (w / 2 - 0.012), (h + 0.06) / 2, zf - 0.005, 0.02, h - 0.06, 0.02, STEEL)),
    ...rows,
    b(0, h - 0.07, zf - 0.012, w - 0.08, 0.01, 0.008, "#dff0ff", { glow: true }), // inside light strip
    vbar(-w / 2 + 0.05, h * 0.5, Math.min(0.5, h * 0.4), zf + 0.01, STEEL),
    b(0.2, h - 0.03, zf + 0.007, 0.08, 0.02, 0.004, GLASS, { glow: true }),
  ];
};

// ---------- laundry ----------
// one 60 cm drum machine whose floor is at y0; the drum star spins while it runs
const drumMachine = (y0: number, dryer: boolean, withFeet: boolean): Part[] => {
  const yc = y0 + 0.4;
  return [
    ...(withFeet ? [-1, 1].flatMap((sx) => [-1, 1].map((sz) => cy(sx * 0.26, y0 + 0.015, sz * 0.26, 0.05, 0.03, BLACK))) : []),
    b(0, y0 + 0.44, -0.015, 0.6, 0.82, 0.59, WHITE, { m: true, bevel: 0.012 }),
    b(0, y0 + 0.85 - 0.004, -0.015, 0.6, 0.008, 0.59, SEAM),
    cy(0, yc, 0.289, dryer ? 0.47 : 0.46, 0.03, CHROME, { r: [PI2, 0, 0] }),
    cy(0, yc, 0.291, 0.38, 0.03, "#1b1d21", { r: [PI2, 0, 0] }),
    cy(0, yc, 0.293, 0.32, 0.03, "#2b3b4b", { r: [PI2, 0, 0] }),
    ...rotor(0, yc, 0.308, 0.26, 0.03, 3, dryer ? 45 : 70, "z", "#cfe0ee", 0.004),
    b(0, y0 + 0.775, 0.286, 0.58, 0.11, 0.03, "#e6e5e1", { m: true }),
    b(0, y0 + 0.775 - 0.055, 0.286, 0.58, 0.004, 0.03, GAP),
    ...(dryer
      ? [b(-0.17, y0 + 0.775, 0.302, 0.12, 0.05, 0.004, GLASS), b(0.2, y0 + 0.06, 0.296, 0.18, 0.05, 0.01, DSTEEL)]
      : [b(-0.2, y0 + 0.78, 0.302, 0.15, 0.06, 0.004, "#9aa0a6"), b(-0.2, y0 + 0.77, 0.305, 0.1, 0.012, 0.004, BLACK)]),
    kn(0.12, y0 + 0.775, 0.3, 0.06, STEEL),
    b(0.2, y0 + 0.79, 0.305, 0.07, 0.025, 0.004, GLASS, { glow: true }),
    ...[0.2, 0.25].map((x) => b(x, y0 + 0.75, 0.304, 0.03, 0.014, 0.004, DSTEEL)),
  ];
};

const ironingBoard: Part[] = (() => {
  const legs = [-0.1, 0.1].flatMap((z) => [0.53, -0.53].map((a) => b(-0.125 + (a > 0 ? 0.025 : -0.025), 0.425, z, 0.022, 0.985, 0.022, DSTEEL, { r: [0, 0, a] })));
  const PAD = "#9fb7d6";
  return [
    b(-0.15, 0.885, 0, 0.9, 0.03, 0.34, PAD, { m: true, ...FAB, bevel: 0.012 }),
    b(0.375, 0.885, 0, 0.15, 0.03, 0.27, PAD, { m: true, ...FAB, bevel: 0.012 }),
    b(0.505, 0.885, 0, 0.11, 0.03, 0.2, PAD, { m: true, ...FAB, bevel: 0.012 }),
    b(0.58, 0.885, 0, 0.04, 0.03, 0.12, PAD, { m: true, ...FAB, bevel: 0.012 }),
    b(-0.15, 0.86, 0, 0.85, 0.012, 0.28, "#8c9096"),
    ...legs,
    cy(-0.125, 0.42, 0, 0.018, 0.24, DSTEEL, { r: [PI2, 0, 0] }),
    b(0.37, 0.915, 0, 0.26, 0.012, 0.1, STEEL), // iron resting on the board: sole, shell, handle
    b(0.37, 0.95, 0, 0.24, 0.06, 0.09, WHITE, { bevel: 0.02 }),
    b(0.36, 0.995, 0, 0.17, 0.02, 0.04, "#3f6fae"),
  ];
})();

const dryingRack: Part[] = (() => {
  const L = Math.hypot(0.25, 0.9);
  const phi = Math.asin(0.25 / L);
  const legs = [-0.64, 0.64].flatMap((x) => [1, -1].map((s) => b(x, 0.45, s * 0.145, 0.022, L, 0.022, "#d9dbde", { r: [-s * phi, 0, 0] })));
  const rails = [0.85, 0.7, 0.55, 0.4, 0.25].flatMap((y) => {
    const z = 0.02 + (0.25 * (0.9 - y)) / 0.9;
    return [z, -z].map((zz) => cy(0, y, zz, 0.014, 1.3, "#e8eaec", { r: [0, 0, PI2] }));
  });
  return [
    cy(0, 0.9, 0, 0.025, 1.34, "#c9ccd0", { r: [0, 0, PI2] }),
    ...legs,
    ...rails,
    b(-0.35, 0.7, 0.075, 0.4, 0.38, 0.012, "#7aa7c7", { r: [-0.16, 0, 0] }), // washing hung to dry
    b(0.1, 0.72, -0.07, 0.35, 0.34, 0.012, "#e8dcc4", { r: [0.16, 0, 0] }),
    b(0.45, 0.7, 0.075, 0.3, 0.36, 0.012, "#9a8f86", { r: [-0.16, 0, 0] }),
  ];
})();

const tag = (label: string, cat: Def["cat"], w: number, d: number, h: number, parts: Part[], more?: Partial<Def>): Def => ({ label, brand: "Generic", cat, w, d, h, parts, ...more });

const KITCHEN: Record<string, Def> = {
  ap_fridge_freezer: tag("Fridge-freezer, freezer below", "Appliances", 0.6, 0.66, 1.85, fridge("bottom", 0.6, 0.66, 1.85, "#eceeef")),
  ap_fridge_side: tag("American fridge, side by side", "Appliances", 0.91, 0.73, 1.78, fridge("side", 0.91, 0.73, 1.78, "#c4c7cb")),
  ap_fridge_french: tag("French-door fridge", "Appliances", 0.9, 0.72, 1.78, fridge("french", 0.9, 0.72, 1.78, "#c4c7cb")),
  ap_fridge_under: tag("Under-counter fridge", "Appliances", 0.6, 0.6, 0.82, fridge("under", 0.6, 0.6, 0.82, "#eceeef", 0.05)),
  ap_fridge_mini: tag("Mini bar fridge", "Appliances", 0.47, 0.5, 0.5, fridge("mini", 0.47, 0.5, 0.5, "#e6e8ea", 0.03)),
  ap_freezer_chest: tag("Chest freezer", "Appliances", 1.0, 0.62, 0.85, chestFreezer),
  ap_oven_built_in: tag("Built-in oven", "Appliances", 0.6, 0.57, 0.6, ovenBuiltIn),
  ap_oven_tower: tag("Oven in a tall unit", "Appliances", 0.6, 0.62, 2.1, ovenTower),
  ap_range_90: tag("Range cooker, gas, 90 cm", "Appliances", 0.9, 0.66, 0.96, range90),
  ap_stove_60: tag("Cooker with oven, 60 cm", "Appliances", 0.6, 0.64, 0.92, stove60),
  ap_hob_induction: tag("Induction hob", "Appliances", 0.6, 0.52, 0.045, hobInduction),
  ap_hood_chimney: tag("Cooker hood, chimney", "Appliances", 0.6, 0.5, 2.58, hoodChimney, { wall: true }),
  ap_ceiling_hood_island: tag("Cooker hood, island", "Appliances", 0.9, 0.6, 2.6, hoodIsland),
  ap_dishwasher: tag("Dishwasher", "Appliances", 0.6, 0.62, 0.85, dishwasher),
  ap_dishwasher_integrated: tag("Dishwasher, hidden behind a door", "Appliances", 0.6, 0.58, 0.82, dishwasherIntegrated),
  ap_microwave: tag("Microwave", "Appliances", 0.46, 0.36, 0.26, microwave),
  ap_microwave_built_in: tag("Built-in microwave", "Appliances", 0.6, 0.58, 0.38, microwaveBuiltIn),
  ap_coffee_espresso: tag("Espresso machine", "Appliances", 0.3, 0.4, 0.4, coffeeEspresso),
  ap_coffee_pod: tag("Capsule coffee machine", "Appliances", 0.13, 0.3, 0.34, coffeePod),
  ap_kettle: tag("Electric kettle", "Appliances", 0.24, 0.18, 0.27, kettle),
  ap_toaster: tag("Toaster", "Appliances", 0.32, 0.2, 0.21, toaster),
  ap_stand_mixer: tag("Stand mixer", "Appliances", 0.24, 0.34, 0.36, standMixer),
  ap_air_fryer: tag("Air fryer", "Appliances", 0.28, 0.37, 0.34, airFryer),
  ap_wine_fridge: tag("Wine fridge, under the counter", "Appliances", 0.6, 0.58, 0.82, wine(0.6, 0.58, 0.82, 3)),
  ap_wine_cabinet: tag("Wine cabinet, tall", "Appliances", 0.6, 0.62, 1.65, wine(0.6, 0.62, 1.65, 6)),
  ap_washer_front: tag("Washing machine", "Appliances", 0.6, 0.62, 0.85, drumMachine(0, false, true)),
  ap_dryer: tag("Tumble dryer", "Appliances", 0.6, 0.62, 0.85, drumMachine(0, true, true)),
  ap_washer_dryer_tower: tag("Washer and dryer stacked", "Appliances", 0.6, 0.62, 1.71, [...drumMachine(0, false, true), ...drumMachine(0.86, true, false)]),
  ap_ironing_board: tag("Ironing board with iron", "Appliances", 1.2, 0.4, 1.02, ironingBoard),
  ap_drying_rack: tag("Clothes drying rack", "Appliances", 1.4, 0.58, 0.95, dryingRack),
};

export const APPLIANCES: Record<string, Def> = { ...KITCHEN, ...APPLIANCES_CLIMATE, ...APPLIANCES_DEVICES };
