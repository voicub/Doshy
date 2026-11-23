import type { Def } from "./catalog.ts";
import { b, cy, sp, taperedLeg, pillow, seam, handleBar, MATT, LACQUER, WOOD, FAB, FOAM, PLASTIC, CHROME, STEEL, BLACK_METAL, GLOSS } from "./partsKit.ts";

const WHITE = "#f1f0ec";
const OAKGREY = "#c4b5a0";
const CAMEL = "#c19a6b";
const HALF_PI = Math.PI / 2;

export const HOME_BEDROOM: Record<string, Def> = {
  bd_bed: {
    // 160 x 200 cm white frame, camel fleece blanket, grey blanket on the far half
    label: "Bed 160x200 white frame, camel throw", brand: "Generic", cat: "Bedroom", w: 1.7, d: 2.1, h: 0.95,
    parts: [
      b(0, 0.12, 0, 1.7, 0.2, 2.1, WHITE, { ...MATT, bevel: 0.012, m: true }), // frame
      b(0, 0.3, 0.02, 1.6, 0.2, 2.0, "#e9e7e2", { ...FOAM, bevel: 0.05 }), // mattress
      b(0, 0.6, -1.025, 1.7, 0.7, 0.05, WHITE, { ...MATT, bevel: 0.012, m: true }), // headboard
      b(0, 0.62, -1.02, 1.5, 0.3, 0.06, "#e6e4df", { ...FAB, bevel: 0.025 }), // headboard inset panel (padded)
      b(0, 0.92, -1.015, 1.7, 0.06, 0.07, WHITE, { ...MATT, bevel: 0.015, m: true }), // headboard top rail
      b(0, 0.42, -0.35, 1.62, 0.05, 0.85, "#6b6e72", { ...FAB, bevel: 0.025 }), // grey blanket upper half
      b(0, 0.43, 0.43, 1.62, 0.06, 0.8, CAMEL, { ...FAB, bevel: 0.03 }), // camel throw
      b(0, 0.435, 0.0, 1.63, 0.07, 0.1, "#efe9dc", { ...FAB, tex: "fabric", bevel: 0.035 }), // white sherpa band
      pillow(-0.4, 0.5, -0.88, 0.6, 0.12, 0.3, "#8d9a96", { r: [-0.18, 0, 0] }), // pillow
      pillow(0.4, 0.5, -0.88, 0.6, 0.12, 0.3, "#8d9a96", { r: [-0.18, 0, 0] }), // pillow
      b(-0.45, 0.5, 0.75, 0.55, 0.05, 0.3, "#2f3130", { ...FAB, bevel: 0.02 }), // folded dark blanket
      b(0, 0.455, -0.74, 1.64, 0.035, 0.08, "#5c5f63", { ...FAB, bevel: 0.016 }), // duvet fold at the pillows
      b(0, 0.468, 0.43, 1.5, 0.03, 0.6, "#cba47a", { ...FAB, bevel: 0.014 }), // throw: second layer, stepped
      ...[-1, 1].flatMap((sx) => [-1, 1].map((sz) => taperedLeg(sx * 0.78, sz * 0.98, 0.04, 0.05, 0.035, "#d7d4cd", { ...MATT, m: true }))), // feet under the frame
      pillow(-0.4, 0.57, -0.93, 0.55, 0.12, 0.26, "#d9d6cf", { r: [-0.45, 0, 0], detail: 1 }), // back pillows leaning on the headboard
      pillow(0.4, 0.57, -0.93, 0.55, 0.12, 0.26, "#d9d6cf", { r: [-0.45, 0, 0], detail: 1 }),
      pillow(0, 0.52, -0.72, 0.34, 0.1, 0.2, "#c19a6b", { r: [-0.1, 0, 0], detail: 1 }), // lumbar cushion
      ...[-0.6, -0.2, 0.2, 0.6].map((x) => seam(x, 0.62, -0.985, 0.006, 0.28, 0.006, "#cfcdc7")), // padded panel stitch lines
    ],
  },
  bd_nightstand: {
    label: "Bedside table white, 1 drawer", brand: "Generic", cat: "Bedroom", w: 0.4, d: 0.4, h: 0.5,
    parts: [
      b(0, 0.25, -0.025, 0.4, 0.5, 0.35, WHITE, { ...LACQUER, bevel: 0.008, m: true }),
      b(0, 0.34, 0.1525, 0.34, 0.14, 0.01, "#e6e4df", { ...LACQUER, bevel: 0.005 }),
      b(0, 0.14, 0.1525, 0.34, 0.2, 0.01, "#e6e4df", { ...LACQUER, bevel: 0.005 }),
      cy(0, 0.34, 0.165, 0.03, 0.02, "#b8bcc2", { ...CHROME, r: [HALF_PI, 0, 0] }),
      cy(0, 0.14, 0.165, 0.03, 0.02, "#b8bcc2", { ...CHROME, r: [HALF_PI, 0, 0] }),
      b(0, 0.245, 0.158, 0.34, 0.012, 0.006, "#b5b2ab", { bevel: 0, detail: 1 }), // gap between drawer and door
      b(0, 0.49, 0.0, 0.42, 0.02, 0.38, WHITE, { ...LACQUER, bevel: 0.008, detail: 1 }), // top overhang lip
      b(0, 0.34, 0.156, 0.346, 0.146, 0.004, "#bdbab3", { bevel: 0, detail: 1 }), // drawer reveal
      b(0, 0.14, 0.156, 0.346, 0.206, 0.004, "#bdbab3", { bevel: 0, detail: 1 }),
      sp(0, 0.34, 0.181, 0.012, "#d9dcdf", { ...CHROME, detail: 2 }), // knob stems
      sp(0, 0.14, 0.181, 0.012, "#d9dcdf", { ...CHROME, detail: 2 }),
    ],
  },
  bd_wardrobe_sliding: {
    // light grey oak, 2 sliding doors, silver rails, floor-to-near-ceiling
    label: "Sliding-door wardrobe, light oak", brand: "Generic", cat: "Bedroom", w: 1.75, d: 0.6, h: 2.5, solid: true,
    parts: [
      b(0, 1.25, -0.03, 1.75, 2.5, 0.54, "#a79d8f", { ...WOOD, bevel: 0.006 }), // carcass
      b(-0.435, 1.24, 0.26, 0.86, 2.4, 0.03, OAKGREY, { ...WOOD, bevel: 0.006, m: true }), // door left (front track)
      b(0.435, 1.24, 0.22, 0.86, 2.4, 0.03, "#c9bba6", { ...WOOD, bevel: 0.006, m: true }), // door right (rear track)
      b(0, 1.24, 0.285, 0.015, 2.4, 0.02, "#b8bcc2", { ...STEEL, bevel: 0.003 }), // vertical aluminium profile at overlap
      b(0, 2.47, 0.24, 1.75, 0.04, 0.1, "#b8bcc2", { ...STEEL, bevel: 0.004 }), // top rail
      b(0, 0.03, 0.24, 1.75, 0.04, 0.1, "#b8bcc2", { ...STEEL, bevel: 0.004 }), // bottom rail
      b(-0.8625, 1.24, 0.26, 0.015, 2.4, 0.03, "#b8bcc2", { ...STEEL, bevel: 0.003 }), // left edge profile
      b(0.8625, 1.24, 0.22, 0.015, 2.4, 0.03, "#b8bcc2", { ...STEEL, bevel: 0.003 }), // right edge profile
      b(-0.435, 1.24, 0.277, 0.8, 0.004, 0.004, "#8f8574", { bevel: 0, detail: 1 }), // horizontal panel grooves
      b(0.435, 1.24, 0.237, 0.8, 0.004, 0.004, "#a89b86", { bevel: 0, detail: 1 }),
      b(-0.435, 0.7, 0.277, 0.8, 0.004, 0.004, "#8f8574", { bevel: 0, detail: 1 }),
      b(0.435, 1.8, 0.237, 0.8, 0.004, 0.004, "#a89b86", { bevel: 0, detail: 1 }),
      b(0, 2.435, 0.24, 1.7, 0.012, 0.03, "#7e8387", { ...BLACK_METAL, bevel: 0, detail: 1 }), // top track groove
      b(0, 0.058, 0.24, 1.7, 0.012, 0.03, "#7e8387", { ...BLACK_METAL, bevel: 0, detail: 1 }), // bottom track groove
      b(0, 0.04, 0.28, 1.7, 0.04, 0.02, "#7f7568", { bevel: 0, detail: 1 }), // plinth shadow
      handleBar(-0.08, 1.1, 0.275, 0.3, "y", "#b8bcc2"), // finger pulls at the overlap
      handleBar(0.08, 1.1, 0.235, 0.3, "y", "#b8bcc2"),
    ],
  },
  bd_tv_wall: {
    label: "Wall-mounted TV 55 in, black", brand: "Generic", cat: "Lighting & devices", w: 1.25, d: 0.06, h: 0.72, wall: true,
    light: { y: 0.36, color: "#7fb2ff" },
    parts: [
      b(0, 0.36, 0, 1.25, 0.72, 0.04, "#0c0d0f", { ...PLASTIC, rough: 0.35, bevel: 0.006 }), // bezel/back
      b(0, 0.36, 0.021, 1.2, 0.67, 0.01, "#15171b", { ...GLOSS, glow: true, bevel: 0.002 }), // screen
      b(0, 0.36, -0.025, 0.3, 0.2, 0.01, "#2a2c30", { ...BLACK_METAL, bevel: 0.004 }), // bracket
      b(0, 0.36, -0.015, 1.22, 0.69, 0.006, "#1a1b1e", { bevel: 0.004, detail: 1 }), // back shell
      b(0, 0.015, 0.0235, 0.1, 0.006, 0.004, "#3a3c40", { bevel: 0.002, detail: 2 }), // logo
      sp(0.58, 0.02, 0.0235, 0.008, "#ff4040", { detail: 2 }), // standby led
      b(-0.2, 0.36, -0.02, 0.03, 0.2, 0.02, "#2a2c30", { ...BLACK_METAL, bevel: 0.004, detail: 1 }), // bracket arms
      b(0.2, 0.36, -0.02, 0.03, 0.2, 0.02, "#2a2c30", { ...BLACK_METAL, bevel: 0.004, detail: 1 }),
      b(0, 0.12, -0.012, 0.3, 0.1, 0.014, "#25272a", { bevel: 0.004, detail: 1 }), // ports panel
    ],
  },
  bd_rug_dark: {
    label: "Rug dark grey, bedside", brand: "Generic", cat: "Decor", w: 0.9, d: 1.6, h: 0.03,
    parts: [
      b(0, 0.015, 0, 0.9, 0.03, 1.6, "#3b3d3f", { ...FAB, bevel: 0.01, m: true }),
      b(0, 0.031, 0.745, 0.82, 0.004, 0.03, "#2a2c2e", { bevel: 0, detail: 1 }), // border strips (woven edge)
      b(0, 0.031, -0.745, 0.82, 0.004, 0.03, "#2a2c2e", { bevel: 0, detail: 1 }),
      b(0.425, 0.031, 0, 0.03, 0.004, 1.5, "#2a2c2e", { bevel: 0, detail: 1 }),
      b(-0.425, 0.031, 0, 0.03, 0.004, 1.5, "#2a2c2e", { bevel: 0, detail: 1 }),
      b(0, 0.032, 0, 0.6, 0.002, 1.3, "#45474a", { ...FAB, bevel: 0, detail: 1 }), // lighter pile field
    ],
  },
  bd_ceiling_light: {
    label: "Round LED ceiling light", brand: "Generic", cat: "Lighting & devices", w: 0.5, d: 0.5, h: 0.1, wall: true,
    light: { y: 0.05, color: "#fff6e0" },
    parts: [
      cy(0, 0.015, 0, 0.5, 0.03, "#e8e8e6", { ...PLASTIC, rough: 0.35 }),
      cy(0, 0.06, 0, 0.44, 0.06, "#fffdf5", { rough: 0.35, glow: true }),
      cy(0, 0.033, 0, 0.47, 0.008, "#c9ccd0", { ...CHROME, rough: 0.25, detail: 1 }), // trim ring
      cy(0, 0.094, 0, 0.1, 0.012, "#e8e8e6", { ...PLASTIC, detail: 1 }), // diffuser cap
      ...[0, 1, 2, 3].map((i) => cy(0.225 * Math.cos((i * HALF_PI) + 0.78), 0.03, 0.225 * Math.sin((i * HALF_PI) + 0.78), 0.01, 0.006, "#c9ccd0", { ...CHROME, detail: 2 })), // fixing screws
    ],
  },
};
