import type { Def, Part } from "./catalog.ts";
import { b, cy, turned, taperedLeg, MATT, LACQUER, CERAMIC, CHROME, STEEL, FAB, PLASTIC, WOOD, RUBBER } from "./partsKit.ts";

const WHITE = "#f4f6f7";
const CHR = "#b8bcc2";
const SEAM = "#e6e4df";
const BLACK = "#1f2226";
const TILE = "#eeedea";
const CURTAIN = "#9b9d9f";
const HALF_PI = Math.PI / 2;
// The user's real bathroom (photos IMG_4619..4622): black fluted vanity, bath with grey curtain, white WC, oak/grey tall cabinet, Arctic washer.
// grey shower curtain gathered at the -x end: n folds, 0.02 thick, alternating z so it reads as pleats
const curtain = (x0: number, width: number, n: number, zc: number, y0: number, y1: number): Part[] =>
  Array.from({ length: n }, (_, i) => {
    const t = width / n;
    return b(x0 + t * (i + 0.5), (y0 + y1) / 2, zc + (i % 2 ? 0.025 : -0.025), t * 0.9, y1 - y0, 0.02, CURTAIN, { ...FAB, bevel: 0 });
  });

/** Tap: vertical body at (x,z) plus a spout that leaves toward +z as three rotated segments and drops at the tip. `len` = spout reach. */
const tap = (x: number, y: number, z: number, c: string, o: { len?: number; dia?: number; body?: Part["tex"] } = {}): Part[] => {
  const { len = 0.1, dia = 0.022 } = o;
  const m = c === CHR ? CHROME : { ...PLASTIC, tex: "metal" as const, metal: 0.85, rough: 0.3 };
  return [
    cy(x, y + 0.04, z, dia * 1.3, 0.04, c, { ...m, detail: 1 }), // base collar
    cy(x, y + 0.075, z + len * 0.12, dia, 0.1, c, { ...m, r: [0.35, 0, 0], detail: 1 }), // riser, leaning toward the spout
    cy(x, y + 0.12, z + len * 0.5, dia * 0.9, len * 0.75, c, { ...m, r: [HALF_PI, 0, 0], detail: 1 }), // arc
    cy(x, y + 0.1, z + len * 0.95, dia * 0.9, 0.06, c, { ...m, detail: 1 }), // dropping tip
    cy(x, y + 0.075, z - len * 0.1, dia * 0.7, 0.012, c, { ...m, r: [0, 0, HALF_PI], detail: 2 }), // lever
  ];
};

const WATER_COLUMN: Def = {
  label: "Water column (plumbing riser)", brand: "Generic", cat: "Bathroom", w: 0.45, d: 0.35, h: 2.58, solid: true, pillar: true,
  parts: [
    b(0, 1.29, 0, 0.45, 2.58, 0.35, TILE, { ...MATT, bevel: 0.006 }),
    b(0, 1.0, 0.176, 0.3, 0.5, 0.004, "#dfe3e5", { ...MATT, bevel: 0.002 }), // inspection hatch
    b(0, 0.75, 0.176, 0.04, 0.012, 0.004, CHR, { ...CHROME }),
    b(0, 1.0, 0.176, 0.3, 0.004, 0.005, SEAM, { ...MATT, bevel: 0 }),
    b(0, 1.25, 0.18, 0.304, 0.004, 0.004, SEAM, { bevel: 0, detail: 1 }), // hatch frame
    b(0, 0.75, 0.18, 0.304, 0.004, 0.004, SEAM, { bevel: 0, detail: 1 }),
    b(-0.15, 1.0, 0.18, 0.004, 0.5, 0.004, SEAM, { bevel: 0, detail: 1 }),
    b(0.15, 1.0, 0.18, 0.004, 0.5, 0.004, SEAM, { bevel: 0, detail: 1 }),
    b(0, 0.04, 0.178, 0.45, 0.08, 0.006, "#d6d8d8", { ...MATT, bevel: 0.002, detail: 1 }), // skirting
    cy(-0.12, 1.2, 0.18, 0.014, 0.006, CHR, { ...CHROME, r: [HALF_PI, 0, 0], detail: 2 }), // hatch screws
  ],
};

