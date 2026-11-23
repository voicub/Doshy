import type { Def, Part } from "./catalog";
import { wallTrailing } from "./decor/plants.ts";
import { b, cy, sp, turned, taperedLeg, cushion, pillow, seam, handleBar, knob, drawerFront, vaseProfile, WOOD, LACQUER, MATT, FAB, LEATHER, PLASTIC, CERAMIC, RUBBER, STEEL, CHROME, BLACK_METAL, GLOSS } from "./partsKit.ts";

// Office pieces modelled on the real apartment photos. Local helpers (catalog.ts imports this file).
const WHITE = "#f4f3f0";
const SEAM = "#d9d8d4";
const BLACK = "#1c1d20";
const OAK = "#c9a05f";
const BOOKC = ["#7a2f2a", "#2f3c52", "#d9a02c", "#5b7a5e", "#e8e0d0", "#3a3a3a"];
const PAPER = { tex: "paint", rough: 0.8, bevel: 0.002 } as const;

// ALEX-style drawer unit: n white fronts with a dark slot handle each
const alex = (x: number, z: number, w: number, d: number, h: number, n: number): Part[] => {
  const fh = (h - 0.05) / n;
  return [
    b(x, h / 2, z - 0.01, w, h, d - 0.02, SEAM, { ...MATT, bevel: 0.006 }),
    ...Array.from({ length: n }, (_, i) => {
      const y = 0.035 + fh * i + fh / 2;
      return [
        ...drawerFront(x, y, z + d / 2 - 0.014, w - 0.016, fh - 0.008, WHITE, { ...LACQUER, thick: 0.014 }),
        b(x, y + fh * 0.22, z + d / 2 - 0.004, 0.1, 0.012, 0.008, "#8e9196", { ...STEEL, bevel: 0.003, detail: 2 }),
      ];
    }).flat(),
  ];
};

// mesh ergonomic chair: 5-star chrome base, tall mesh back, headrest, adjustable arms
const ergoChair = (frame: string, fab = BLACK, mesh = "#26282b"): Part[] => {
  const spokes = Array.from({ length: 5 }, (_, i) => {
    const t = (i * 2 * Math.PI) / 5;
    return [
      b(0.14 * Math.cos(t), 0.07, -0.14 * Math.sin(t), 0.28, 0.025, 0.035, "#c4c8ce", { ...CHROME, bevel: 0.008, r: [0, t, 0] }),
      cy(0.27 * Math.cos(t), 0.03, -0.27 * Math.sin(t), 0.05, 0.05, BLACK, RUBBER),
    ];
  }).flat();
  return [
    ...spokes,
    turned(0, 0.07, 0, [[0.035, 0], [0.035, 0.05], [0.025, 0.06]], BLACK, PLASTIC),
    turned(0, 0.13, 0, [[0.03, 0], [0.025, 0.02], [0.025, 0.34]], "#c4c8ce", CHROME),
    b(0, 0.45, 0.02, 0.22, 0.04, 0.26, BLACK, { ...PLASTIC, bevel: 0.01 }), // seat mechanism
    cushion(0, 0.5, 0.02, 0.5, 0.09, 0.5, fab, { bevel: 0.035 }),
    b(0, 0.455, 0.02, 0.4, 0.03, 0.4, frame, { ...PLASTIC, bevel: 0.01 }),
    b(0, 0.57, -0.26, 0.08, 0.28, 0.04, frame, { ...PLASTIC, bevel: 0.012 }),
    b(0, 0.86, -0.28, 0.46, 0.55, 0.035, mesh, { ...FAB, bevel: 0.01 }),
    b(-0.24, 0.86, -0.28, 0.035, 0.6, 0.05, frame, { ...PLASTIC, bevel: 0.012 }),
    b(0.24, 0.86, -0.28, 0.035, 0.6, 0.05, frame, { ...PLASTIC, bevel: 0.012 }),
    b(0, 0.7, -0.255, 0.3, 0.12, 0.03, fab, { ...FAB, bevel: 0.012 }), // lumbar support
    cushion(0, 1.2, -0.29, 0.3, 0.16, 0.06, fab, { bevel: 0.02 }), // headrest
    b(0, 1.12, -0.285, 0.04, 0.12, 0.03, frame, { ...PLASTIC, bevel: 0.008 }),
    ...[-1, 1].flatMap((s) => [
      b(s * 0.29, 0.63, -0.02, 0.03, 0.2, 0.03, frame, { ...PLASTIC, bevel: 0.01 }),
      b(s * 0.29, 0.73, 0.04, 0.07, 0.03, 0.3, fab, { ...FAB, bevel: 0.014 }),
    ]),
    // curved back: soft frame wings angled forward (rotated, inside the footprint)
    ...[-1, 1].flatMap((s) => [b(s * 0.235, 1.12, -0.27, 0.03, 0.2, 0.05, frame, { ...PLASTIC, bevel: 0.01, r: [0, s * 0.35, 0] })]),
    b(0, 1.145, -0.268, 0.46, 0.012, 0.03, frame, { ...PLASTIC, bevel: 0.004, detail: 1 }),
    b(0, 0.585, -0.268, 0.46, 0.012, 0.03, frame, { ...PLASTIC, bevel: 0.004, detail: 1 }),
    b(0.08, 0.41, 0.2, 0.012, 0.012, 0.09, "#8e9196", { ...STEEL, bevel: 0.004, detail: 2 }), // height lever
  ];
};

// IKEA EKET wall modules: 0.35 m grid, white, push-to-open fronts with a tiny black pull at the lower corner.
// Local origin = footprint centre, y 0 = bottom edge of the module, back at -d/2.
const EK = "#f2f1ee";
const EKT = 0.018;
const EKM = { ...MATT, bevel: 0.003, m: true } as const;
const ekOpen = (w: number, d: number, divider = false): Part[] => {
  const h = 0.35;
  return [
    b(0, h / 2, -d / 2 + 0.006, w, h, 0.012, EK, { ...EKM, bevel: 0 }),
    b(0.0, h - EKT / 2, 0.006, w, EKT, d - 0.012, EK, EKM),
    b(0.0, EKT / 2, 0.006, w, EKT, d - 0.012, EK, EKM),
    b(-w / 2 + EKT / 2, h / 2, 0.006, EKT, h - 2 * EKT, d - 0.012, EK, EKM),
    b(w / 2 - EKT / 2, h / 2, 0.006, EKT, h - 2 * EKT, d - 0.012, EK, EKM),
    ...(divider ? [b(0, h / 2, 0.006, EKT, h - 2 * EKT, d - 0.012, EK, EKM)] : []),
    b(0, h / 2, -d / 2 + 0.013, w - 2 * EKT, h - 2 * EKT, 0.002, "#e4e3df", { ...MATT, bevel: 0, detail: 1 }), // inner back liner
  ];
};
// closed carcass with the front recessed 10 mm so the black pulls stay inside the footprint
const ekBody = (w: number, h: number, d: number): Part => b(0, h / 2, -0.013, w, h, d - 0.026, EK, EKM);
const ekDoor = (x: number, y: number, w: number, h: number, d: number, pull?: [number, number]): Part[] => [
  b(x, y, d / 2 - 0.018, w - 0.004, h - 0.004, 0.016, EK, { ...LACQUER, bevel: 0.005, m: true }),
  ...(pull ? [b(x + pull[0], y + pull[1], d / 2 - 0.005, 0.012, 0.05, 0.01, "#1c1d20", { ...PLASTIC, bevel: 0.003, detail: 2 })] : []),
];
const ekBooks = (d: number): Part[] =>
  Array.from({ length: 6 }, (_, i) => {
    const bh = 0.2 + (i % 3) * 0.03;
    const x = -0.135 + i * 0.047;
    const z = -d / 2 + 0.012 + 0.1;
    return [b(x, EKT + bh / 2, z, 0.042, bh, 0.19, BOOKC[i], PAPER), b(x, EKT + bh * 0.8, z + 0.096, 0.043, 0.012, 0.002, "#e8dcc0", { bevel: 0, detail: 2 })];
  }).flat();
