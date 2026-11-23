import type { Def, Part } from "./catalog";
import { BLACK, DARK, FLOOR_T, GREY, STEEL, WHITE, WOOD, raise, rod as kRod, wheelRing } from "./partKit.ts";
import { b as pb, cy as pcy, sp as psp, drawerFront, turned, WOOD as WOODM, STEEL as METAL, RUBBER, PLASTIC, BLACK_METAL, type Opt } from "./partsKit.ts";

// Garage & EV: chargers, small vehicles (cars live in lib/catalog.cars.ts) and garage furniture.
// Every charger / vehicle takes an HA `entity`: its glow parts light up when the linked entity is on or charging.
// Charge-port convention for cars: car front = +z, charge port on the rear wing (left = +x). A wall box is mounted with its back
// to the wall and its cable coil on the right; the loose "Charging cable" piece runs along z, plug end at -z, car end at +z.
const RED = "#b8332b";
const BLUE = "#2f5f9f";
const GLASS = "#2b3a46";
const TYRE = "#18191b";

// Colour -> material class (explicit options win), so vehicles and chargers get textures without repeating them per part.
const CLASS: Record<string, Opt> = {
  [TYRE]: RUBBER,
  [STEEL]: METAL, [GREY]: METAL, "#9aa0a6": METAL, "#b8bcc2": METAL, "#6e7378": METAL, "#55585e": METAL, "#5d6269": METAL,
  [WOOD]: WOODM, "#6b5a45": WOODM, "#c9a26b": WOODM,
};
const auto = (c: string, o?: Opt): Opt => ({ ...(CLASS[c] ?? PLASTIC), ...o });
const b = (x: number, y: number, z: number, sx: number, sy: number, sz: number, c: string, o?: Opt): Part => pb(x, y, z, sx, sy, sz, c, auto(c, o));
const cy = (x: number, y: number, z: number, dia: number, h: number, c: string, o?: Opt) => pcy(x, y, z, dia, h, c, auto(c, o));
const sp = (x: number, y: number, z: number, dia: number, c: string, o?: Opt) => psp(x, y, z, dia, c, auto(c, o));
const cx = (x: number, y: number, z: number, dia: number, len: number, c: string, o?: Opt) => b(x, y, z, dia, len, dia, c, { ...o, shape: "cyl", r: [0, 0, Math.PI / 2] });
const cz = (x: number, y: number, z: number, dia: number, len: number, c: string, o?: Opt) => b(x, y, z, dia, len, dia, c, { ...o, shape: "cyl", r: [Math.PI / 2, 0, 0] });
const rod = (a: [number, number, number], e: [number, number, number], th: number, c: string, o?: Opt): Part => ({ ...kRod(a, e, th, c), ...auto(c, o) });
/** vertical post + corner legs: n legs inset on a w x d rectangle */
const legs = (w: number, d: number, h: number, c: string, t = 0.05) => [-1, 1].flatMap((sx) => [-1, 1].map((sz) => b(sx * (w / 2 - t / 2), h / 2, sz * (d / 2 - t / 2), t, h, t, c, BLACK_METAL)));
const wheel = (x: number, y: number, z: number, dia: number, len: number): Part[] => [
  cx(x, y, z, dia, len, TYRE),
  cx(x, y, z, dia * 0.62, len + 0.006, STEEL),
  cx(x, y, z, dia * 0.18, len + 0.012, "#6e7378"),
];
/** loops of cable (a coil) seen face-on: ring of segments about the z axis, n loops stacked along z */
const coil = (x: number, y: number, z: number, dia: number, loops: number): Part[] => {
  const R = dia / 2, seg = 10, L = 2 * R * Math.tan(Math.PI / seg) * 1.08;
  return Array.from({ length: loops }, (_, k) =>
    Array.from({ length: seg }, (_, i) => {
      const a = (i / seg) * Math.PI * 2;
      return b(x + R * Math.cos(a), y + R * Math.sin(a), z + (k - (loops - 1) / 2) * 0.026, L, 0.024, 0.024, BLACK, { r: [0, 0, a + Math.PI / 2] });
    }),
  ).flat();
};
/** charge plug (type 2 handle) pointing down */
const plug = (x: number, y: number, z: number): Part[] => [
  b(x, y, z, 0.06, 0.14, 0.055, "#2a2c30"),
  b(x, y - 0.09, z, 0.05, 0.04, 0.045, "#55585e"),
];

