import type { Def, Part } from "./catalog";
import { b, cy, ring, rotor, feet, PI2, WHITE, SEAM, STEEL, DSTEEL, GRAPHITE, BLACK, GLASS, CHROME, LED } from "./catalog.appliances-parts.ts";
import { turned, taperedLeg, FAB, BLACK_METAL, WOOD as WOODM } from "./partsKit.ts";

const COPPER = "#c0773e";
const BRASS = "#c9a24a";
const RED = "#c63a2f";
const BLUE = "#3b6fc4";
const WOOD = "#b98a5a";
const ODOOR = "#d9dbdc"; // light grey outdoor casing

/** n values from a start with a pitch (grille rows, pipes, rails). */
const seq = (n: number, from: number, pitch: number) => Array.from({ length: n }, (_, k) => from + k * pitch);
/** Mark parts as repaintable body colour. */
const mm = (ps: Part[]): Part[] => ps.map((p) => ({ ...p, m: true as const }));
/** Round fan grille facing +z: rim ring, inner ring, two crossing spokes, hub disc. */
const guard = (x: number, y: number, z: number, dia: number, c: string): Part[] => [
  ...ring(x, y, z, dia, 28, 0.012, 0.02, c),
  ...ring(x, y, z, dia * 0.6, 20, 0.008, 0.012, c),
  b(x, y, z, dia, 0.01, 0.012, c),
  b(x, y, z, 0.01, dia, 0.012, c),
  cy(x, y, z, dia * 0.2, 0.014, DSTEEL, { r: [PI2, 0, 0] }),
];