const ek = (label: string, w: number, d: number, h: number, parts: Part[]): Def => ({
  wall: true, family: "eket", label, brand: "IKEA", cat: "Office", w, d, h, parts,
});
const EKET: Record<string, Def> = {
  eket_door_35: ek("EKET cabinet 35x35 with door", 0.35, 0.35, 0.35, [ekBody(0.35, 0.35, 0.35), ...ekDoor(0, 0.175, 0.35, 0.35, 0.35, [0.14, -0.1])]),
  eket_door_35_shallow: ek("EKET cabinet 35x25 shallow with door", 0.35, 0.25, 0.35, [ekBody(0.35, 0.35, 0.25), ...ekDoor(0, 0.175, 0.35, 0.35, 0.25, [0.14, -0.1])]),
  eket_open_35: ek("EKET open compartment 35x35", 0.35, 0.35, 0.35, ekOpen(0.35, 0.35)),
  eket_open_35_shallow: ek("EKET open compartment 35x25 shallow", 0.35, 0.25, 0.35, ekOpen(0.35, 0.25)),
  eket_open_35_books: ek("EKET open compartment with books", 0.35, 0.35, 0.35, [...ekOpen(0.35, 0.35), ...ekBooks(0.35)]),
  eket_door_35x70: ek("EKET tall cabinet 35x70 with door", 0.35, 0.35, 0.7, [ekBody(0.35, 0.7, 0.35), ...ekDoor(0, 0.35, 0.35, 0.7, 0.35, [0.14, -0.28])]),
  eket_door_70x35: ek("EKET cabinet 70x35 with two doors", 0.7, 0.35, 0.35, [
    ekBody(0.7, 0.35, 0.35),
    ...ekDoor(-0.175, 0.175, 0.35, 0.35, 0.35, [0.14, -0.1]),
    ...ekDoor(0.175, 0.175, 0.35, 0.35, 0.35, [-0.14, -0.1]),
  ]),
  eket_drawers_35: ek("EKET cabinet 35x35 with 2 drawers", 0.35, 0.35, 0.35, [
    ekBody(0.35, 0.35, 0.35),
    ...ekDoor(0, 0.088, 0.35, 0.172, 0.35),
    ...ekDoor(0, 0.262, 0.35, 0.172, 0.35),
  ]),
  eket_open_70x35: ek("EKET open compartment 70x35 with divider", 0.7, 0.35, 0.35, ekOpen(0.7, 0.35, true)),
};

// curtain: gathered pleats between x0..x1
const pleats = (x0: number, x1: number, c: string, c2: string, layer: "sheer" | "blackout", m?: true): Part[] => {
  const n = Math.max(3, Math.round((x1 - x0) / 0.1));
  const w = (x1 - x0) / n;
  return Array.from({ length: n }, (_, i) => b(x0 + w * (i + 0.5), 1.17, i % 2 ? 0.03 : -0.02, w, 2.25, 0.04, i % 2 ? c2 : c, { ...FAB, bevel: 0.012, layer, ...(m ? { m } : {}) }));
};
// rod, finials and rings keep their slots after the cloth; brackets appended
const rod = (w: number, rings: number[]): Part[] => [
  cy(0, 2.35, 0, 0.02, w, BLACK, { ...BLACK_METAL, r: [0, 0, Math.PI / 2] }),
  sp(-w / 2 + 0.03, 2.35, 0, 0.05, BLACK, BLACK_METAL),
  sp(w / 2 - 0.03, 2.35, 0, 0.05, BLACK, BLACK_METAL),
  ...rings.map((x) => b(x, 2.31, 0, 0.012, 0.07, 0.05, BLACK, { ...BLACK_METAL, bevel: 0.005 })),
  ...[-1, 1].map((s) => b(s * (w / 2 - 0.2), 2.35, -0.035, 0.02, 0.025, 0.07, BLACK, { ...BLACK_METAL, bevel: 0.004, detail: 1 })),
];

// spot head: cylinder tilted by a about z, with a glow disc on the opening
const head = (cx: number, cyy: number, cz: number, dia: number, h: number, a: number, shade: string): Part[] => {
  const ex = Math.sin(a) * (h / 2), ey = -Math.cos(a) * (h / 2);
  return [
    cy(cx, cyy, cz, dia, h, shade, { ...BLACK_METAL, r: [0, 0, a] }),
    cy(cx + Math.sin(a) * (h / 2 + 0.002), cyy - Math.cos(a) * (h / 2 + 0.002), cz, dia * 0.8, 0.012, "#ffe2a8", { glow: true, r: [0, 0, a] }),
    cy(cx + ex, cyy + ey, cz, dia + 0.008, 0.01, shade, { ...STEEL, detail: 1, r: [0, 0, a] }), // rim ring
    cy(cx - ex, cyy - ey, cz, dia * 0.5, 0.02, shade, { ...BLACK_METAL, detail: 1, r: [0, 0, a] }), // back cap
  ];
};

const rugPiece = (x: number, z: number, w: number, d: number, a: number, c: string, y: number): Part => b(x, y, z, w, 0.004, d, c, { ...FAB, bevel: 0.001, r: [0, a, 0] });

// column of upright books inside a shelf cell centred at x, standing on y
const bookCols = (x: number, y: number, d: number): Part[] =>
  Array.from({ length: 6 }, (_, i) => {
    const h = 0.26 + (i % 3) * 0.02;
    const bx = x - 0.125 + i * 0.05;
    const c = i % 2 ? "#1f2023" : BOOKC[i];
    return [b(bx, y + 0.14 + (i % 3) * 0.01, 0, 0.044, h, d, c, PAPER), b(bx, y + 0.14 + (i % 3) * 0.01 + h * 0.25, d / 2 + 0.001, 0.045, 0.014, 0.002, "#e8dcc0", { bevel: 0, detail: 2 })];
  }).flat();