const CHARGERS: Record<string, Def> = {
  ev_wallbox: {
    label: "EV wall charger", brand: "Generic", cat: "Garage & EV", w: 0.52, d: 0.14, h: 1.5, wall: true,
    parts: [
      b(-0.1, 1.25, 0, 0.26, 0.38, 0.12, WHITE, { m: true }),
      b(-0.1, 1.25, 0.062, 0.2, 0.32, 0.006, "#23262a"),
      cz(-0.1, 1.3, 0.066, 0.11, 0.006, "#5ad7ff", { glow: true }), // status ring: lights while charging
      cz(-0.1, 1.3, 0.07, 0.085, 0.008, "#23262a"),
      b(-0.1, 1.16, 0.066, 0.1, 0.03, 0.004, "#3a3d42"),
      b(0.15, 1.2, -0.03, 0.04, 0.3, 0.06, DARK), // coil bracket on the wall
      ...coil(0.15, 1.24, 0.005, 0.22, 3),
      ...plug(0.18, 0.98, 0.03),
    ],
  },
  ev_charger_pedestal: {
    label: "EV charging pedestal", brand: "Generic", cat: "Garage & EV", w: 0.5, d: 0.26, h: 1.5,
    parts: [
      b(0, 0.03, 0, 0.5, 0.06, 0.26, "#6e7378"),
      b(-0.07, 0.75, 0, 0.26, 1.4, 0.2, WHITE, { m: true }),
      b(-0.07, 1.1, 0.102, 0.2, 0.34, 0.006, "#23262a"),
      cz(-0.07, 1.2, 0.108, 0.11, 0.006, "#5ad7ff", { glow: true }),
      cz(-0.07, 1.2, 0.112, 0.085, 0.008, "#23262a"),
      b(-0.07, 1.46, 0, 0.26, 0.04, 0.2, "#3a3d42"),
      b(0.17, 0.95, 0, 0.06, 0.34, 0.12, DARK),
      ...coil(0.17, 0.97, 0.06, 0.22, 3),
      ...plug(0.2, 0.6, 0.06),
    ],
  },
  ev_charger_portable: {
    label: "Portable EV charger", brand: "Generic", cat: "Garage & EV", w: 1.0, d: 0.3, h: 0.08,
    parts: [
      b(0, 0.04, 0, 0.2, 0.08, 0.12, "#2a2c30"),
      b(0, 0.082, 0, 0.12, 0.004, 0.06, "#5ad7ff", { glow: true }), // charging light
      cx(-0.28, 0.015, 0.02, 0.03, 0.4, BLACK),
      cx(0.28, 0.015, -0.02, 0.03, 0.4, BLACK),
      b(-0.5 + 0.06, 0.03, 0.02, 0.11, 0.05, 0.07, "#2a2c30"),
      b(0.5 - 0.06, 0.03, -0.02, 0.11, 0.05, 0.07, "#2a2c30"),
      b(-0.5 + 0.04, 0.03, 0.02, 0.05, 0.05, 0.06, "#e8e6e1"), // household plug
    ],
  },
};

// charging cable lying on the floor: from the charger (-z) to the car (+z), with a gentle S so it reads as a cable
const cable = (len: number): Def => {
  const n = Math.max(6, Math.round(len * 3)), amp = 0.12;
  const pt = (i: number): [number, number, number] => [amp * Math.sin((i / n) * Math.PI * 2), 0.017, -len / 2 + 0.07 + ((len - 0.14) * i) / n];
  return {
    label: `EV charging cable ${len} m`, brand: "Generic", cat: "Garage & EV", w: amp * 2 + 0.12, d: len, h: 0.04,
    parts: [
      ...Array.from({ length: n }, (_, i) => rod(pt(i), pt(i + 1), 0.032, BLACK)),
      b(pt(0)[0], 0.026, -len / 2 + 0.04, 0.06, 0.05, 0.08, "#2a2c30"),
      b(pt(n)[0], 0.026, len / 2 - 0.05, 0.06, 0.05, 0.1, "#2a2c30"),
      b(pt(n)[0], 0.052, len / 2 - 0.05, 0.03, 0.004, 0.05, "#5ad7ff", { glow: true }),
    ],
  };
};