export const APPLIANCES_CLIMATE: Record<string, Def> = {
  // Indoor split unit hung near the ceiling
  ap_ac_split_indoor: {
    label: "Wall air conditioner", brand: "Generic", cat: "Climate", w: 0.85, d: 0.22, h: 2.4, wall: true,
    parts: [
      b(0, 2.22, -0.005, 0.85, 0.29, 0.21, WHITE, { m: true, bevel: 0.03 }),
      b(0, 2.085, 0.075, 0.85, 0.03, 0.04, WHITE, { m: true, r: [-0.4, 0, 0] }), // rounded lower front edge
      b(0, 2.14, 0.101, 0.83, 0.004, 0.004, SEAM),
      b(0, 2.073, 0.04, 0.72, 0.006, 0.09, BLACK), // air outlet slot
      b(0, 2.07, 0.075, 0.7, 0.008, 0.06, WHITE, { m: true, r: [0.5, 0, 0], spin: { axis: "x", rpm: 10, swing: 22 } }),
      ...seq(14, -0.33, 0.05).map((x) => b(x, 2.366, -0.03, 0.02, 0.004, 0.1, GRAPHITE)), // top intake slots
      ...[-0.3, -0.24, -0.18, -0.12].map((x) => b(x, 2.24, 0.101, 0.014, 0.09, 0.004, GRAPHITE)),
      b(0.33, 2.19, 0.101, 0.012, 0.012, 0.004, LED, { glow: true }),
      b(0.3, 2.19, 0.101, 0.012, 0.012, 0.004, GRAPHITE),
    ],
  },

  ap_ac_outdoor: {
    label: "Outdoor air-conditioner unit", brand: "Generic", cat: "Climate", w: 0.8, d: 0.3, h: 0.55,
    parts: [
      ...[-0.3, 0.3].map((x) => b(x, 0.025, 0, 0.05, 0.05, 0.28, GRAPHITE)), // feet rails
      b(0, 0.29, -0.02, 0.76, 0.48, 0.26, ODOOR, { m: true }),
      b(0, 0.54, 0, 0.8, 0.02, 0.3, ODOOR, { m: true }),
      ...guard(-0.08, 0.29, 0.122, 0.42, GRAPHITE),
      ...rotor(-0.08, 0.29, 0.118, 0.36, 0.08, 2, 240, "z", BLACK),
      ...seq(10, 0.31, 0.02).map((y) => b(0.382, y, -0.02, 0.008, 0.012, 0.2, GRAPHITE)), // side louvres
      ...[-0.02, 0.04].map((z) => cy(0.39, 0.17, z, 0.02, 0.1, COPPER)),
      b(0.39, 0.095, 0.01, 0.02, 0.05, 0.1, BRASS), // service valve block
      cy(0.39, 0.125, 0.0, 0.026, 0.02, BRASS),
    ],
  },

  ap_heat_pump_outdoor: {
    label: "Heat pump (outdoor unit)", brand: "Generic", cat: "Climate", w: 1.0, d: 0.42, h: 1.0,
    parts: [
      ...[-0.35, 0.35].map((x) => b(x, 0.03, 0, 0.06, 0.06, 0.38, GRAPHITE)),
      b(0, 0.515, -0.01, 0.96, 0.9, 0.38, ODOOR, { m: true }),
      b(0, 0.985, 0, 1.0, 0.03, 0.42, ODOOR, { m: true }),
      ...guard(-0.12, 0.52, 0.185, 0.65, GRAPHITE),
      ...rotor(-0.12, 0.52, 0.18, 0.6, 0.14, 2, 200, "z", BLACK),
      ...seq(14, 0.14, 0.055).map((y) => b(-0.485, y, -0.01, 0.01, 0.014, 0.3, GRAPHITE)), // left louvres
      b(0.385, 0.62, 0.19, 0.14, 0.2, 0.02, WHITE), // control box
      b(0.385, 0.69, 0.202, 0.02, 0.02, 0.004, LED, { glow: true }),
      b(0.385, 0.63, 0.202, 0.1, 0.06, 0.004, GRAPHITE),
      ...[0.4, 0.44].map((x) => cy(x, 0.2, 0.195, 0.025, 0.12, COPPER)), // pipe stubs
      b(0.42, 0.13, 0.195, 0.1, 0.03, 0.03, BRASS),
    ],
  },

  ap_ac_portable: {
    label: "Portable air conditioner", brand: "Generic", cat: "Climate", w: 0.42, d: 0.38, h: 0.75,
    parts: [
      ...[-1, 1].flatMap((sx) => [-1, 1].map((sz) => cy(sx * 0.15, 0.02, 0.035 + sz * 0.11, 0.04, 0.04, BLACK))), // castors
      b(0, 0.295, 0.035, 0.42, 0.51, 0.29, WHITE, { m: true }),
      b(0, 0.645, 0.045, 0.38, 0.19, 0.25, WHITE, { m: true }),
      b(0, 0.55, 0.045, 0.4, 0.004, 0.27, SEAM),
      ...seq(5, -0.12, 0.06).map((x) => b(x, 0.742, 0.03, 0.03, 0.004, 0.16, GRAPHITE)), // top louvres
      b(0, 0.7, 0.172, 0.14, 0.04, 0.004, GLASS),
      b(0, 0.7, 0.175, 0.1, 0.02, 0.004, LED, { glow: true }),
      ...seq(8, 0.14, 0.04).map((y) => b(-0.02, y, 0.183, 0.3, 0.008, 0.004, GRAPHITE)), // front grille lines
      cy(0.14, 0.4, -0.15, 0.07, 0.6, DSTEEL), // exhaust hose
      ...seq(8, 0.14, 0.07).map((y) => cy(0.14, y, -0.15, 0.082, 0.012, STEEL)),
    ],
  },

  ap_ceiling_fan: {
    label: "Ceiling fan", brand: "Generic", cat: "Climate", w: 1.05, d: 1.05, h: 2.6,
    parts: [
      cy(0, 2.55, 0, 0.14, 0.06, WHITE),
      cy(0, 2.425, 0, 0.03, 0.19, GRAPHITE),
      turned(0, 2.23, 0, [[0.07, 0], [0.1, 0.02], [0.1, 0.07], [0.06, 0.1]], GRAPHITE, BLACK_METAL), // motor housing
      ...mm(rotor(0, 2.22, 0, 1.0, 0.14, 2, 150, "y", WOOD, 0.012)).map((p) => ({ ...p, ...WOODM, bevel: 0.004 })),
      turned(0, 2.16, 0, [[0.07, 0], [0.08, 0.015], [0.08, 0.035], [0.04, 0.05]], WHITE), // light dome
      cy(0, 2.155, 0, 0.22, 0.01, LED, { glow: true }),
    ],
  },

  ap_fan_floor: {
    label: "Pedestal fan", brand: "Generic", cat: "Climate", w: 0.45, d: 0.45, h: 1.25,
    parts: [
      turned(0, 0, 0, [[0.19, 0], [0.19, 0.02], [0.14, 0.04]], GRAPHITE),
      cy(0, 0.35, 0, 0.04, 0.62, STEEL),
      cy(0, 0.7, 0, 0.03, 0.3, CHROME),
      cy(0, 0.55, 0, 0.055, 0.04, GRAPHITE), // height collar
      b(0, 0.84, -0.06, 0.03, 0.03, 0.14, GRAPHITE),
      b(0, 0.9, -0.12, 0.03, 0.12, 0.03, GRAPHITE),
      cy(0, 1.03, -0.12, 0.14, 0.14, WHITE, { m: true, r: [PI2, 0, 0] }), // motor head
      b(0, 1.1, -0.12, 0.02, 0.008, 0.02, LED, { glow: true }),
      cy(0, 1.03, -0.205, 0.04, 0.03, BLACK, { r: [PI2, 0, 0] }), // back knob
      ...guard(0, 1.03, 0.1, 0.4, CHROME),
      ...ring(0, 1.03, -0.05, 0.4, 28, 0.012, 0.012, CHROME),
      ...[[0.19, 0], [-0.19, 0], [0, 0.19], [0, -0.19]].map(([x, y]) => b(x, 1.03 + y, 0.025, 0.01, 0.01, 0.15, CHROME)),
      ...rotor(0, 1.03, 0.04, 0.34, 0.1, 2, 250, "z", DSTEEL),
    ],
  },

  ap_fan_tower: {
    label: "Tower fan", brand: "Generic", cat: "Climate", w: 0.28, d: 0.28, h: 1.0,
    parts: [
      cy(0, 0.015, 0, 0.28, 0.03, GRAPHITE),
      b(0, 0.495, 0, 0.2, 0.93, 0.2, WHITE, { m: true, bevel: 0.04 }),
      b(0, 0.5, 0.101, 0.1, 0.7, 0.004, BLACK), // air slot
      ...seq(15, 0.19, 0.045).map((y) => b(0, y, 0.104, 0.1, 0.004, 0.004, DSTEEL)), // louvre lines
      b(0, 0.98, 0, 0.21, 0.036, 0.21, GRAPHITE),
      b(0, 1.0, 0.03, 0.08, 0.008, 0.03, LED, { glow: true }),
      ...[-0.05, 0, 0.05].map((x) => b(x, 1.0, -0.05, 0.03, 0.008, 0.02, BLACK)),
    ],
  },

  // Stands on wall brackets, back against the wall
  ap_radiator_panel: {
    label: "Panel radiator", brand: "Generic", cat: "Climate", w: 1.0, d: 0.1, h: 0.6,
    parts: [
      b(0, 0.34, -0.03, 0.93, 0.46, 0.03, WHITE, { m: true, bevel: 0.012 }),
      b(0, 0.34, 0.005, 0.93, 0.46, 0.04, WHITE, { m: true, bevel: 0.015 }),
      b(0, 0.575, -0.01, 0.93, 0.01, 0.07, WHITE, { m: true, bevel: 0.004 }),
      ...seq(24, -0.44, 0.0383).map((x) => b(x, 0.581, -0.01, 0.016, 0.004, 0.05, GRAPHITE)), // top grille slots
      ...[-1, 1].map((s) => b(s * 0.475, 0.34, -0.01, 0.02, 0.46, 0.07, WHITE, { m: true })), // end caps
      ...[-0.3, 0, 0.3].flatMap((x) => [-0.04, 0, 0.04].map((dx) => b(x + dx, 0.34, 0.0255, 0.012, 0.42, 0.004, SEAM))), // pressed ridges
      ...[-0.3, 0.3].map((x) => b(x, 0.34, -0.047, 0.04, 0.48, 0.006, DSTEEL)), // brackets
      cy(-0.43, 0.075, -0.02, 0.016, 0.07, COPPER),
      cy(0.43, 0.075, -0.02, 0.016, 0.07, COPPER),
      cy(-0.43, 0.115, 0.0, 0.04, 0.025, BRASS), // valve body
      cy(-0.43, 0.085, 0.02, 0.045, 0.05, WHITE, { r: [PI2, 0, 0] }), // thermostatic head
    ],
  },

  ap_radiator_towel: {
    label: "Towel radiator", brand: "Generic", cat: "Climate", w: 0.5, d: 0.1, h: 1.2,
    parts: [
      ...[-0.22, 0.22].map((x) => b(x, 0.62, 0, 0.04, 1.12, 0.04, WHITE, { m: true })),
      ...seq(8, 0.2, 0.125).map((y) => cy(0, y, 0, 0.025, 0.4, WHITE, { m: true, r: [0, 0, PI2] })),
      ...[-0.22, 0.22].map((x) => cy(x, 0.03, 0, 0.025, 0.06, COPPER)),
      cy(-0.22, 0.07, 0.03, 0.04, 0.05, BRASS, { r: [PI2, 0, 0] }), // valve
      // grey towel over the 6th rail, cream towel over the 3rd
      b(0, 0.82 + 0.0125 + 0.006, 0, 0.34, 0.012, 0.06, "#8a8d92", FAB),
      b(0, 0.72, 0.03, 0.34, 0.2, 0.012, "#8a8d92", { ...FAB, bevel: 0.004 }),
      b(0, 0.74, -0.03, 0.34, 0.16, 0.012, "#8a8d92", { ...FAB, bevel: 0.004 }),
      b(0, 0.445 + 0.0125 + 0.006, 0, 0.34, 0.012, 0.06, "#eadfc8", FAB),
      b(0, 0.36, 0.03, 0.34, 0.18, 0.012, "#eadfc8", { ...FAB, bevel: 0.004 }),
      b(0, 0.37, -0.03, 0.34, 0.16, 0.012, "#eadfc8", { ...FAB, bevel: 0.004 }),
    ],
  },

  ap_underfloor_manifold: {
    label: "Underfloor heating manifold", brand: "Generic", cat: "Climate", w: 0.55, d: 0.13, h: 1.1, wall: true,
    parts: [
      b(0, 1.04, 0, 0.55, 0.02, 0.13, WHITE, { m: true }),
      b(0, 0.46, 0, 0.55, 0.02, 0.13, WHITE, { m: true }),
      ...[-1, 1].map((s) => b(s * 0.265, 0.75, 0, 0.02, 0.6, 0.13, WHITE, { m: true })),
      b(0, 0.75, -0.06, 0.51, 0.56, 0.01, GRAPHITE),
      b(0, 1.075, 0, 0.5, 0.03, 0.1, WHITE, { m: true }), // hood
      cy(-0.05, 0.88, 0, 0.03, 0.36, BRASS, { r: [0, 0, PI2] }), // supply bar
      cy(-0.05, 0.66, 0, 0.03, 0.36, BRASS, { r: [0, 0, PI2] }), // return bar
      ...seq(6, -0.2, 0.06).flatMap((x, k) => [
        cy(x, 0.915, 0.0, 0.03, 0.035, k % 2 ? BLUE : RED), // valve head
        cy(x, 0.66, 0.045, 0.03, 0.015, k % 3 === 2 ? "#cfe8f5" : k % 2 ? BLUE : RED, { r: [PI2, 0, 0] }), // flow gauge
        cy(x, 0.55, 0.0, 0.02, 0.2, k % 2 ? BLUE : RED), // circuit pipe loop
        b(x, 0.44, 0, 0.02, 0.02, 0.02, k % 2 ? BLUE : RED),
      ]),
      cy(0.2, 0.77, 0.0, 0.07, 0.1, DSTEEL), // pump
      b(0.2, 0.77, 0.038, 0.014, 0.014, 0.004, LED, { glow: true }),
    ],
  },

  ap_convector_heater: {
    label: "Electric panel heater", brand: "Generic", cat: "Climate", w: 0.75, d: 0.1, h: 0.45,
    parts: [
      ...[-0.3, 0.3].map((x) => b(x, 0.03, 0, 0.04, 0.06, 0.06, GRAPHITE)),
      b(0, 0.25, 0, 0.75, 0.38, 0.08, WHITE, { m: true, bevel: 0.015 }),
      ...seq(14, -0.34, 0.052).map((x) => b(x, 0.442, 0.0, 0.025, 0.004, 0.05, GRAPHITE)), // top slots
      ...seq(11, -0.35, 0.052).map((x) => b(x, 0.2, 0.041, 0.006, 0.28, 0.004, SEAM)), // front ridges
      b(0.3, 0.38, 0.041, 0.08, 0.03, 0.004, GLASS),
      b(0.3, 0.38, 0.044, 0.06, 0.016, 0.004, LED, { glow: true }),
      ...[0.27, 0.33].map((x) => cy(x, 0.3, 0.04, 0.035, 0.02, GRAPHITE, { r: [PI2, 0, 0] })),
    ],
  },

  ap_fireplace_electric: {
    label: "Electric fireplace", brand: "Generic", cat: "Climate", w: 1.2, d: 0.3, h: 1.1,
    light: { y: 0.45, color: "#ff8a3c" },
    parts: [
      b(0, 0.04, -0.02, 1.2, 0.08, 0.26, WHITE, { m: true }), // plinth
      ...[-0.5, 0.5].map((x) => b(x, 0.57, -0.02, 0.2, 0.98, 0.26, WHITE, { m: true })), // side columns
      b(0, 0.965, -0.02, 0.8, 0.18, 0.26, WHITE, { m: true }), // header
      b(0, 1.08, 0, 1.2, 0.04, 0.3, WHITE, { m: true }), // mantel shelf
      b(0, 0.15, -0.02, 0.8, 0.14, 0.26, WHITE, { m: true }),
      ...seq(12, -0.3, 0.055).map((x) => b(x, 0.15, 0.113, 0.03, 0.08, 0.004, BLACK)), // control grille
      b(0, 0.55, -0.12, 0.8, 0.65, 0.04, BLACK), // firebox back
      // glass front frame
      b(0, 0.875, 0.115, 0.8, 0.012, 0.01, GRAPHITE),
      b(0, 0.225, 0.115, 0.8, 0.012, 0.01, GRAPHITE),
      ...[-0.396, 0.396].map((x) => b(x, 0.55, 0.115, 0.012, 0.65, 0.01, GRAPHITE)),
      b(0, 0.24, 0.0, 0.6, 0.02, 0.12, "#ff7a2a", { glow: true }), // ember strip
      ...[[-0.15, 0.025], [0, -0.01], [0.15, 0.015]].map(([x, z], k) => cy(x, 0.27 + k * 0.005, z, 0.06, 0.5 - k * 0.12, "#5a3a22", { r: [0, 0, PI2] })), // logs
      ...[[-0.2, 0.3, 0.12], [-0.1, 0.4, -0.1], [0, 0.35, 0.08], [0.1, 0.42, -0.12], [0.2, 0.28, 0.1]].map(([x, h, tilt]) =>
        b(x, 0.3 + h / 2, 0.0, 0.07, h, 0.03, "#ffb060", { glow: true, r: [0, 0, tilt] })),
    ],
  },

  ap_woodstove: {
    label: "Wood burner stove", brand: "Generic", cat: "Climate", w: 0.5, d: 0.45, h: 2.5,
    light: { y: 0.5, color: "#ff8a3c" },
    parts: [
      ...[-1, 1].flatMap((sx) => [-1, 1].map((sz) => taperedLeg(sx * 0.2, sz * 0.17, 0.15, 0.05, 0.03, BLACK, BLACK_METAL))), // legs
      b(0, 0.47, -0.02, 0.5, 0.64, 0.4, BLACK, { ...BLACK_METAL, bevel: 0.02 }),
      b(0, 0.81, 0, 0.5, 0.03, 0.45, GRAPHITE), // top plate
      b(0, 0.16, 0.2, 0.4, 0.03, 0.05, GRAPHITE), // ash lip
      b(0, 0.5, 0.185, 0.36, 0.4, 0.015, GRAPHITE), // door
      b(0, 0.5, 0.195, 0.26, 0.28, 0.006, "#ff7a2a", { glow: true }), // fire behind glass
      b(0, 0.64, 0.2, 0.28, 0.02, 0.012, GLASS), // window frame
      b(0, 0.36, 0.2, 0.28, 0.02, 0.012, GLASS),
      ...[-0.14, 0.14].map((x) => b(x, 0.5, 0.2, 0.02, 0.28, 0.012, GLASS)),
      b(0.15, 0.5, 0.208, 0.015, 0.14, 0.014, CHROME), // handle
      cy(0.15, 0.56, 0.2, 0.012, 0.014, CHROME, { r: [PI2, 0, 0] }),
      cy(0, 0.85, -0.04, 0.19, 0.04, BLACK), // flue collar
      cy(0, 1.675, -0.04, 0.15, 1.65, BLACK), // flue pipe
      cy(0, 1.2, -0.04, 0.17, 0.02, GRAPHITE),
      cy(0, 2.2, -0.04, 0.17, 0.02, GRAPHITE),
    ],
  },

  ap_boiler_tank: {
    label: "Hot water tank", brand: "Generic", cat: "Climate", w: 0.55, d: 0.55, h: 1.5,
    parts: [
      cy(0, 0.04, 0, 0.46, 0.08, GRAPHITE),
      turned(0, 0.08, 0, [[0.23, 0], [0.25, 0.02], [0.25, 1.26], [0.24, 1.28]], WHITE, { tex: "paint", rough: 0.35, m: true }),
      b(0, 1.36, 0, 0.5, 0.16, 0.5, WHITE, { m: true, shape: "sph", tex: "paint", rough: 0.35 }), // domed top
      cy(-0.08, 1.46, -0.04, 0.03, 0.08, RED),
      cy(0.08, 1.46, -0.04, 0.03, 0.08, BLUE),
      ...[0.4, 0.7, 1.15].map((y) => cy(0, y, 0, 0.505, 0.004, SEAM)),
      b(0, 0.95, 0.252, 0.2, 0.14, 0.03, GRAPHITE), // control box
      b(-0.04, 0.97, 0.27, 0.09, 0.04, 0.004, LED, { glow: true }),
      cy(0.06, 0.92, 0.268, 0.04, 0.015, BLACK, { r: [PI2, 0, 0] }), // dial
      cy(-0.245, 1.1, 0, 0.03, 0.06, BRASS, { r: [0, 0, PI2] }), // pressure relief valve
    ],
  },

  ap_boiler_combi: {
    label: "Combi boiler", brand: "Generic", cat: "Climate", w: 0.4, d: 0.3, h: 2.05, wall: true,
    parts: [
      b(0, 1.66, -0.01, 0.4, 0.62, 0.28, WHITE, { m: true, bevel: 0.02 }),
      b(0, 1.365, -0.01, 0.4, 0.03, 0.28, DSTEEL),
      b(0, 1.5, 0.132, 0.34, 0.12, 0.004, GRAPHITE), // control strip
      b(-0.08, 1.52, 0.136, 0.1, 0.04, 0.004, LED, { glow: true }),
      ...[0.04, 0.12].map((x) => cy(x, 1.52, 0.14, 0.04, 0.014, BLACK, { r: [PI2, 0, 0] })), // dials
      ...[-0.12, -0.06, 0].map((x) => b(x, 1.47, 0.137, 0.035, 0.02, 0.01, STEEL)), // buttons
      cy(0.06, 2.01, -0.01, 0.1, 0.08, DSTEEL), // flue stub
      ...[["#9a9ea4", -0.14], [COPPER, -0.07], [RED, 0], [BLUE, 0.07], [COPPER, 0.14]].map(([c, x]) =>
        cy(x as number, 1.275, 0.03, 0.022, 0.15, c as string)),
      ...seq(5, -0.14, 0.07).map((x) => cy(x, 1.345, 0.03, 0.034, 0.02, BRASS)),
    ],
  },

  ap_dehumidifier: {
    label: "Dehumidifier", brand: "Generic", cat: "Climate", w: 0.4, d: 0.28, h: 0.6,
    parts: [
      ...[-1, 1].flatMap((sx) => [-1, 1].map((sz) => cy(sx * 0.15, 0.025, sz * 0.09, 0.04, 0.05, BLACK))), // castors
      b(0, 0.33, 0, 0.4, 0.54, 0.28, WHITE, { m: true }),
      cy(-0.05, 0.4, 0.1405, 0.26, 0.004, BLACK, { r: [PI2, 0, 0] }),
      ...rotor(-0.05, 0.4, 0.139, 0.24, 0.05, 2, 280, "z", GRAPHITE),
      ...seq(9, 0.28, 0.027).map((y) => b(-0.05, y, 0.143, 0.24, 0.008, 0.006, DSTEEL)), // front louvres
      b(0.14, 0.24, 0.142, 0.08, 0.26, 0.004, "#a9d8f2"), // water tank window
      b(0, 0.598, -0.06, 0.16, 0.004, 0.05, GRAPHITE), // handle recess
      b(0, 0.598, 0.08, 0.22, 0.004, 0.07, GLASS),
      b(0, 0.6, 0.08, 0.14, 0.004, 0.03, LED, { glow: true }),
    ],
  },

  ap_humidifier: {
    label: "Humidifier", brand: "Generic", cat: "Climate", w: 0.26, d: 0.26, h: 0.32,
    parts: [
      turned(0, 0, 0, [[0.115, 0], [0.13, 0.015], [0.13, 0.125], [0.12, 0.14]], WHITE, { tex: "plastic", rough: 0.4, m: true }),
      cy(0, 0.21, 0, 0.24, 0.14, "#bfe3f5", { tex: "plastic", rough: 0.1 }), // water tank
      cy(0, 0.287, 0, 0.22, 0.014, WHITE, { m: true }),
      turned(0, 0.287, 0, [[0.03, 0], [0.02, 0.014], [0.028, 0.032]], WHITE, { m: true }), // mist nozzle
      b(0, 0.07, 0.132, 0.08, 0.012, 0.004, LED, { glow: true }),
      cy(0.07, 0.1, 0.123, 0.02, 0.01, GRAPHITE, { r: [PI2, 0, 0] }), // button
    ],
  },

  ap_air_purifier: {
    label: "Air purifier", brand: "Generic", cat: "Climate", w: 0.26, d: 0.26, h: 0.55,
    parts: [
      ...[-1, 1].flatMap((sx) => [-1, 1].map((sz) => cy(sx * 0.09, 0.015, sz * 0.09, 0.04, 0.03, BLACK))),
      turned(0, 0.03, 0, [[0.12, 0], [0.13, 0.01], [0.13, 0.47], [0.12, 0.49]], WHITE, { tex: "plastic", rough: 0.4, m: true }),
      ...[0.15, 0.24, 0.33].map((y) => cy(0, y, 0, 0.262, 0.04, "#c9c8c4")), // perforated bands
      ...[0.15, 0.24, 0.33].map((y) => cy(0, y, 0, 0.264, 0.012, GRAPHITE)),
      cy(0, 0.535, 0, 0.22, 0.01, BLACK),
      ...rotor(0, 0.544, 0, 0.2, 0.05, 2, 240, "y", DSTEEL),
      b(0, 0.47, 0.125, 0.08, 0.012, 0.008, LED, { glow: true }),
    ],
  },

  ap_air_purifier_box: {
    label: "Air purifier (box)", brand: "Generic", cat: "Climate", w: 0.33, d: 0.22, h: 0.6,
    parts: [
      ...feet(0.33, 0.22, 0.04),
      b(0, 0.32, 0, 0.33, 0.56, 0.22, WHITE, { m: true }),
      b(0, 0.32, 0.112, 0.29, 0.46, 0.004, GRAPHITE), // fabric mesh
      ...seq(14, 0.11, 0.032).map((y) => b(0, y, 0.114, 0.29, 0.003, 0.002, DSTEEL)),
      b(0, 0.598, 0.06, 0.25, 0.004, 0.06, GLASS),
      b(0, 0.6, 0.06, 0.12, 0.004, 0.02, LED, { glow: true }),
      b(0, 0.598, -0.07, 0.18, 0.004, 0.03, BLACK), // handle slot
    ],
  },
};