const MIRROR: Def = {
  label: "Mirror cabinet, two doors", brand: "Generic", cat: "Bathroom", w: 0.7, d: 0.14, h: 2, wall: true,
  parts: [
    b(0, 1.65, 0, 0.7, 0.7, 0.14, "#7b7e82", { ...MATT, bevel: 0.008, m: true }),
    b(-0.17, 1.65, 0.071, 0.33, 0.66, 0.004, "#c8d3da", { tex: "metal", metal: 0.9, rough: 0.05, bevel: 0 }),
    b(0.17, 1.65, 0.071, 0.33, 0.66, 0.004, "#c8d3da", { tex: "metal", metal: 0.9, rough: 0.05, bevel: 0 }),
    b(0, 1.65, 0.07, 0.012, 0.68, 0.006, WHITE, { ...MATT, bevel: 0 }), // door gap
    b(-0.335, 1.65, 0.07, 0.012, 0.68, 0.006, WHITE, { ...MATT, bevel: 0 }),
    b(0.335, 1.65, 0.07, 0.012, 0.68, 0.006, WHITE, { ...MATT, bevel: 0 }),
    b(0, 1.31, 0.07, 0.68, 0.012, 0.006, WHITE, { ...MATT, bevel: 0 }),
    b(0, 1.99, 0.07, 0.68, 0.012, 0.006, WHITE, { ...MATT, bevel: 0 }),
    b(-0.17, 1.65, 0.0735, 0.335, 0.67, 0.002, "#5d6064", { bevel: 0, detail: 1 }), // dark door edge around the glass
    b(0.17, 1.65, 0.0735, 0.335, 0.67, 0.002, "#5d6064", { bevel: 0, detail: 1 }),
    b(-0.02, 1.55, 0.077, 0.008, 0.12, 0.008, CHR, { ...STEEL, bevel: 0.003, detail: 2 }), // door pulls
    b(0.02, 1.55, 0.077, 0.008, 0.12, 0.008, CHR, { ...STEEL, bevel: 0.003, detail: 2 }),
  ],
};