const VEHICLES: Record<string, Def> = {
  gar_motorbike: {
    label: "Motorbike", brand: "Generic", cat: "Garage & EV", w: 0.8, d: 2.1, h: 1.2,
    parts: [
      ...wheel(0, 0.33, -0.72, 0.66, 0.16),
      ...wheel(0, 0.32, 0.72, 0.64, 0.12),
      b(0, 0.42, 0, 0.3, 0.34, 0.42, "#2b2d31"),
      b(0, 0.58, 0.1, 0.26, 0.14, 0.24, "#3a3d42"),
      rod([0, 0.9, 0.42], [0, 0.45, -0.4], 0.05, "#2b2d31"),
      rod([0.11, 0.42, -0.1], [0.11, 0.33, -0.72], 0.04, DARK),
      rod([-0.11, 0.42, -0.1], [-0.11, 0.33, -0.72], 0.04, DARK),
      b(0, 0.92, 0.2, 0.3, 0.22, 0.55, RED, { m: true }), // tank
      b(0, 0.83, -0.35, 0.28, 0.09, 0.65, "#222326"), // seat
      b(0, 0.9, -0.8, 0.2, 0.12, 0.3, RED, { m: true }),
      b(0, 0.9, -0.97, 0.14, 0.05, 0.03, "#c0392b"),
      cz(0.17, 0.3, -0.45, 0.08, 0.9, STEEL),
      cz(0.17, 0.3, -0.85, 0.11, 0.3, GREY),
      rod([0.09, 1.0, 0.52], [0.09, 0.33, 0.72], 0.04, STEEL),
      rod([-0.09, 1.0, 0.52], [-0.09, 0.33, 0.72], 0.04, STEEL),
      b(0, 0.6, 0.74, 0.14, 0.03, 0.5, RED, { m: true }),
      b(0, 1.05, 0.5, 0.78, 0.03, 0.03, DARK),
      cx(0.34, 1.05, 0.5, 0.035, 0.1, BLACK),
      cx(-0.34, 1.05, 0.5, 0.035, 0.1, BLACK),
      rod([0.3, 1.06, 0.5], [0.37, 1.2, 0.45], 0.015, DARK),
      rod([-0.3, 1.06, 0.5], [-0.37, 1.2, 0.45], 0.015, DARK),
      sp(0, 0.96, 0.62, 0.2, "#fff6d8"),
      b(0.2, 0.33, 0.0, 0.05, 0.03, 0.14, DARK),
      b(-0.2, 0.33, 0.0, 0.05, 0.03, 0.14, DARK),
    ],
  },
  gar_scooter: {
    label: "Scooter", brand: "Generic", cat: "Garage & EV", w: 0.7, d: 1.8, h: 1.15,
    parts: [
      ...wheel(0, 0.21, -0.65, 0.42, 0.1),
      ...wheel(0, 0.21, 0.72, 0.42, 0.1),
      b(0, 0.24, 0.12, 0.4, 0.05, 0.6, DARK),
      b(0, 0.55, 0.47, 0.42, 0.7, 0.06, "#d9d6cd", { m: true, r: [-0.22, 0, 0] }), // leg shield
      b(0, 0.5, -0.42, 0.38, 0.42, 0.78, "#d9d6cd", { m: true }),
      b(0, 0.77, -0.4, 0.34, 0.09, 0.7, "#222326"),
      b(0, 0.5, -0.82, 0.3, 0.06, 0.12, "#d9d6cd", { m: true }),
      b(0, 0.56, -0.83, 0.12, 0.05, 0.03, "#c0392b"),
      rod([0.1, 0.95, 0.52], [0.1, 0.21, 0.72], 0.04, STEEL),
      rod([-0.1, 0.95, 0.52], [-0.1, 0.21, 0.72], 0.04, STEEL),
      b(0, 1.0, 0.5, 0.62, 0.12, 0.18, "#d9d6cd", { m: true }),
      b(0, 1.07, 0.5, 0.64, 0.03, 0.03, DARK),
      sp(0, 0.98, 0.6, 0.16, "#fff6d8"),
      rod([0.28, 1.08, 0.5], [0.33, 1.15, 0.46], 0.015, DARK),
      rod([-0.28, 1.08, 0.5], [-0.33, 1.15, 0.46], 0.015, DARK),
      b(0, 0.4, 0.72, 0.14, 0.03, 0.4, "#d9d6cd", { m: true }),
    ],
  },
};