export const HOME_OFFICE: Record<string, Def> = {
  of_desk_wood_led: {
    label: "Oak-top desk with ALEX drawers and LED", brand: "Generic", cat: "Office", w: 1.8, d: 0.7, h: 1.2,
    light: { y: 0.78, color: "#ff6aa8" },
    parts: [
      b(0, 0.73, 0, 1.8, 0.04, 0.7, OAK, { ...WOOD, bevel: 0.008, m: true }),
      ...alex(0.72, 0.04, 0.36, 0.58, 0.71, 5),
      ...alex(-0.72, 0.04, 0.36, 0.58, 0.71, 5),
      b(-0.2, 0.62, -0.3, 1.1, 0.12, 0.02, SEAM, { ...MATT, bevel: 0.004 }), // modesty panel
      b(-0.1, 0.755, 0.08, 0.7, 0.006, 0.32, "#2b2d31", { ...RUBBER, bevel: 0.003 }), // desk mat
      b(-0.1, 0.77, 0.08, 0.38, 0.018, 0.13, "#d8dadc", { ...PLASTIC, bevel: 0.006 }), // keyboard
      b(0.2, 0.765, 0.08, 0.06, 0.03, 0.1, "#c9cbcd", { ...PLASTIC, bevel: 0.014 }), // mouse
      b(-0.65, 0.76, -0.05, 0.3, 0.015, 0.21, "#c9cbcf", { ...STEEL, bevel: 0.005 }), // laptop base
      b(-0.65, 0.86, -0.15, 0.3, 0.2, 0.01, "#d4d6da", { ...STEEL, bevel: 0.004, r: [-0.2, 0, 0] }), // laptop lid
      b(0.4, 0.84, -0.27, 0.16, 0.2, 0.16, BLACK, { ...PLASTIC, bevel: 0.02 }), // speaker
      b(-0.1, 0.78, -0.343, 1.5, 0.014, 0.012, "#ff6aa8", { glow: true }),
      b(0, 0.695, -0.33, 1.7, 0.014, 0.012, "#ff6aa8", { glow: true }),
      b(-0.65, 0.856, -0.144, 0.28, 0.17, 0.003, "#15181d", { ...GLOSS, bevel: 0.002, detail: 1, r: [-0.2, 0, 0] }), // laptop screen
      cy(0.4, 0.8, -0.188, 0.1, 0.005, "#26282c", { ...RUBBER, detail: 1, r: [Math.PI / 2, 0, 0] }), // woofer
      cy(0.4, 0.9, -0.188, 0.04, 0.005, "#26282c", { ...RUBBER, detail: 1, r: [Math.PI / 2, 0, 0] }), // tweeter
      ...[0, 1, 2].map((i) => b(-0.1, 0.7805 + 0, 0.045 + i * 0.04, 0.36, 0.003, 0.025, "#b9bcc0", { bevel: 0.001, detail: 2 })), // key rows
      cy(0.62, 0.752, -0.22, 0.06, 0.006, "#17181b", { ...RUBBER, detail: 2 }), // cable grommet
    ],
  },
  // the curved ultrawide monitor, a separate piece so its power plug (switch.office_pc_display) can be linked; stands on the desk top (elev 0.75)
  of_monitor_ultrawide: {
    label: "Curved ultrawide monitor", brand: "Generic", cat: "Office", w: 0.64, d: 0.25, h: 0.42,
    parts: [
      b(0, 0.25, 0, 0.34, 0.3, 0.02, "#12161c", { ...GLOSS, glow: true, bevel: 0.003 }),
      b(-0.21, 0.25, 0.02, 0.2, 0.3, 0.02, "#12161c", { ...GLOSS, glow: true, bevel: 0.003, r: [0, 0.4, 0] }),
      b(0.21, 0.25, 0.02, 0.2, 0.3, 0.02, "#12161c", { ...GLOSS, glow: true, bevel: 0.003, r: [0, -0.4, 0] }),
      b(0, 0.25, -0.022, 0.34, 0.31, 0.025, BLACK, { ...PLASTIC, bevel: 0.01 }),
      cy(0, 0.1, -0.08, 0.035, 0.24, "#2a2c30", { ...BLACK_METAL, rough: 0.3 }),
      b(0, 0.01, -0.08, 0.16, 0.015, 0.14, BLACK, { ...BLACK_METAL, bevel: 0.007 }),
      b(-0.21, 0.25, -0.0, 0.2, 0.31, 0.022, BLACK, { ...PLASTIC, bevel: 0.01, r: [0, 0.4, 0] }), // bezel/back of the wings
      b(0.21, 0.25, -0.0, 0.2, 0.31, 0.022, BLACK, { ...PLASTIC, bevel: 0.01, r: [0, -0.4, 0] }),
      b(0, 0.03, -0.08, 0.1, 0.02, 0.09, "#2a2c30", { ...BLACK_METAL, bevel: 0.006, detail: 1 }), // foot riser
      sp(0.14, 0.104, 0.012, 0.007, "#9fd7a8", { detail: 2 }), // power LED
    ],
  },
  // "Odin": the home server, a black mesh-front tower on the floor beside the desk drawers (photo IMG_4625). Front faces +z.
  of_server_odin: {
    label: "Odin server tower", brand: "Generic", cat: "Office", w: 0.22, d: 0.46, h: 0.48,
    parts: [
      b(0, 0.25, 0, 0.22, 0.46, 0.46, "#101114", { ...BLACK_METAL, bevel: 0.01 }),
      b(0, 0.25, 0.232, 0.2, 0.42, 0.008, "#1b1d22", { ...BLACK_METAL, bevel: 0.002 }),
      b(0, 0.01, 0, 0.2, 0.02, 0.42, "#24262b", { ...BLACK_METAL, bevel: 0.004 }),
      b(0.07, 0.43, 0.238, 0.018, 0.018, 0.004, "#4ad7ff", { glow: true }),
      b(-0.09, 0.25, 0.238, 0.008, 0.36, 0.004, "#4ad7ff", { glow: true }),
      ...Array.from({ length: 3 }, (_, i) => b(0.01, 0.1 + i * 0.12, 0.2365, 0.15, 0.03, 0.002, "#0a0b0d", { bevel: 0, detail: 1 })), // mesh slits
      b(0.1105, 0.25, 0, 0.003, 0.38, 0.38, "#14171c", { ...GLOSS, bevel: 0, detail: 1 }), // side window
      cy(-0.03, 0.43, 0.238, 0.02, 0.006, "#8e9196", { ...STEEL, detail: 2, r: [Math.PI / 2, 0, 0] }), // power button
      b(0.03, 0.4, 0.238, 0.03, 0.01, 0.003, "#2a2c30", { bevel: 0.002, detail: 2 }), // usb
    ],
  },
  of_desk_mini: {
    label: "Mini desk, white", brand: "Generic", cat: "Office", w: 1.44, d: 0.5, h: 0.78,
    light: { y: 0.72, color: "#6a54ff" },
    parts: [
      // matte white melamine top, full 1.44 x 0.50
      b(0, 0.735, 0, 1.44, 0.03, 0.5, "#f5f5f3", { ...MATT, bevel: 0.006, m: true }),
      // thin end panel on the open (-x) end, full depth
      b(-0.711, 0.36, 0, 0.018, 0.72, 0.5, WHITE, { ...MATT, bevel: 0.003 }),
      // bay divider + back panel + shelf holding two binders (x -0.02..0.38)
      b(-0.01, 0.36, -0.08, 0.018, 0.72, 0.34, WHITE, { ...MATT, bevel: 0.003 }),
      b(0.185, 0.36, -0.245, 0.4, 0.72, 0.01, WHITE, { ...MATT, bevel: 0.002 }),
      b(0.19, 0.4, -0.08, 0.36, 0.018, 0.34, WHITE, { ...MATT, bevel: 0.003 }),
      b(0.19, 0.01, -0.08, 0.36, 0.02, 0.34, WHITE, { ...MATT, bevel: 0.003 }),
      b(0.1, 0.17, -0.08, 0.07, 0.3, 0.26, "#3aa9a4", PAPER),
      b(0.2, 0.17, -0.08, 0.06, 0.3, 0.26, "#17181b", PAPER),
      // drawer cabinet 0.34 x 0.34 x 0.72 at the +x end, flush to the back
      b(0.55, 0.36, -0.08, 0.34, 0.72, 0.34, SEAM, { ...MATT, bevel: 0.004 }),
      b(0.55, 0.6, 0.091, 0.32, 0.2, 0.012, WHITE, { ...LACQUER, bevel: 0.004 }),
      b(0.55, 0.28, 0.091, 0.32, 0.52, 0.012, WHITE, { ...LACQUER, bevel: 0.004 }),
      handleBar(0.55, 0.62, 0.097, 0.12, "x", "#9a9ea4"),
      handleBar(0.55, 0.52, 0.097, 0.12, "x", "#9a9ea4"),
      // blue-violet LED: back underside edge + behind the top rear edge
      b(-0.33, 0.7, -0.24, 0.76, 0.014, 0.012, "#6a54ff", { glow: true }),
      b(0, 0.77, -0.246, 1.4, 0.016, 0.008, "#6a54ff", { glow: true }),
      b(0.55, 0.43, 0.0975, 0.32, 0.004, 0.003, "#cfcfcc", { bevel: 0, detail: 1 }), // drawer reveal
      b(0.1, 0.17, -0.08 + 0.131, 0.05, 0.1, 0.002, "#e8f3f2", { bevel: 0, detail: 2 }), // binder label
      b(0.2, 0.17, -0.08 + 0.131, 0.04, 0.1, 0.002, "#e8e8e8", { bevel: 0, detail: 2 }),
    ],
  },
  of_alex_drawers: {
    label: "ALEX drawer unit 5 drawers", brand: "IKEA", cat: "Office", w: 0.36, d: 0.58, h: 0.7,
    parts: [...alex(0, 0, 0.36, 0.58, 0.7, 5), b(0, 0.7 - 0.01, 0, 0.34, 0.02, 0.5, "#c9c8c4", { ...MATT, bevel: 0.006 })],
  },
  of_alex_drawers_tall: {
    label: "ALEX tall drawer unit 8 drawers", brand: "IKEA", cat: "Office", w: 0.36, d: 0.58, h: 1.15,
    parts: [
      ...alex(0, 0, 0.36, 0.58, 1.15, 8),
      b(0, 1.143, 0, 0.34, 0.012, 0.56, "#c9c8c4", { ...MATT, bevel: 0.004, detail: 1 }), // top plate
      ...[-1, 1].map((s) => cy(s * 0.14, 0.012, 0.25, 0.022, 0.012, "#8e9196", { ...STEEL, detail: 2 })), // stop pins
    ],
  },
  ...EKET,
  of_chair_ergo_black: {
    label: "Ergonomic mesh chair black", brand: "Generic", cat: "Office", w: 0.7, d: 0.7, h: 1.35,
    parts: ergoChair("#1c1d20"),
  },
  of_chair_ergo_grey: {
    label: "Ergonomic mesh chair grey", brand: "Generic", cat: "Office", w: 0.7, d: 0.7, h: 1.35,
    parts: ergoChair("#e6e8ea", "#d3d6d9", "#8f979e"),
  },
  of_bean_bag: {
    label: "Black bean bag", brand: "Generic", cat: "Living", w: 0.9, d: 0.9, h: 0.7,
    parts: [
      turned(0, 0, 0, [[0.3, 0], [0.4, 0.04], [0.42, 0.14], [0.4, 0.22], [0.34, 0.26]], "#17181b", { ...LEATHER, rough: 0.6, m: true }),
      sp(0, 0.35, 0, 0.7, "#1b1c1f", { ...LEATHER, rough: 0.6, m: true }),
      sp(0.12, 0.31, 0.14, 0.62, "#1b1c1f", { ...LEATHER, rough: 0.6, m: true }),
      sp(-0.08, 0.46, -0.1, 0.45, "#202124", { ...LEATHER, rough: 0.6, m: true }),
      sp(-0.24, 0.3, 0.2, 0.36, "#1b1c1f", { ...LEATHER, rough: 0.6 }), // slumped lumps
      sp(0.26, 0.32, -0.18, 0.34, "#1b1c1f", { ...LEATHER, rough: 0.6 }),
      cy(0, 0.262, 0, 0.8, 0.012, "#0f1012", { ...RUBBER, detail: 1 }), // seam piping
      b(0, 0.698, 0, 0.1, 0.02, 0.025, "#0f1012", { ...RUBBER, bevel: 0.008, detail: 2 }), // carry handle
    ],
  },
  // HEKTAR 3-head floor lamp: the stand and three separate heads, one per bulb (light.office_sofa_lamp_1..3). Each head stands on the pole axis at its own height (elev).
  of_hektar_stand: {
    label: "HEKTAR floor lamp stand", brand: "IKEA", cat: "Lighting & devices", w: 0.45, d: 0.45, h: 1.9,
    parts: [
      turned(0, 0, 0, [[0.16, 0], [0.16, 0.012], [0.12, 0.032], [0.03, 0.04]], "#25262a", { ...BLACK_METAL, rough: 0.5 }),
      cy(0, 0.95, 0, 0.022, 1.85, BLACK, { ...BLACK_METAL, rough: 0.35 }),
      turned(0, 0.04, 0, [[0.03, 0], [0.011, 0.06]], "#25262a", { ...BLACK_METAL, detail: 1 }), // collar
      sp(0, 1.87, 0, 0.03, "#25262a", { ...BLACK_METAL, detail: 1 }), // top cap
      b(0.05, 0.3, 0.012, 0.03, 0.015, 0.02, "#1c1d20", { ...PLASTIC, bevel: 0.005, detail: 2 }), // cord switch
    ],
  },
  of_hektar_head: {
    label: "HEKTAR lamp head", brand: "IKEA", cat: "Lighting & devices", w: 0.2, d: 0.2, h: 0.2,
    light: { y: 0.1, color: "#ffb15c", k: 0.4 },
    parts: [b(0.05, 0.14, 0, 0.1, 0.015, 0.015, BLACK, { ...BLACK_METAL, bevel: 0.004 }), ...head(0.1, 0.1, 0, 0.16, 0.14, 0.7, BLACK), sp(0.09, 0.14, 0, 0.03, BLACK, { ...BLACK_METAL, detail: 1 })],
  },
  of_rug_geo: {
    label: "Geometric grey rug", brand: "Generic", cat: "Decor", w: 2.0, d: 1.4, h: 0.02,
    parts: [
      b(0, 0.004, 0, 2.0, 0.008, 1.4, "#8a8d92", { ...FAB, bevel: 0.003, m: true }),
      rugPiece(-0.55, -0.3, 0.6, 0.5, 0.5, "#4a4d52", 0.01),
      rugPiece(0.35, -0.35, 0.7, 0.35, -0.4, "#b4b6ba", 0.01),
      rugPiece(0.66, 0.1, 0.42, 0.45, 0.7, "#4a4d52", 0.012),
      rugPiece(-0.6, 0.35, 0.65, 0.4, -0.5, "#b4b6ba", 0.012),
      rugPiece(0.0, 0.1, 0.55, 0.55, 0.78, "#4a4d52", 0.014),
      rugPiece(0.2, 0.47, 0.5, 0.3, 0.3, "#b4b6ba", 0.014),
      rugPiece(-0.2, -0.45, 0.4, 0.25, -0.8, "#8a8d92", 0.016),
      rugPiece(0.75, -0.49, 0.3, 0.3, 0.6, "#8a8d92", 0.016),
      // woven border
      b(0, 0.0085, -0.685, 1.96, 0.002, 0.03, "#6f7277", { ...FAB, bevel: 0.001, detail: 1 }),
      b(0, 0.0085, 0.685, 1.96, 0.002, 0.03, "#6f7277", { ...FAB, bevel: 0.001, detail: 1 }),
      b(-0.985, 0.0085, 0, 0.03, 0.002, 1.4, "#6f7277", { ...FAB, bevel: 0.001, detail: 1 }),
      b(0.985, 0.0085, 0, 0.03, 0.002, 1.4, "#6f7277", { ...FAB, bevel: 0.001, detail: 1 }),
    ],
  },
  of_stool_round: {
    label: "Round upholstered stool", brand: "Generic", cat: "Decor", w: 0.35, d: 0.35, h: 0.42,
    parts: [
      turned(0, 0.35, 0, [[0.16, 0], [0.175, 0.015], [0.175, 0.05], [0.145, 0.07]], "#c9ccd0", { ...FAB, m: true }),
      cy(0, 0.35, 0, 0.3, 0.02, "#b4b7bb", PLASTIC),
      ...[-1, 1].flatMap((sx) => [-1, 1].map((sz) => cy(sx * 0.105, 0.19, sz * 0.105, 0.03, 0.36, "#c2975f", { ...WOOD, r: [-sz * 0.146, 0, sx * 0.146] }))),
      cy(0, 0.3, 0, 0.26, 0.012, "#c2975f", { ...WOOD, detail: 1 }), // leg ring
      cy(0, 0.388, 0, 0.352, 0.008, "#a8abaf", { ...FAB, detail: 1 }), // piping
      sp(0, 0.416, 0, 0.03, "#a8abaf", { ...FAB, detail: 2 }), // tuft button
    ],
  },
  of_dehumidifier: {
    label: "Small dehumidifier", brand: "Generic", cat: "Lighting & devices", w: 0.3, d: 0.2, h: 0.5,
    parts: [
      b(0, 0.25, 0, 0.3, 0.5, 0.2, WHITE, { ...PLASTIC, bevel: 0.016 }),
      ...Array.from({ length: 6 }, (_, i) => b(0, 0.12 + i * 0.045, 0.097, 0.22, 0.02, 0.006, "#8c9096", { ...PLASTIC, bevel: 0.002 })),
      b(0, 0.44, 0.097, 0.2, 0.04, 0.006, "#4a4d52", { ...GLOSS, bevel: 0.003 }),
      b(0, 0.26, 0.094, 0.17, 0.01, 0.004, "#2a2c30", { ...PLASTIC, bevel: 0, spin: { axis: "z", rpm: 300 } }), // fan blades behind the grille
      b(0, 0.26, 0.094, 0.01, 0.17, 0.004, "#2a2c30", { ...PLASTIC, bevel: 0, spin: { axis: "z", rpm: 300 } }),
      b(0.06, 0.44, 0.097, 0.03, 0.015, 0.004, "#7ad1ff", { glow: true }),
      b(0, 0.5 - 0.01, 0, 0.18, 0.02, 0.1, "#dcdad6", { ...PLASTIC, bevel: 0.008 }),
      b(0, 0.125, 0.1, 0.26, 0.004, 0.003, "#cfcdc9", { bevel: 0, detail: 1 }), // tank seam
      b(0, 0.215, 0.1, 0.26, 0.004, 0.003, "#cfcdc9", { bevel: 0, detail: 1 }),
      b(-0.12, 0.485, 0.0, 0.03, 0.005, 0.12, "#bfbdb9", { bevel: 0.002, detail: 1 }), // carry groove
      ...[-0.07, -0.03].map((x) => cy(x, 0.44, 0.1, 0.014, 0.004, "#8c9096", { ...PLASTIC, detail: 2, r: [Math.PI / 2, 0, 0] })), // buttons
      b(0.12, 0.38, 0.1, 0.03, 0.006, 0.003, "#7ad1ff", { bevel: 0, detail: 2 }), // water level mark
    ],
  },
  of_printer_3d: {
    label: "3D printer on LACK-style low table", brand: "Generic", cat: "Office", w: 0.9, d: 0.55, h: 1.02,
    parts: [
      // light beech low table 90 x 55 x 45 with lower shelf
      b(0, 0.435, 0, 0.9, 0.03, 0.55, "#dcc59b", { ...WOOD, bevel: 0.005, m: true }),
      ...[-1, 1].flatMap((sx) => [-1, 1].map((sz) => taperedLeg(sx * 0.41, sz * 0.245, 0.42, 0.05, 0.036, "#dcc59b", WOOD))),
      b(0, 0.15, 0, 0.8, 0.02, 0.45, "#d3b98c", { ...WOOD, bevel: 0.004 }),
      b(0, 0.39, 0.245, 0.76, 0.05, 0.03, "#d3b98c", { ...WOOD, bevel: 0.004 }),
      b(0, 0.39, -0.245, 0.76, 0.05, 0.03, "#d3b98c", { ...WOOD, bevel: 0.004 }),
      // printer: black frame, red-ended bed rail, gantry uprights + crossbar, spool
      b(0.18, 0.485, -0.02, 0.44, 0.07, 0.44, BLACK, { ...PLASTIC, bevel: 0.012 }),
      b(0.18, 0.5, 0.2, 0.44, 0.04, 0.02, "#c0392b", { ...PLASTIC, bevel: 0.006 }),
      b(0.18, 0.525, -0.02, 0.28, 0.008, 0.28, "#8c9096", { ...STEEL, bevel: 0.002 }),
      b(0.0, 0.73, -0.12, 0.04, 0.47, 0.04, BLACK, { ...BLACK_METAL, bevel: 0.006 }),
      b(0.36, 0.73, -0.12, 0.04, 0.47, 0.04, BLACK, { ...BLACK_METAL, bevel: 0.006 }),
      b(0.18, 0.97, -0.12, 0.4, 0.04, 0.04, BLACK, { ...BLACK_METAL, bevel: 0.006 }),
      b(0.18, 0.74, -0.06, 0.1, 0.07, 0.06, "#ececec", { ...PLASTIC, bevel: 0.01 }),
      b(0.18, 0.69, -0.03, 0.03, 0.06, 0.03, "#b8bcc2", { ...STEEL, bevel: 0.004 }),
      cy(0.18, 0.745, -0.021, 0.045, 0.02, BLACK, { ...PLASTIC, r: [Math.PI / 2, 0, 0] }),
      b(0.18, 0.745, -0.009, 0.04, 0.008, 0.004, "#8c9096", { ...PLASTIC, bevel: 0, spin: { axis: "z", rpm: 600 } }), // part-cooling fan blade
      cy(0.18, 0.96, -0.22, 0.12, 0.04, "#ececec", { ...PLASTIC, r: [Math.PI / 2, 0, 0] }),
      b(0.33, 0.488, 0.211, 0.08, 0.04, 0.004, "#1c3a5a", { ...GLOSS, bevel: 0.002, detail: 1 }), // LCD
      knob(0.25, 0.49, 0.21, 0.025, "#8c9096"),
      cy(0.18, 0.96, -0.22, 0.03, 0.05, "#2a2c30", { ...PLASTIC, detail: 1, r: [Math.PI / 2, 0, 0] }), // spool hub
      b(0.18, 0.88, -0.1, 0.01, 0.17, 0.01, "#2a2c30", { ...RUBBER, detail: 2, r: [0.4, 0, 0] }), // filament tube
      cy(0.0, 0.5, -0.12, 0.008, 0.2, "#c4c8ce", { ...CHROME, detail: 1 }), // z lead screw
      cy(0.36, 0.5, -0.12, 0.008, 0.2, "#c4c8ce", { ...CHROME, detail: 1 }),
    ],
  },
  of_curtain_grey_sheer: {
    wall: true, label: "Grey blackout curtain with sheer", brand: "Generic", cat: "Decor", w: 2.2, d: 0.12, h: 2.4,
    parts: [
      b(0.3, 1.17, -0.04, 1.6, 2.25, 0.012, "#f1f1f2", { tex: "fabric", rough: 0.9, layer: "sheer" }),
      ...pleats(-1.08, -0.5, "#55606c", "#626d79", "blackout", true),
      ...pleats(0.5, 1.08, "#cfd2d6", "#e4e6e8", "sheer"),
      ...rod(2.2, [-1.0, -0.8, -0.6, -0.4, -0.2, 0, 0.2, 0.4, 0.6, 0.8, 1.0]),
    ],
  },
  of_curtain_dark: {
    wall: true, label: "Dark heavy curtains", brand: "Generic", cat: "Decor", w: 2.4, d: 0.12, h: 2.4,
    parts: [
      b(0, 1.17, -0.04, 1.2, 2.25, 0.012, "#ece9e6", { tex: "fabric", rough: 0.9, layer: "sheer" }),
      ...pleats(-1.18, -0.55, "#2e2523", "#3a2f2c", "blackout", true),
      ...pleats(0.55, 1.18, "#2e2523", "#3a2f2c", "blackout", true),
      ...rod(2.4, [-1.1, -0.9, -0.7, 0.7, 0.9, 1.1]),
    ],
  },
  of_ceiling_round: {
    label: "Large round LED ceiling panel", brand: "Generic", cat: "Lighting & devices", w: 0.6, d: 0.6, h: 2.6,
    light: { y: 2.5, color: "#f4f7ff" },
    parts: [
      turned(0, 2.56, 0, [[0.28, 0], [0.3, 0.008], [0.3, 0.03], [0.27, 0.04]], "#f2f2f0", { ...MATT, rough: 0.5 }),
      cy(0, 2.55, 0, 0.54, 0.02, "#fbfbf9", PLASTIC),
      cy(0, 2.538, 0, 0.46, 0.014, "#f4f7ff", { glow: true }),
      cy(0, 2.54, 0, 0.52, 0.006, "#e4e6ea", { ...PLASTIC, detail: 1 }), // diffuser rim
      cy(0, 2.5305, 0, 0.05, 0.006, "#d8dadd", { ...PLASTIC, detail: 2 }), // centre hub
    ],
  },
  of_art_panorama: {
    wall: true, label: "Panorama forest painting", brand: "Generic", cat: "Decor", w: 1.1, d: 0.04, h: 1.75,
    parts: [
      b(0, 1.5, -0.005, 1.1, 0.45, 0.03, "#2a2a2a", { ...WOOD, bevel: 0.008 }),
      b(0, 1.52, 0.012, 1.06, 0.41, 0.006, "#b9bdbf", { tex: "fabric", rough: 0.85, bevel: 0 }),
      b(0, 1.36, 0.016, 1.06, 0.12, 0.006, "#222d2b", { tex: "fabric", rough: 0.85, bevel: 0 }),
      ...Array.from({ length: 22 }, (_, i) => {
        const h = 0.08 + ((i * 7) % 5) * 0.025;
        return b(-0.5 + i * 0.048, 1.37 + h / 2 - 0.02, 0.018, 0.04, h, 0.006, i % 2 ? "#1b2625" : "#26332f", { tex: "fabric", rough: 0.85, bevel: 0 });
      }),
      cy(0.3, 1.62, 0.0165, 0.08, 0.003, "#f1efe6", { rough: 0.8, detail: 1, r: [Math.PI / 2, 0, 0] }), // moon
      b(0, 1.5, 0.0215, 1.06, 0.41, 0.003, "#e8f0f2", { ...GLOSS, bevel: 0, detail: 1 }), // glass
      b(0, 1.714, 0.016, 1.1, 0.012, 0.012, "#2a2a2a", { ...WOOD, bevel: 0.003, detail: 1 }), // frame lip
      b(0, 1.286, 0.016, 1.1, 0.012, 0.012, "#2a2a2a", { ...WOOD, bevel: 0.003, detail: 1 }),
      b(-0.544, 1.5, 0.016, 0.012, 0.45, 0.012, "#2a2a2a", { ...WOOD, bevel: 0.003, detail: 1 }),
      b(0.544, 1.5, 0.016, 0.012, 0.45, 0.012, "#2a2a2a", { ...WOOD, bevel: 0.003, detail: 1 }),
    ],
  },
  of_wall_plant: wallTrailing(),
  of_desk_lamp_small: {
    label: "Black gooseneck desk lamp", brand: "Generic", cat: "Lighting & devices", w: 0.12, d: 0.16, h: 0.35,
    light: { y: 0.3, color: "#ffd9a0" },
    parts: [
      turned(0, 0, 0.01, [[0.05, 0], [0.05, 0.008], [0.032, 0.02]], BLACK, BLACK_METAL),
      cy(0, 0.11, 0.01, 0.015, 0.2, BLACK, BLACK_METAL),
      cy(0, 0.24, 0.0, 0.015, 0.1, BLACK, { ...BLACK_METAL, r: [0.5, 0, 0] }),
      cy(0, 0.3, -0.03, 0.065, 0.06, BLACK, { ...BLACK_METAL, rough: 0.35, r: [-0.6, 0, 0] }),
      cy(0, 0.272, -0.008, 0.045, 0.012, "#ffe2a8", { glow: true, r: [-0.6, 0, 0] }),
      sp(0, 0.21, 0.01, 0.026, BLACK, { ...BLACK_METAL, detail: 1 }), // joint
      sp(0, 0.285, -0.015, 0.024, BLACK, { ...BLACK_METAL, detail: 1 }),
      sp(0.03, 0.02, 0.01, 0.016, "#8e9196", { ...STEEL, detail: 2 }), // switch
    ],
  },
  of_sofa_bed_grey: {
    label: "Grey 2-seat sofa bed", brand: "Generic", cat: "Living", w: 1.9, d: 0.9, h: 0.85,
    parts: [
      b(0, 0.11, 0, 1.9, 0.14, 0.9, "#3a3d42", { ...WOOD, bevel: 0.012 }),
      cushion(-0.405, 0.27, 0.05, 0.81, 0.2, 0.8, "#6b7077", { bevel: 0.05, m: true }),
      cushion(0.405, 0.27, 0.05, 0.81, 0.2, 0.8, "#6b7077", { bevel: 0.05, m: true }),
      cushion(0, 0.55, -0.35, 1.9, 0.5, 0.2, "#6b7077", { bevel: 0.06, m: true }),
      cushion(-0.88, 0.4, 0.05, 0.14, 0.4, 0.8, "#6b7077", { bevel: 0.05, m: true }),
      cushion(0.88, 0.4, 0.05, 0.14, 0.4, 0.8, "#6b7077", { bevel: 0.05, m: true }),
      pillow(-0.55, 0.62, -0.18, 0.5, 0.4, 0.14, "#4d5258", { bevel: 0.06, r: [-0.25, 0, 0] }),
      pillow(0.5, 0.62, -0.18, 0.5, 0.4, 0.14, "#555a60", { bevel: 0.06, r: [-0.25, 0, 0.0] }),
      b(0.2, 0.39, 0.15, 0.9, 0.03, 0.55, "#9aa0a6", { ...FAB, bevel: 0.012 }),
      b(0.2, 0.3, 0.43, 0.9, 0.2, 0.03, "#9aa0a6", { ...FAB, bevel: 0.012 }),
      seam(0, 0.375, 0.45, 0.004, 0.012, 0.8, "#4a4d52"), // gap between seat cushions
      seam(0, 0.7, -0.249, 0.004, 0.4, 0.004, "#4a4d52"), // back-rest panel line
      seam(0, 0.17, 0.452, 1.9, 0.004, 0.004, "#2a2c30"), // piping under the seat
      ...[-1, 1].flatMap((sx) => [-1, 1].map((sz) => turned(sx * 0.85, 0, sz * 0.4, [[0.02, 0], [0.025, 0.04]], "#2a2c30", { ...WOOD, detail: 1 }))), // feet
    ],
  },
  of_wardrobe_oak: {
    label: "Oak-look two-door wardrobe", brand: "IKEA", cat: "Bedroom", w: 1.0, d: 0.58, h: 2.3,
    parts: [
      b(0, 1.15, -0.03, 1.0, 2.3, 0.52, "#c9a672", { ...WOOD, bevel: 0.008, m: true }),
      ...[-1, 1].flatMap((s) => {
        const x = s * 0.25;
        return [
          b(x, 1.15, 0.244, 0.46, 2.22, 0.012, "#c9a672", { ...WOOD, bevel: 0.004, m: true }),
          // framed panels: darker inset panels between horizontal rails
          b(x, 0.38, 0.2565, 0.38, 0.66, 0.008, "#b98f5a", { ...WOOD, bevel: 0.002 }),
          b(x, 1.12, 0.2565, 0.38, 0.66, 0.008, "#b98f5a", { ...WOOD, bevel: 0.002 }),
          b(x, 1.86, 0.2565, 0.38, 0.66, 0.008, "#b98f5a", { ...WOOD, bevel: 0.002 }),
          b(s * 0.04, 1.1, 0.27, 0.025, 0.04, 0.02, BLACK, { ...PLASTIC, bevel: 0.004 }),
          handleBar(s * 0.07, 1.1, 0.263, 0.3, "y", "#2a2c30"), // long pull
        ];
      }),
      b(0, 0.02, 0.28, 0.98, 0.04, 0.01, "#a47a47", { ...WOOD, bevel: 0.003 }),
      b(0, 2.285, -0.005, 1.0, 0.03, 0.57, "#c9a672", { ...WOOD, bevel: 0.006, detail: 1 }), // crown moulding
      seam(0, 1.15, 0.2575, 0.004, 2.22, 0.004, "#7a5a32"), // door gap
      b(0, 0.045, 0.285, 0.96, 0.01, 0.01, "#8a6a3a", { ...WOOD, bevel: 0.002, detail: 1 }), // plinth shadow rail
    ],
  },
  of_kallax_white_2x4: {
    label: "KALLAX shelf 2x4 white", brand: "IKEA", cat: "Living", w: 0.77, d: 0.39, h: 1.47,
    parts: [
      b(0, 0.735, -0.18, 0.77, 1.47, 0.02, SEAM, { ...MATT, bevel: 0.002 }),
      b(-0.375, 0.735, 0, 0.02, 1.47, 0.39, WHITE, { ...MATT, bevel: 0.004 }),
      b(0.375, 0.735, 0, 0.02, 1.47, 0.39, WHITE, { ...MATT, bevel: 0.004 }),
      b(0, 0.735, 0, 0.02, 1.47, 0.39, WHITE, { ...MATT, bevel: 0.004 }),
      ...[0.015, 0.37, 0.735, 1.1, 1.455].map((y) => b(0, y, 0, 0.77, 0.03, 0.39, WHITE, { ...MATT, bevel: 0.005 })),
      ...bookCols(-0.19, 0.385, 0.2),
      ...bookCols(0.19, 0.75, 0.2),
      ...bookCols(-0.19, 1.115, 0.2),
      b(0.19, 0.18, 0.0, 0.3, 0.28, 0.3, "#8a8f86", { ...FAB, bevel: 0.025 }), // storage bins in the bottom cells
      b(-0.19, 0.18, 0.0, 0.3, 0.28, 0.3, "#b79a6b", { ...FAB, bevel: 0.025 }),
      turned(0.19, 1.115 + 0.0, 0, vaseProfile(0.06, 0.24), "#cfd3d6", CERAMIC),
      b(0.19, 0.19, 0.151, 0.1, 0.008, 0.003, "#e8e8e4", { bevel: 0, detail: 2 }), // bin handles
      b(-0.19, 0.19, 0.151, 0.1, 0.008, 0.003, "#e8e8e4", { bevel: 0, detail: 2 }),
      b(0, 0.735, 0.196, 0.75, 0.004, 0.004, "#d0cfcb", { bevel: 0, detail: 1 }), // dividing line on the front
    ],
  },
  of_chest_white_3: {
    label: "White EKET-style cabinet with 2 drawers over 2 doors", brand: "IKEA", cat: "Bedroom", w: 0.7, d: 0.35, h: 0.95,
    parts: [
      // lower unit: two doors, slightly narrower
      b(0, 0.31, -0.005, 0.66, 0.62, 0.33, SEAM, { ...MATT, bevel: 0.004 }),
      ...drawerFront(-0.164, 0.31, 0.158, 0.33, 0.6, WHITE, { ...LACQUER, thick: 0.012, handle: "knob" }),
      ...drawerFront(0.164, 0.31, 0.158, 0.33, 0.6, WHITE, { ...LACQUER, thick: 0.012, handle: "knob" }),
      // upper unit: drawer block, full width
      b(0, 0.785, -0.005, 0.7, 0.33, 0.34, SEAM, { ...MATT, bevel: 0.005 }),
      ...drawerFront(0, 0.865, 0.163, 0.66, 0.15, WHITE, { ...LACQUER, thick: 0.012, handle: "bar-x" }),
      ...drawerFront(0, 0.71, 0.163, 0.66, 0.15, WHITE, { ...LACQUER, thick: 0.012, handle: "bar-x" }),
      seam(0, 0.625, 0.163, 0.66, 0.006, 0.004, "#c4c3bf"),
    ],
  },
  of_table_low_black: {
    label: "Low black stool table", brand: "Generic", cat: "Decor", w: 0.5, d: 0.34, h: 0.42,
    parts: [
      b(0, 0.405, 0, 0.5, 0.03, 0.34, "#1d1e21", { ...WOOD, bevel: 0.006, m: true }),
      b(0, 0.375, 0, 0.44, 0.03, 0.28, "#17181a", { ...WOOD, bevel: 0.004 }),
      ...[-1, 1].flatMap((sx) => [-1, 1].map((sz) => taperedLeg(sx * 0.21, sz * 0.13, 0.39, 0.036, 0.026, "#1d1e21", WOOD))),
      b(0, 0.15, 0, 0.4, 0.015, 0.24, "#17181a", { ...WOOD, bevel: 0.003, detail: 1 }), // low shelf
      ...[-1, 1].map((s) => b(0, 0.36, s * 0.13, 0.4, 0.04, 0.012, "#17181a", { ...WOOD, bevel: 0.003, detail: 1 })), // aprons
    ],
  },
  of_radiator_white: {
    label: "White panel radiator", brand: "Generic", cat: "Lighting & devices", w: 0.9, d: 0.1, h: 0.6,
    parts: [
      b(0, 0.3, 0, 0.9, 0.56, 0.04, "#f2f2f0", { ...MATT, rough: 0.35, bevel: 0.008 }),
      ...Array.from({ length: 12 }, (_, i) => b(-0.41 + i * 0.075, 0.3, 0.035, 0.03, 0.54, 0.03, "#ebebe8", { ...MATT, rough: 0.35, bevel: 0.01 })),
      b(0, 0.58, 0, 0.9, 0.03, 0.09, "#f2f2f0", { ...MATT, rough: 0.35, bevel: 0.008 }),
      ...[-0.2, 0, 0.2].map((x) => b(x, 0.597, 0.01, 0.12, 0.004, 0.06, "#d8d8d5", { bevel: 0, detail: 1 })), // top grille slots
      cy(0.4, 0.03, 0.0, 0.03, 0.06, "#c8ccd1", { ...CHROME, detail: 1 }), // valve
      cy(0.43, 0.05, 0.0, 0.03, 0.03, "#f2f2f0", { ...PLASTIC, detail: 2, r: [0, 0, Math.PI / 2] }), // thermostat knob
      cy(-0.4, 0.03, 0.0, 0.025, 0.06, "#c8ccd1", { ...CHROME, detail: 1 }), // bleed
    ],
  },
  of_lamp_arm_white: {
    label: "White clamp arm desk lamp", brand: "Generic", cat: "Lighting & devices", w: 0.5, d: 0.2, h: 0.55,
    light: { y: 0.5, color: "#fff1d6" },
    parts: [
      b(-0.2, 0.04, 0, 0.08, 0.04, 0.08, "#e8e8e6", { ...PLASTIC, bevel: 0.012 }),
      b(-0.2, 0.2, 0, 0.02, 0.36, 0.02, "#f0f0ee", { ...PLASTIC, bevel: 0.006 }),
      b(-0.1, 0.38, 0, 0.22, 0.02, 0.02, "#f0f0ee", { ...PLASTIC, bevel: 0.006, r: [0, 0, 0.5] }),
      b(0.05, 0.47, 0, 0.26, 0.02, 0.02, "#f0f0ee", { ...PLASTIC, bevel: 0.006, r: [0, 0, -0.3] }),
      b(0.2, 0.45, 0, 0.1, 0.05, 0.14, "#f0f0ee", { ...PLASTIC, bevel: 0.02 }),
      b(0.2, 0.42, 0, 0.08, 0.012, 0.12, "#fff1d6", { glow: true }),
      sp(-0.2, 0.375, 0, 0.035, "#e8e8e6", { ...PLASTIC, detail: 1 }), // joints
      sp(-0.01, 0.47, 0, 0.03, "#e8e8e6", { ...PLASTIC, detail: 1 }),
      cy(-0.2, 0.02, 0.05, 0.015, 0.04, "#8e9196", { ...STEEL, detail: 2 }), // clamp screw
    ],
  },
};