export const HOME_BATH: Record<string, Def> = {
  bt_vanity_sink: {
    label: "Vanity unit, black fluted, ceramic basin", brand: "Generic", cat: "Bathroom", w: 0.62, d: 0.46, h: 1, // wall-hung, 25 cm off the floor
    parts: [
      b(0, 0.5, -0.01, 0.6, 0.5, 0.44, BLACK, { ...LACQUER, bevel: 0.008, m: true }),
      ...[-0.25, -0.15, -0.05, 0.05, 0.15, 0.25].map((x) => b(x, 0.5, 0.215, 0.05, 0.48, 0.01, "#2a2e33", { ...LACQUER, bevel: 0.004, m: true })), // fluted ribs
      ...[-0.2, -0.1, 0, 0.1, 0.2].map((x) => b(x, 0.5, 0.222, 0.008, 0.48, 0.004, "#0c0d0f", { bevel: 0, detail: 1 })), // flutes between the ribs
      b(0, 0.5, 0.222, 0.58, 0.006, 0.004, "#0c0d0f", { bevel: 0 }), // drawer gap
      b(0, 0.69, 0.226, 0.4, 0.016, 0.014, "#8b9096", { ...STEEL, bevel: 0.004 }), // upper drawer bar handle
      b(0, 0.44, 0.226, 0.4, 0.016, 0.014, "#8b9096", { ...STEEL, bevel: 0.004 }), // lower drawer bar handle
      b(0, 0.8, 0, 0.62, 0.1, 0.46, WHITE, { ...CERAMIC, bevel: 0.012 }), // ceramic top
      b(0, 0.856, 0.02, 0.42, 0.012, 0.28, "#e1eaee", { ...CERAMIC, bevel: 0.005 }), // basin
      b(0, 0.852, 0.02, 0.36, 0.006, 0.22, "#cfdbe0", { ...CERAMIC, bevel: 0.004, detail: 1 }), // basin well
      cy(0, 0.862, 0.04, 0.05, 0.004, CHR, { ...CHROME }), // drain
      cy(0, 0.92, -0.17, 0.04, 0.14, BLACK, { tex: "metal", metal: 0.85, rough: 0.3 }), // black tap body
      b(0, 0.975, -0.11, 0.025, 0.025, 0.14, BLACK, { tex: "metal", metal: 0.85, rough: 0.3, r: [0.04, 0, 0], bevel: 0.01 }), // spout
      cy(0, 0.965, -0.045, 0.026, 0.035, BLACK, { tex: "metal", metal: 0.85, rough: 0.3, detail: 1 }), // spout outlet curving down
      cy(0.035, 0.96, -0.17, 0.014, 0.05, BLACK, { tex: "metal", metal: 0.85, rough: 0.3, r: [0, 0, HALF_PI], detail: 1 }), // lever
      cy(0.18, 0.862, 0.14, 0.03, 0.004, CHR, { ...CHROME, detail: 2 }), // overflow ring
      b(0, 0.74, 0.14, 0.4, 0.008, 0.1, "#0c0d0f", { bevel: 0, detail: 1 }), // shadow gap under the top
    ],
  },
  bt_mirror: MIRROR,
  bt_wc: {
    label: "WC, floor-standing with cistern", brand: "Generic", cat: "Bathroom", w: 0.37, d: 0.7, h: 0.86,
    parts: [
      turned(0, 0, 0, [[0.11, 0], [0.12, 0.08], [0.14, 0.2], [0.15, 0.3]], WHITE, { ...CERAMIC }), // pedestal
      b(0, 0.32, 0.0, 0.36, 0.17, 0.34, WHITE, { ...CERAMIC, bevel: 0.05, m: true }), // bowl body
      cy(0, 0.32, 0.17, 0.36, 0.17, WHITE, { ...CERAMIC, m: true }), // rounded front
      b(0, 0.425, -0.0, 0.36, 0.03, 0.34, "#e6e8ea", { ...PLASTIC, rough: 0.25, bevel: 0.012 }), // seat
      cy(0, 0.425, 0.17, 0.36, 0.03, "#e6e8ea", { ...PLASTIC, rough: 0.25 }),
      cy(0, 0.442, 0.1, 0.22, 0.004, "#cfd9de", { ...CERAMIC }), // bowl opening
      b(0, 0.62, -0.26, 0.36, 0.4, 0.16, WHITE, { ...CERAMIC, bevel: 0.03, m: true }), // cistern
      b(0, 0.82, -0.26, 0.38, 0.03, 0.18, WHITE, { ...CERAMIC, bevel: 0.012 }),
      cy(-0.1, 0.84, -0.26, 0.04, 0.02, CHR, { ...CHROME }), // flush button
      cy(0.1, 0.84, -0.26, 0.03, 0.02, CHR, { ...CHROME, detail: 1 }), // second (half-flush) button
      b(0, 0.62, -0.165, 0.33, 0.4, 0.02, "#e6e8ea", { ...CERAMIC, bevel: 0.006 }), // lid standing open against the cistern
      cy(0.1, 0.14, -0.3, 0.05, 0.1, "#d9dcdf", { ...PLASTIC }), // waste pipe
      b(0, 0.4, 0.0, 0.3, 0.01, 0.4, "#d4dde1", { ...CERAMIC, bevel: 0.004, detail: 1 }), // inner rim shadow
      cy(-0.12, 0.438, -0.12, 0.02, 0.012, CHR, { ...CHROME, detail: 2 }), // seat hinges
      cy(0.12, 0.438, -0.12, 0.02, 0.012, CHR, { ...CHROME, detail: 2 }),
      b(0, 0.02, 0.0, 0.3, 0.012, 0.3, "#e8eaeb", { ...CERAMIC, bevel: 0.004, detail: 1 }), // floor flange
    ],
  },
  bt_shower_tray_curtain: {
    label: "Shower tray with grey curtain", brand: "Generic", cat: "Bathroom", w: 0.85, d: 0.85, h: 2,
    parts: [
      b(0, 0.04, 0, 0.85, 0.08, 0.85, WHITE, { ...CERAMIC, bevel: 0.015, m: true }),
      b(0, 0.085, 0, 0.7, 0.01, 0.7, "#dfe8ee", { ...CERAMIC, bevel: 0.006 }),
      cy(0, 0.092, 0, 0.07, 0.004, CHR, { ...CHROME }), // drain
      cy(0, 0.1, 0, 0.04, 0.004, "#7b7f84", { ...CHROME, detail: 2 }), // drain grate
      b(0, 1.2, -0.4, 0.04, 1.6, 0.04, BLACK, { tex: "metal", metal: 0.85, rough: 0.35, bevel: 0.006 }), // shower column
      cy(0, 1.9, -0.2, 0.18, 0.02, BLACK, { tex: "metal", metal: 0.85, rough: 0.35 }), // rain head
      b(0, 1.88, -0.32, 0.03, 0.03, 0.16, BLACK, { tex: "metal", metal: 0.85, rough: 0.35, bevel: 0.008 }), // arm
      b(0, 1.985, 0.4, 0.85, 0.025, 0.025, "#f1f1ef", { ...CHROME, bevel: 0.01 }), // curtain rod
      ...curtain(-0.4, 0.32, 5, 0.38, 0.1, 1.96),
      cy(0, 1.15, -0.37, 0.05, 0.1, BLACK, { tex: "metal", metal: 0.85, rough: 0.35, detail: 1 }), // thermostat valve
      cy(0, 1.15, -0.335, 0.035, 0.02, CHR, { ...CHROME, r: [HALF_PI, 0, 0], detail: 2 }), // valve knob
      cy(-0.4, 1.985, 0.4, 0.045, 0.02, "#e4e4e0", { ...CHROME, r: [0, 0, HALF_PI], detail: 1 }), // rod flange
      ...[0.06, 0.16, 0.26].map((x) => cy(-0.4 + x, 1.94, 0.38, 0.03, 0.006, CHR, { ...CHROME, detail: 2 })), // hooks
    ],
  },
  bt_bathtub: {
    label: "Bathtub with grey curtain", brand: "Generic", cat: "Bathroom", w: 1.7, d: 0.75, h: 2,
    parts: [
      b(0, 0.27, 0, 1.7, 0.54, 0.75, WHITE, { ...CERAMIC, bevel: 0.06, m: true }),
      b(0, 0.55, 0, 1.7, 0.04, 0.75, WHITE, { ...CERAMIC, bevel: 0.02 }), // rounded rim
      b(0, 0.575, 0, 1.5, 0.01, 0.55, "#dde8ee", { ...CERAMIC, bevel: 0.05 }), // inner bowl
      b(0, 0.563, 0, 1.56, 0.012, 0.62, "#cfdce3", { ...CERAMIC, bevel: 0.06, detail: 1 }), // bowl depth shading
      cy(-0.6, 0.582, 0, 0.05, 0.004, CHR, { ...CHROME }), // drain
      b(0, 0.4, 0.37, 1.6, 0.04, 0.01, "#e4e7e9", { ...CERAMIC, bevel: 0.003, detail: 1 }), // apron moulding
      b(0, 0.12, 0.37, 1.6, 0.04, 0.01, "#e4e7e9", { ...CERAMIC, bevel: 0.003, detail: 1 }),
      b(0, 1.985, 0.35, 1.7, 0.025, 0.025, "#f1f1ef", { ...CHROME, bevel: 0.01 }), // curtain rod
      ...curtain(-0.84, 0.5, 5, 0.34, 0.58, 1.96),
      cy(-0.5, 1.9, -0.33, 0.1, 0.02, BLACK, { tex: "metal", metal: 0.85, rough: 0.35 }), // shower head
      ...tap(0.7, 0.57, -0.3, CHR, { len: 0.1 }), // bath filler on the wall-side rim
      cy(-0.7, 0.58, 0.0, 0.03, 0.01, CHR, { ...CHROME, detail: 2 }), // overflow
      cy(0.7, 0.57, -0.3, 0.012, 0.01, CHR, { ...CHROME, detail: 2 }),
      ...[-0.7, 0.7].flatMap((x) => [-0.3, 0.3].map((z) => cy(x, 0.01, z, 0.05, 0.02, "#555b60", { ...RUBBER, detail: 1 }))), // feet
    ],
  },
  bt_corner_cabinet: {
    label: "Tall slim cabinet, oak door and grey sides", brand: "Generic", cat: "Bathroom", w: 0.33, d: 0.37, h: 1.8,
    parts: [
      ...[-1, 1].flatMap((sx) => [-1, 1].map((sz) => taperedLeg(sx * 0.14, sz * 0.15, 0.08, 0.034, 0.026, BLACK, { tex: "metal", metal: 0.85, rough: 0.4 }))),
      b(0, 0.94, -0.005, 0.33, 1.72, 0.33, "#8a8d90", { ...MATT, bevel: 0.006 }),
      b(0, 0.94, 0.165, 0.33, 1.7, 0.02, "#c79a62", { ...WOOD, bevel: 0.006, m: true }), // oak front door
      b(0.12, 0.95, 0.178, 0.014, 0.08, 0.014, BLACK, { tex: "metal", metal: 0.85, rough: 0.4, bevel: 0.003 }), // handle
      b(0, 0.94, 0.176, 0.004, 1.68, 0.004, "#5b4126", { bevel: 0, detail: 1 }), // door gap at the hinge side
      b(0, 1.6, 0.1755, 0.31, 0.004, 0.004, "#5b4126", { bevel: 0, detail: 1 }), // veneer seam rails
      b(0, 0.55, 0.1755, 0.31, 0.004, 0.004, "#5b4126", { bevel: 0, detail: 1 }),
      b(0, 0.94, -0.17, 0.3, 1.66, 0.006, "#7b7e81", { bevel: 0, detail: 1 }), // back panel
      cy(-0.12, 1.4, 0.178, 0.012, 0.006, BLACK, { tex: "metal", r: [HALF_PI, 0, 0], detail: 2 }), // hinges
      cy(-0.12, 0.5, 0.178, 0.012, 0.006, BLACK, { tex: "metal", r: [HALF_PI, 0, 0], detail: 2 }),
    ],
  },
  bt_washer: {
    label: "Washing machine, front load", brand: "Generic", cat: "Bathroom", w: 0.6, d: 0.6, h: 0.85,
    parts: [
      b(0, 0.425, -0.02, 0.6, 0.85, 0.56, WHITE, { ...LACQUER, bevel: 0.015, m: true }),
      b(0, 0.8, 0.265, 0.58, 0.1, 0.01, "#eef0f1", { ...PLASTIC, bevel: 0.004 }), // control strip
      b(-0.2, 0.8, 0.272, 0.12, 0.05, 0.005, "#d9dcdf", { ...PLASTIC, bevel: 0.003 }), // detergent drawer
      cy(0, 0.8, 0.275, 0.06, 0.03, CHR, { ...CHROME, r: [HALF_PI, 0, 0] }), // dial
      b(0.16, 0.8, 0.272, 0.13, 0.05, 0.006, "#14181c", { glow: true, rough: 0.08, bevel: 0.003 }), // display
      cy(0, 0.4, 0.27, 0.42, 0.04, "#6d7074", { ...CHROME, rough: 0.3, r: [HALF_PI, 0, 0] }), // door ring
      cy(0, 0.4, 0.285, 0.32, 0.02, "#26323a", { rough: 0.05, metal: 0.4, r: [HALF_PI, 0, 0] }), // glass
      cy(0, 0.4, 0.295, 0.2, 0.01, "#141a1f", { rough: 0.5, r: [HALF_PI, 0, 0] }), // drum
      b(0, 0.4, 0.302, 0.2, 0.02, 0.004, "#4a5560", { spin: { axis: "z", rpm: 60 }, tex: "metal", bevel: 0 }), // drum ribs seen through the glass
      b(0, 0.4, 0.302, 0.02, 0.2, 0.004, "#4a5560", { spin: { axis: "z", rpm: 60 }, tex: "metal", bevel: 0 }),
      cy(0.21, 0.07, 0.27, 0.07, 0.01, "#d9dcdf", { ...PLASTIC, r: [HALF_PI, 0, 0] }), // pump filter cap
      cy(0, 0.4, 0.268, 0.36, 0.01, "#e9ebec", { ...PLASTIC, r: [HALF_PI, 0, 0], detail: 1 }), // door seal rim
      b(0, 0.74, 0.27, 0.56, 0.004, 0.004, "#cfd2d4", { bevel: 0, detail: 1 }), // panel seam under the controls
      b(0, 0.03, 0.27, 0.56, 0.06, 0.01, "#e0e3e4", { ...PLASTIC, bevel: 0.003, detail: 1 }), // plinth panel
      cy(0.07, 0.8, 0.275, 0.012, 0.006, "#7fd1ff", { rough: 0.1, r: [HALF_PI, 0, 0], detail: 2 }), // indicator led
      b(0.255, 0.425, 0.0, 0.004, 0.84, 0.004, "#d2d5d7", { bevel: 0, detail: 2 }), // side seam
      ...[-0.25, 0.25].map((x) => cy(x, 0.01, 0.25, 0.04, 0.02, "#2b2e31", { ...RUBBER, detail: 1 })), // feet
    ],
  },
  bt_water_column: WATER_COLUMN,
  thermostat_wall: {
    label: "Wall thermostat", brand: "Generic", cat: "Lighting & devices", w: 0.09, d: 0.03, h: 0.09, wall: true,
    parts: [
      b(0, 0.045, 0, 0.09, 0.09, 0.03, "#f4f5f6", { ...PLASTIC, rough: 0.35, bevel: 0.008, m: true }),
      b(0, 0.05, 0.0155, 0.06, 0.035, 0.002, "#14181c", { rough: 0.08, bevel: 0.002 }),
      b(0, 0.05, 0.0168, 0.05, 0.025, 0.002, "#7fd1ff", { glow: true, bevel: 0 }), // display
      cy(0, 0.018, 0.0155, 0.02, 0.003, "#c9ccd0", { ...CHROME, r: [HALF_PI, 0, 0] }),
      cy(0, 0.018, 0.0152, 0.026, 0.002, "#d8dadc", { ...PLASTIC, r: [HALF_PI, 0, 0], detail: 1 }), // dial ring
      b(0, 0.078, 0.0165, 0.012, 0.004, 0.002, "#c9ccd0", { bevel: 0, detail: 2 }), // button
    ],
  },
};