const bikeFrame = (c: string, fat: boolean): Part[] => {
  const BB: [number, number, number] = [0, 0.3, -0.05], ST: [number, number, number] = [0, 0.82, -0.2], HT: [number, number, number] = [0, 0.76, 0.4];
  const HB: [number, number, number] = [0, 0.66, 0.43], RA: [number, number, number] = [0, 0.35, -0.55], FA: [number, number, number] = [0, 0.35, 0.55];
  const th = fat ? 0.04 : 0.03;
  const off = (p: [number, number, number], x: number): [number, number, number] => [x, p[1], p[2]];
  return [
    ...wheelRing(0, 0.35, -0.55, fat ? 0.72 : 0.7, fat ? 0.06 : 0.035, TYRE),
    ...wheelRing(0, 0.35, 0.55, fat ? 0.72 : 0.7, fat ? 0.06 : 0.035, TYRE),
    rod(BB, ST, th, c, { m: true }),
    rod(ST, HT, th, c, { m: true }),
    rod(BB, HB, th + 0.01, c, { m: true }),
    rod(HT, HB, th + 0.01, c, { m: true }),
    rod(off(BB, 0.04), off(RA, 0.05), 0.022, c, { m: true }),
    rod(off(BB, -0.04), off(RA, -0.05), 0.022, c, { m: true }),
    rod(off(ST, 0.03), off(RA, 0.05), 0.02, c, { m: true }),
    rod(off(ST, -0.03), off(RA, -0.05), 0.02, c, { m: true }),
    rod(off(HB, 0.04), off(FA, 0.05), 0.025, STEEL),
    rod(off(HB, -0.04), off(FA, -0.05), 0.025, STEEL),
    rod(ST, [0, 0.88, -0.22], 0.025, STEEL),
    b(0, 0.9, -0.22, 0.12, 0.045, 0.26, "#222326"),
    rod(HT, [0, 0.84, 0.38], 0.025, STEEL),
    b(0, 0.85, 0.37, 0.5, 0.025, 0.025, DARK),
    cx(0.27, 0.85, 0.37, 0.03, 0.08, BLACK),
    cx(-0.27, 0.85, 0.37, 0.03, 0.08, BLACK),
    cx(0.07, 0.3, -0.05, 0.18, 0.012, STEEL),
    b(0.1, 0.3, 0.05, 0.09, 0.02, 0.06, DARK),
    b(-0.1, 0.3, -0.15, 0.09, 0.02, 0.06, DARK),
  ];
};

Object.assign(VEHICLES, {
  gar_bicycle: { label: "Bicycle", brand: "Generic", cat: "Garage & EV", w: 0.6, d: 1.8, h: 1.05, parts: bikeFrame("#3a6ea5", false) },
  gar_ebike: {
    label: "Electric bike", brand: "Generic", cat: "Garage & EV", w: 0.62, d: 1.8, h: 1.05,
    parts: [
      ...bikeFrame("#2f3338", true),
      b(0, 0.55, 0.14, 0.09, 0.1, 0.32, "#25272b"),
      b(0.0, 0.55, 0.14, 0.098, 0.014, 0.2, "#5be37d", { glow: true }), // battery charge light
      cx(0, 0.36, -0.55, 0.17, 0.12, "#2b2d31"),
      b(0, 0.8, -0.65, 0.16, 0.025, 0.32, DARK),
      b(0, 0.89, 0.3, 0.07, 0.03, 0.05, "#111214"),
    ],
  },
  gar_trailer: {
    label: "Box trailer", brand: "Generic", cat: "Garage & EV", w: 1.7, d: 3.0, h: 0.8,
    parts: [
      ...wheel(0.76, 0.28, -0.2, 0.56, 0.14),
      ...wheel(-0.76, 0.28, -0.2, 0.56, 0.14),
      cx(0, 0.28, -0.2, 0.05, 1.5, DARK),
      b(0.6, 0.38, -0.3, 0.05, 0.06, 2.4, DARK),
      b(-0.6, 0.38, -0.3, 0.05, 0.06, 2.4, DARK),
      b(0, 0.43, -0.3, 1.5, 0.04, 2.4, "#6b5a45"),
      b(0.74, 0.6, -0.3, 0.03, 0.36, 2.4, "#9aa0a6", { m: true }),
      b(-0.74, 0.6, -0.3, 0.03, 0.36, 2.4, "#9aa0a6", { m: true }),
      b(0, 0.6, 0.89, 1.5, 0.36, 0.03, "#9aa0a6", { m: true }),
      b(0, 0.6, -1.49, 1.5, 0.36, 0.03, "#9aa0a6", { m: true }),
      b(0.76, 0.62, -0.7, 0.06, 0.05, 1.0, DARK),
      b(-0.76, 0.62, -0.7, 0.06, 0.05, 1.0, DARK),
      rod([0.6, 0.38, 0.9], [0.03, 0.4, 1.42], 0.05, DARK),
      rod([-0.6, 0.38, 0.9], [-0.03, 0.4, 1.42], 0.05, DARK),
      b(0, 0.4, 1.46, 0.1, 0.1, 0.12, STEEL),
      b(0.7, 0.55, -1.505, 0.08, 0.06, 0.02, "#c0392b"),
      b(-0.7, 0.55, -1.505, 0.08, 0.06, 0.02, "#c0392b"),
    ],
  },
  gar_camper: {
    label: "Caravan", brand: "Generic", cat: "Garage & EV", w: 2.2, d: 6.0, h: 2.6,
    parts: [
      ...wheel(1.0, 0.33, -0.4, 0.66, 0.18),
      ...wheel(-1.0, 0.33, -0.4, 0.66, 0.18),
      b(0, 1.4, -0.5, 2.1, 2.0, 5.0, WHITE, { m: true }),
      b(0, 2.47, -0.5, 1.9, 0.12, 4.9, "#e9e8e4"),
      b(0, 0.36, -0.5, 1.9, 0.12, 5.0, DARK),
      b(1.054, 1.1, -0.5, 0.012, 0.16, 5.0, BLUE),
      b(-1.054, 1.1, -0.5, 0.012, 0.16, 5.0, BLUE),
      b(1.054, 1.65, -1.6, 0.012, 0.6, 1.0, GLASS),
      b(1.054, 1.65, -0.2, 0.012, 0.6, 0.8, GLASS),
      b(-1.054, 1.65, -1.6, 0.012, 0.6, 1.0, GLASS),
      b(-1.054, 1.65, -0.2, 0.012, 0.6, 0.8, GLASS),
      b(1.054, 1.25, 1.05, 0.012, 1.7, 0.6, "#dfe0dc"),
      b(1.06, 1.65, 1.05, 0.012, 0.35, 0.34, GLASS),
      b(1.06, 1.2, 1.28, 0.02, 0.05, 0.05, DARK),
      b(0, 1.65, 2.004, 1.0, 0.55, 0.01, GLASS),
      b(0, 0.95, 2.004, 1.2, 0.5, 0.01, "#d9d6cd", { m: true }),
      b(0, 2.56, -1.0, 0.5, 0.06, 0.5, "#cfd2d6"),
      b(0.9, 0.7, -3.005, 0.1, 0.26, 0.02, "#c0392b"),
      b(-0.9, 0.7, -3.005, 0.1, 0.26, 0.02, "#c0392b"),
      ...[1, -1].flatMap((sx) => [-2.8, 1.7].map((z) => cy(sx * 0.92, 0.2, z, 0.06, 0.4, "#55585e"))),
      rod([0.55, 0.5, 2.0], [0.05, 0.5, 2.95], 0.06, DARK),
      rod([-0.55, 0.5, 2.0], [-0.05, 0.5, 2.95], 0.06, DARK),
      b(0, 0.5, 2.96, 0.12, 0.1, 0.12, STEEL),
      cy(0, 0.7, 2.45, 0.3, 0.5, "#2f8f4a"),
      cy(0, 0.2, 2.5, 0.12, 0.4, "#55585e"),
    ],
  },
});

const rack = (w: number, d: number, h: number, shelves: number[], post: string, shelf: string): Part[] => [
  ...legs(w, d, h, post, 0.04),
  ...shelves.map((y) => b(0, y, 0, w - 0.02, 0.03, d - 0.02, shelf, { m: true, bevel: 0.004 })),
  ...shelves.map((y) => b(0, y + 0.025, d / 2 - 0.012, w - 0.02, 0.04, 0.006, shelf, { detail: 1, bevel: 0.002 })), // front lip
  rod([-w / 2 + 0.02, 0.15, -d / 2 + 0.02], [w / 2 - 0.02, h - 0.15, -d / 2 + 0.02], 0.012, post, { detail: 1, ...BLACK_METAL }), // back cross brace
  rod([w / 2 - 0.02, 0.15, -d / 2 + 0.02], [-w / 2 + 0.02, h - 0.15, -d / 2 + 0.02], 0.012, post, { detail: 1, ...BLACK_METAL }),
];
const crate = (x: number, y: number, z: number, w: number, d: number, h: number, c: string): Part[] => [
  b(x, y + h / 2, z, w, h, d, c, { bevel: 0.012 }),
  b(x, y + h + 0.015, z, w + 0.01, 0.03, d + 0.01, "#2a2c30", { bevel: 0.008 }),
  b(x, y + h * 0.55, z + d / 2 + 0.002, w * 0.3, 0.05, 0.004, "#e8e6e1", { detail: 2, bevel: 0 }), // label
];
const paint = (x: number, y: number, z: number, c: string) => [
  turned(x, y, z, [[0.07, 0], [0.075, 0.01], [0.075, 0.17], [0.07, 0.18]], "#c4c8ce", METAL),
  cy(x, y + 0.185, z, 0.14, 0.01, c),
];

const FURNITURE: Record<string, Def> = {
  gar_workbench: {
    label: "Workbench with vice", brand: "Generic", cat: "Garage & EV", w: 1.8, d: 0.65, h: 1.08,
    parts: [
      ...legs(1.76, 0.6, 0.87, DARK, 0.06),
      b(0, 0.9, 0, 1.8, 0.06, 0.65, WOOD, { m: true, bevel: 0.01 }),
      b(0, 0.25, 0, 1.7, 0.03, 0.55, "#6b5a45", { bevel: 0.006 }),
      b(0.5, 0.74, 0, 0.7, 0.2, 0.56, "#4a5058", { tex: "metal", metal: 0.85, rough: 0.5 }),
      b(0.5, 0.74, 0.285, 0.22, 0.02, 0.01, STEEL),
      b(-0.75, 0.97, 0.2, 0.15, 0.1, 0.2, BLUE),
      b(-0.75, 1.01, 0.31, 0.15, 0.12, 0.04, BLUE),
      b(-0.75, 1.0, 0.33, 0.24, 0.02, 0.02, "#444"),
      b(0.1, 0.97, -0.15, 0.4, 0.08, 0.2, RED, { bevel: 0.01 }),
      b(0.1, 1.03, -0.15, 0.18, 0.03, 0.04, "#2a2c30"),
      b(-0.2, 0.955, 0.1, 0.22, 0.02, 0.02, WOOD),
      b(-0.31, 0.98, 0.1, 0.06, 0.04, 0.03, STEEL),
      ...[0.8, 0.69].flatMap((y) => drawerFront(0.5, y, 0.28, 0.68, 0.1, "#5a6068", { detail: 1, handle: "bar-x", tex: "metal", metal: 0.85, rough: 0.5 })), // drawer fronts
      b(0, 0.55, -0.27, 1.7, 0.05, 0.02, DARK, { detail: 1, ...BLACK_METAL }), // back stretcher
      cy(-0.75, 0.95, 0.12, 0.06, 0.012, STEEL, { detail: 2 }),
    ],
  },
  gar_tool_wall: {
    label: "Tool wall panel", brand: "Generic", cat: "Garage & EV", w: 1.2, d: 0.1, h: 1.95, wall: true,
    parts: [
      b(0, 1.45, -0.04, 1.2, 0.9, 0.02, "#d9d6cd", { m: true, bevel: 0.004 }),
      b(-0.45, 1.5, -0.02, 0.02, 0.3, 0.014, WOOD), b(-0.45, 1.67, -0.02, 0.09, 0.04, 0.03, STEEL),
      b(-0.25, 1.52, -0.02, 0.07, 0.4, 0.01, STEEL), b(-0.25, 1.75, -0.02, 0.03, 0.1, 0.02, RED),
      rod([-0.08, 1.2, -0.02], [-0.08, 1.55, -0.02], 0.02, STEEL), b(-0.08, 1.6, -0.02, 0.05, 0.06, 0.02, STEEL),
      rod([0.02, 1.2, -0.02], [0.02, 1.52, -0.02], 0.02, STEEL), b(0.02, 1.6, -0.02, 0.06, 0.06, 0.02, STEEL),
      b(0.16, 1.3, -0.02, 0.02, 0.2, 0.02, "#e6b800"), b(0.16, 1.17, -0.02, 0.008, 0.08, 0.008, STEEL),
      b(0.28, 1.3, -0.02, 0.02, 0.2, 0.02, RED), b(0.28, 1.17, -0.02, 0.008, 0.08, 0.008, STEEL),
      b(0.4, 1.55, -0.01, 0.14, 0.2, 0.06, RED, { bevel: 0.01 }),
      b(0.4, 1.45, 0.0, 0.05, 0.14, 0.04, "#2a2c30"),
      b(-0.2, 1.1, 0.0, 0.5, 0.03, 0.06, DARK),
      b(0.3, 1.1, 0.0, 0.5, 0.03, 0.06, DARK),
      ...[-0.5, 0.5].flatMap((x) => [1.15, 1.75].map((y) => cy(x, y, -0.028, 0.02, 0.006, STEEL, { detail: 2, r: [Math.PI / 2, 0, 0] }))), // panel screws
    ],
  },
  gar_shelf_rack: {
    label: "Metal shelving rack", brand: "Generic", cat: "Garage & EV", w: 1.2, d: 0.5, h: 1.8,
    parts: [
      ...rack(1.2, 0.5, 1.8, [0.1, 0.55, 1.0, 1.45, 1.78], BLUE, "#8d9299"),
      ...crate(-0.3, 0.115, 0.0, 0.4, 0.3, 0.25, "#3a6ea5"),
      ...crate(0.25, 0.115, 0.0, 0.4, 0.3, 0.25, "#d9a02c"),
      ...paint(-0.4, 0.565, 0.0, RED), ...paint(-0.2, 0.565, 0.0, "#2f8f4a"), ...paint(0.0, 0.565, 0.0, "#e6e1d3"),
      ...crate(0.3, 0.565, 0.0, 0.4, 0.3, 0.3, "#8a6a45"),
      ...crate(-0.25, 1.015, 0.0, 0.5, 0.3, 0.3, "#3a6ea5"),
      ...crate(0.3, 1.015, 0.0, 0.4, 0.3, 0.25, "#55585e"),
      ...crate(0.0, 1.465, 0.0, 0.9, 0.3, 0.22, "#6b5a45"),
    ],
  },
  gar_tyre_rack: {
    label: "Tyre rack, 4 tyres", brand: "Generic", cat: "Garage & EV", w: 1.5, d: 0.4, h: 1.55,
    parts: [
      ...[-1, 1].flatMap((sx) => [b(sx * 0.73, 0.775, 0, 0.04, 1.55, 0.36, BLUE, BLACK_METAL), b(sx * 0.73, 0.04, 0, 0.04, 0.08, 0.4, BLUE, BLACK_METAL)]),
      b(0, 0.04, 0, 1.46, 0.04, 0.36, BLUE, BLACK_METAL),
      b(0, 0.76, 0, 1.46, 0.04, 0.36, BLUE, BLACK_METAL),
      ...[0.04 + 0.34, 0.76 + 0.34].flatMap((y) =>
        [-0.35, 0.35].flatMap((x) => [
          turned(x, y - 0.11, 0, [[0.24, 0], [0.3, 0.02], [0.32, 0.05], [0.32, 0.17], [0.3, 0.2], [0.24, 0.22]], TYRE, { ...RUBBER, r: [Math.PI / 2, 0, 0] }),
          cz(x, y, 0.001, 0.4, 0.224, STEEL), cz(x, y, 0.002, 0.14, 0.228, DARK, { detail: 1 }),
        ]),
      ),
    ],
  },
  gar_cabinet: {
    label: "Garage cabinet", brand: "Generic", cat: "Garage & EV", w: 0.8, d: 0.45, h: 1.8,
    parts: [
      b(0, 0.9, 0, 0.8, 1.8, 0.45, "#6e7378", { m: true, bevel: 0.008 }),
      b(-0.2, 0.9, 0.228, 0.38, 1.7, 0.006, "#5d6269", { bevel: 0.003 }),
      b(0.2, 0.9, 0.228, 0.38, 1.7, 0.006, "#5d6269", { bevel: 0.003 }),
      b(-0.04, 0.95, 0.24, 0.02, 0.4, 0.02, STEEL, { bevel: 0.006 }),
      b(0.04, 0.95, 0.24, 0.02, 0.4, 0.02, STEEL, { bevel: 0.006 }),
      ...[0, 1, 2, 3].map((i) => b(0, 1.7 - i * 0.025, 0.226, 0.7, 0.01, 0.006, "#3a3d42")),
      b(0, 0.04, 0.2, 0.76, 0.08, 0.04, "#3a3d42"),
      cy(-0.04, 1.2, 0.235, 0.03, 0.01, "#2a2c30", { detail: 2, r: [Math.PI / 2, 0, 0] }), // lock
      ...[-1, 1].flatMap((sx) => [0.3, 1.5].map((y) => b(sx * 0.395, y, 0.226, 0.012, 0.08, 0.012, STEEL, { detail: 2 }))), // hinges
    ],
  },
  gar_tool_chest: {
    label: "Rolling tool chest", brand: "Generic", cat: "Garage & EV", w: 0.7, d: 0.46, h: 1.0,
    parts: [
      b(0, 0.55, 0, 0.7, 0.8, 0.44, RED, { m: true, bevel: 0.012 }),
      b(0, 0.96, 0, 0.72, 0.04, 0.46, "#2a2c30", { bevel: 0.008 }),
      ...[0, 1, 2, 3, 4, 5].flatMap((i) => [b(0, 0.2 + i * 0.12, 0.222, 0.64, 0.005, 0.006, "#2a2c30"), b(0, 0.25 + i * 0.12, 0.236, 0.34, 0.02, 0.02, STEEL, { bevel: 0.007 })]),
      ...[-1, 1].flatMap((sx) => [-1, 1].map((sz) => cy(sx * 0.3, 0.075, sz * 0.18, 0.1, 0.15, "#2a2c30", RUBBER))),
      b(-0.36, 0.7, 0, 0.03, 0.3, 0.3, "#2a2c30", { bevel: 0.01 }),
      b(0, 0.99, 0, 0.5, 0.01, 0.3, "#3a3d42", { detail: 1, ...RUBBER }), // rubber top mat
      cy(0.3, 0.55, 0.222, 0.02, 0.006, "#d9d6cd", { detail: 2, r: [Math.PI / 2, 0, 0] }), // lock
    ],
  },
  gar_ceiling_rack: {
    label: "Overhead storage rack", brand: "Generic", cat: "Garage & EV", w: 1.2, d: 1.8, h: 2.55,
    parts: [
      ...[-1, 1].flatMap((sx) => [-1, 1].map((sz) => b(sx * 0.58, 2.3, sz * 0.85, 0.04, 0.5, 0.04, DARK, BLACK_METAL))),
      b(0, 2.02, 0, 1.2, 0.04, 1.8, "#55585e", { m: true, bevel: 0.004 }),
      ...[-0.6, 0, 0.6].map((z) => b(0, 1.995, z, 1.18, 0.03, 0.05, DARK, BLACK_METAL)),
      ...crate(-0.25, 2.04, -0.5, 0.55, 0.45, 0.3, "#3a6ea5"),
      ...crate(0.25, 2.04, -0.5, 0.55, 0.45, 0.3, "#3a6ea5"),
      ...crate(0, 2.04, 0.3, 0.8, 0.5, 0.25, "#d9a02c"),
      b(0.2, 2.2, 0.72, 0.6, 0.2, 0.18, "#8a6a45", { bevel: 0.006 }),
    ],
  },
  gar_compressor: {
    label: "Air compressor", brand: "Generic", cat: "Garage & EV", w: 0.75, d: 0.38, h: 0.62,
    parts: [
      cx(0, 0.3, 0, 0.3, 0.62, RED, { m: true, tex: "paint", rough: 0.35 }),
      b(0, 0.5, 0, 0.5, 0.14, 0.2, "#2a2c30", { bevel: 0.02 }),
      cy(-0.12, 0.6, 0.04, 0.06, 0.04, STEEL),
      cy(0.28, 0.5, 0.17, 0.08, 0.02, WHITE),
      rod([-0.35, 0.58, 0.0], [-0.35, 0.3, 0.0], 0.03, STEEL),
      b(0.0, 0.57, -0.02, 0.5, 0.02, 0.02, STEEL),
      cx(-0.33, 0.07, 0.15, 0.14, 0.05, "#2a2c30", RUBBER), cx(-0.33, 0.07, -0.15, 0.14, 0.05, "#2a2c30", RUBBER),
      b(0.3, 0.04, 0, 0.06, 0.08, 0.34, "#2a2c30"),
      ...[-1, 1].map((sx) => b(sx * 0.265, 0.3, 0, 0.09, 0.3, 0.3, RED, { detail: 1, shape: "sph", tex: "paint", rough: 0.35 })), // domed tank ends
      cy(0.2, 0.595, 0.1, 0.06, 0.012, STEEL, { detail: 2 }), // gauge
    ],
  },
  gar_ladder: {
    label: "Folding step ladder", brand: "Generic", cat: "Garage & EV", w: 0.5, d: 0.95, h: 1.45,
    parts: [
      ...[1, -1].flatMap((sx) => [rod([sx * 0.22, 0.0, 0.45], [sx * 0.2, 1.4, 0.0], 0.04, "#d9a02c", { m: true, tex: "metal", metal: 0.6, rough: 0.4 }), rod([sx * 0.22, 0.0, -0.45], [sx * 0.2, 1.4, -0.03], 0.035, "#8d9299")]),
      ...[0, 1, 2, 3, 4].map((i) => {
        const t = (i + 1) / 6;
        return b(0, 1.4 * t, 0.45 * (1 - t) - 0.01, 0.4, 0.025, 0.12, STEEL, { bevel: 0.008 });
      }),
      b(0, 1.42, -0.02, 0.46, 0.03, 0.25, "#d9a02c", { m: true, bevel: 0.01 }),
      b(0, 0.7, -0.25, 0.4, 0.02, 0.02, "#8d9299", { r: [0.2, 0, 0] }),
      ...[1, -1].map((sx) => b(sx * 0.22, 0.02, 0.45, 0.05, 0.04, 0.06, BLACK, { detail: 2, ...RUBBER })), // rubber feet
    ],
  },
  gar_bike_hooks: {
    label: "Bike wall hooks", brand: "Generic", cat: "Garage & EV", w: 1.0, d: 0.2, h: 2.0, wall: true,
    parts: [
      b(0, 1.75, -0.09, 1.0, 0.1, 0.02, WOOD, { m: true, bevel: 0.004 }),
      ...[-0.3, 0.3].flatMap((x) => [rod([x, 1.75, -0.08], [x, 1.75, 0.08], 0.03, STEEL), rod([x, 1.75, 0.08], [x, 1.9, 0.08], 0.03, STEEL), b(x, 1.915, 0.08, 0.04, 0.03, 0.04, "#2a2c30")]),
      sp(-0.3, 1.99, 0.08, 0.04, "#2a2c30"),
    ],
  },
};

export const GARAGE: Record<string, Def> = {
  ...CHARGERS,
  ev_charger_portable: raise(CHARGERS.ev_charger_portable, FLOOR_T), // thin pieces sit on the floor slab, not in it
  gar_charging_cable_3m: raise(cable(3), FLOOR_T), gar_charging_cable_5m: raise(cable(5), FLOOR_T), gar_charging_cable_7m: raise(cable(7), FLOOR_T),
  ...VEHICLES, ...FURNITURE,
};
