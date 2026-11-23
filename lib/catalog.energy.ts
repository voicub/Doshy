import type { Def, Part } from "./catalog";
import { withMaterials } from "./partsKit.ts";
import { DARK, FLOOR_T, GREY, LGREY, STEEL, TRUNK, WHITE, b, bounds, cx, cy, cz, rod, sp } from "./partKit.ts";

// Energy: solar panels, inverters, batteries, meters, grid connection, distribution board, generators and a small wind turbine.
// Kind ids keep the words solar / inverter / battery / meter / grid / board / generator so the live power lines (lib/liveLayer) find them.
const FRAME = "#c4c8ce";
const CELL = "#1d2a4a";
const BUS = "#5a6d96";
const GREEN = "#5be37d";

/**
 * Battery level LEDs: the LAST five parts of every battery def, lowest bar first (20 % ... 100 %).
 * A live state of charge lights bar i when soc > i * 20; the indices are exported below as BATTERY_BARS[kind].
 */
const bars = (n: number, make: (i: number) => Part): Part[] => Array.from({ length: n }, (_, i) => make(i));

/** solar panels lying (deg = 0) or tilted facing +z (the low edge at the front): cols x rows panels, pw x pl each, low edge `lift` above the floor */
const panels = (cols: number, rows: number, pw: number, pl: number, deg: number, lift: number, gap = 0.02): Part[] => {
  const t = (deg * Math.PI) / 180, S = rows * pl + (rows - 1) * gap;
  const yc = lift + (S / 2) * Math.sin(t) + 0.015 * Math.cos(t);
  const at = (x: number, s: number, n: number): [number, number, number] => [x, yc - s * Math.sin(t) + n * Math.cos(t), s * Math.cos(t) + n * Math.sin(t)];
  const r: [number, number, number] | undefined = deg ? [t, 0, 0] : undefined;
  return Array.from({ length: cols * rows }, (_, k) => {
    const x = ((k % cols) - (cols - 1) / 2) * (pw + gap), s = (Math.floor(k / cols) - (rows - 1) / 2) * (pl + gap);
    const part = (n: number, w: number, h: number, l: number, c: string, dx = 0): Part => {
      const p = at(x + dx, s, n);
      return { p, s: [w, h, l], c, ...(r && { r }) };
    };
    return [part(0, pw, 0.03, pl, FRAME), part(0.017, pw - 0.04, 0.008, pl - 0.04, CELL), ...[-pw / 4, 0, pw / 4].map((dx) => part(0.0215, 0.004, 0.002, pl - 0.05, BUS, dx))];
  }).flat();
};
/** low and high end of the slope-aligned rails under a tilted array, at x */
const rails = (xs: number[], rows: number, pl: number, deg: number, lift: number, th = 0.04): Part[] => {
  const t = (deg * Math.PI) / 180, S = rows * pl + (rows - 1) * 0.02;
  return xs.map((x) => rod([x, lift - 0.03, (S / 2) * Math.cos(t)], [x, lift + S * Math.sin(t) - 0.03, -(S / 2) * Math.cos(t)], th, "#8d9299"));
};
/** dims straight from the parts: footprint centred on the origin, h = highest point */
const fit = (label: string, parts: Part[], extra: Partial<Def> = {}): Def => {
  const o = bounds(parts);
  const r2 = (v: number) => Math.ceil(v * 100 - 1e-6) / 100;
  return { label, brand: "Generic", cat: "Energy", w: r2(2 * Math.max(-o.x0, o.x1)), d: r2(2 * Math.max(-o.z0, o.z1)), h: r2(o.y1), parts, ...extra };
};

const carport = (cols: number, label: string): Def => {
  const deg = 6, rows = 3, S = rows * 1.7 + 0.04, lift = 2.3, t = (deg * Math.PI) / 180;
  const W = cols * 1.02, zF = (S / 2) * Math.cos(t) - 0.1, rise = S * Math.sin(t);
  const xs = cols > 3 ? [-W / 2 + 0.1, 0, W / 2 - 0.1] : [-W / 2 + 0.1, W / 2 - 0.1];
  return fit(label, [
    ...panels(cols, rows, 1.0, 1.7, deg, lift),
    ...rails(xs, rows, 1.7, deg, lift - 0.05, 0.1),
    ...xs.flatMap((x) => [b(x, (lift - 0.1) / 2, zF, 0.12, lift - 0.1, 0.12, DARK), b(x, (lift + rise - 0.1) / 2, -zF, 0.12, lift + rise - 0.1, 0.12, DARK)]),
  ]);
};
const rooftop = (cols: number, rows: number, label: string): Def => {
  const half = ((cols - 1) * 1.02) / 2 + 0.5;
  return fit(label, [...panels(cols, rows, 1.0, 1.7, 30, 0.06), ...rails(cols > 1 ? [-half + 0.2, 0, half - 0.2] : [-0.3, 0.3], rows, 1.7, 30, 0.04)]);
};

const SOLAR: Record<string, Def> = {
  solar_panel_portrait: fit("Solar panel 1.0 x 1.7 m, portrait", panels(1, 1, 1.0, 1.7, 0, FLOOR_T)),
  solar_panel_landscape: fit("Solar panel 1.7 x 1.0 m, landscape", panels(1, 1, 1.7, 1.0, 0, FLOOR_T)),
  solar_array_3x2: fit("Solar array 3 x 2 panels (6 panels)", panels(3, 2, 1.0, 1.7, 0, FLOOR_T)),
  solar_array_6x2: fit("Solar array 6 x 2 panels (12 panels)", panels(6, 2, 1.0, 1.7, 0, FLOOR_T)),
  solar_roof_30: rooftop(1, 1, "Roof solar panel, 30 degree roof"),
  solar_roof_30_3x2: rooftop(3, 2, "Roof solar array 3 x 2, 30 degree roof"),
  solar_ground_mount: (() => {
    const t = Math.PI / 6, S = 1.7, lift = 0.5, zF = (S / 2) * Math.cos(t) - 0.05, top = lift + S * Math.sin(t);
    return fit("Ground solar frame, 4 panels", [
      ...panels(4, 1, 1.0, 1.7, 30, lift),
      ...rails([-1.5, 0, 1.5], 1, 1.7, 30, lift, 0.05),
      ...[-1.5, 0, 1.5].flatMap((x) => [b(x, lift / 2, zF, 0.06, lift, 0.06, STEEL), b(x, top / 2, -zF, 0.06, top, 0.06, STEEL)]),
      b(0, 0.03, zF, 3.3, 0.05, 0.06, STEEL),
      b(0, 0.03, -zF, 3.3, 0.05, 0.06, STEEL),
    ]);
  })(),
  solar_carport: carport(3, "Solar carport, 1 car"),
  solar_carport_double: carport(6, "Solar carport, 2 cars"),
  solar_balcony_panel: (() => {
    const lift = 0.35, deg = 72;
    const pan = panels(1, 1, 1.7, 1.0, deg, lift);
    const c = pan[0].p;
    return fit("Balcony plug-in solar panel", [
      ...pan,
      b(0, c[1] - 0.02, c[2] - 0.08, 0.2, 0.14, 0.05, "#e8e6e1"), // micro inverter behind the panel
      rod([0, c[1] - 0.1, c[2] - 0.08], [0, 0.1, c[2] - 0.12], 0.02, "#1c1d20"),
      rod([-0.7, c[1] + 0.3, c[2] - 0.04], [-0.7, c[1] + 0.3, c[2] - 0.2], 0.03, "#8d9299"),
      rod([0.7, c[1] + 0.3, c[2] - 0.04], [0.7, c[1] + 0.3, c[2] - 0.2], 0.03, "#8d9299"),
    ], { wall: true });
  })(),
};

const INVERTERS: Record<string, Def> = {
  energy_inverter_wall: {
    label: "Solar inverter, wall mounted", brand: "Generic", cat: "Energy", w: 0.5, d: 0.22, h: 1.75, wall: true,
    parts: [
      b(0, 1.5, -0.025, 0.5, 0.4, 0.16, WHITE, { m: true }),
      b(0, 1.5, 0.057, 0.46, 0.36, 0.004, "#d8d8d4"),
      b(-0.1, 1.58, 0.061, 0.16, 0.08, 0.004, "#111214"),
      b(0.12, 1.58, 0.062, 0.03, 0.03, 0.004, GREEN, { glow: true }), // status light
      b(0.15, 1.4, 0.085, 0.08, 0.06, 0.05, "#d9362b"), // DC isolator
      ...[-0.17, -0.06, 0.06, 0.17].map((x) => cy(x, 1.25, -0.025, 0.035, 0.1, "#1c1d20")),
    ],
  },
  energy_inverter_hybrid: {
    label: "Hybrid inverter with battery ports", brand: "Generic", cat: "Energy", w: 0.55, d: 0.22, h: 1.9, wall: true,
    parts: [
      b(0, 1.45, -0.025, 0.55, 0.72, 0.16, WHITE, { m: true }),
      b(0, 1.45, 0.057, 0.51, 0.68, 0.004, "#d8d8d4"),
      b(0, 1.7, 0.061, 0.26, 0.12, 0.004, "#111214"),
      ...[-0.12, 0, 0.12].map((x, i) => b(x, 1.58, 0.062, 0.03, 0.03, 0.004, i === 2 ? "#ffb84d" : GREEN, { glow: true })),
      b(0.17, 1.35, 0.085, 0.09, 0.07, 0.05, "#d9362b"),
      ...[["#d9362b", -0.2], ["#1c1d20", -0.12], ["#c4c8ce", -0.04], ["#ffb84d", 0.04]].map(([c, x]) => cy(Number(x), 1.05, -0.025, 0.04, 0.1, String(c))),
    ],
  },
};

export const BATTERY_BARS: Record<string, number[]> = {};
const BATTERIES: Record<string, Def> = {
  energy_battery_wall: {
    label: "Wall battery, slim", brand: "Generic", cat: "Energy", w: 0.75, d: 0.16, h: 1.6, wall: true,
    parts: [
      b(0, 0.98, 0, 0.75, 1.15, 0.15, WHITE, { m: true }),
      b(-0.18, 1.35, 0.077, 0.28, 0.05, 0.004, "#c4c8ce"),
      b(0.27, 0.98, 0.077, 0.07, 1.0, 0.004, "#23262a"),
      ...bars(5, (i) => b(0.27, 0.62 + i * 0.19, 0.08, 0.04, 0.12, 0.004, GREEN, { glow: true })),
    ],
  },
  energy_battery_tower: {
    label: "Battery tower, floor standing", brand: "Generic", cat: "Energy", w: 0.55, d: 0.45, h: 1.75,
    parts: [
      b(0, 0.03, 0, 0.55, 0.06, 0.45, "#2b2f36"),
      ...[0, 1, 2, 3, 4].flatMap((i) => [b(0, 0.22 + i * 0.3, 0, 0.55, 0.28, 0.45, i % 2 ? "#3a3d42" : "#343840", { m: true }), b(-0.08, 0.22 + i * 0.3, 0.226, 0.3, 0.2, 0.004, "#8d9299")]),
      b(0, 1.72, 0, 0.55, 0.04, 0.45, "#2b2f36"),
      ...bars(5, (i) => b(0.18, 0.22 + i * 0.3, 0.228, 0.1, 0.03, 0.004, GREEN, { glow: true })),
    ],
  },
};
for (const [k, d] of Object.entries(BATTERIES)) BATTERY_BARS[k] = d.parts.flatMap((p, i) => (p.glow ? [i] : []));

const GRID: Record<string, Def> = {
  grid_meter_smart: {
    label: "Smart meter", brand: "Generic", cat: "Energy", w: 0.17, d: 0.08, h: 1.55, wall: true,
    parts: [
      b(0, 1.4, 0, 0.17, 0.22, 0.07, WHITE, { m: true }),
      b(0, 1.4, 0.036, 0.13, 0.18, 0.004, "#1c1d20"),
      b(0, 1.44, 0.039, 0.1, 0.04, 0.004, "#a8f0c0", { glow: true }),
      b(0, 1.36, 0.039, 0.06, 0.02, 0.004, "#5ad7ff"),
    ],
  },
  grid_meter_box: {
    label: "Outdoor meter box", brand: "Generic", cat: "Energy", w: 0.5, d: 0.3, h: 1.5,
    parts: [
      ...[-0.2, 0.2].map((x) => b(x, 0.1, 0, 0.06, 0.2, 0.2, "#6e7378")),
      b(0, 0.75, 0, 0.5, 1.1, 0.28, "#9aa0a6", { m: true }),
      b(0, 1.32, 0, 0.54, 0.05, 0.3, "#7a7f85"),
      b(0, 0.85, 0.144, 0.01, 0.9, 0.006, "#6e7378"),
      b(-0.12, 1.05, 0.145, 0.2, 0.2, 0.004, "#2b3a46"),
      cz(-0.12, 1.05, 0.148, 0.12, 0.004, WHITE),
      b(0.12, 1.05, 0.146, 0.05, 0.05, 0.008, "#d9a02c"),
      b(0.1, 0.8, 0.146, 0.03, 0.08, 0.01, STEEL),
    ],
  },
  grid_pole: {
    label: "Power pole with transformer", brand: "Generic", cat: "Energy", w: 1.6, d: 0.6, h: 7,
    parts: [
      cy(0, 3.4, 0, 0.22, 6.8, TRUNK),
      b(0, 6.55, 0, 1.6, 0.1, 0.1, "#7a5a3c"),
      rod([-0.4, 6.0, 0], [-0.1, 6.5, 0], 0.05, "#7a5a3c"),
      rod([0.4, 6.0, 0], [0.1, 6.5, 0], 0.05, "#7a5a3c"),
      ...[-0.65, 0, 0.65].map((x) => cy(x, 6.72, 0, 0.1, 0.14, "#8fb3c4")),
      cy(0.42, 5.4, 0, 0.5, 0.8, GREY),
      cy(0.42, 5.84, 0, 0.54, 0.06, DARK),
      cy(0.42, 5.9, 0, 0.1, 0.1, "#8fb3c4"),
      b(0, 4.6, 0.13, 0.2, 0.3, 0.05, "#c4c8ce"),
    ],
  },
};

const board = (rows: number, per: number): Part[] => {
  const w = per * 0.028 + 0.1;
  return [
    b(0, 1.4, 0, w, rows * 0.15 + 0.16, 0.1, WHITE, { m: true }),
    ...Array.from({ length: rows }, (_, r) => [
      b(0, 1.4 + ((rows - 1) / 2 - r) * 0.15, 0.052, w - 0.06, 0.012, 0.012, "#8d9299"),
      ...Array.from({ length: per }, (_, i) => {
        const x = (i - (per - 1) / 2) * 0.028, y = 1.4 + ((rows - 1) / 2 - r) * 0.15;
        return [b(x, y, 0.056, 0.025, 0.09, 0.03, i < 2 ? "#d9362b" : "#e4e4e0"), b(x, y + 0.02, 0.074, 0.01, 0.02, 0.012, "#222")];
      }).flat(),
    ]).flat(),
  ];
};
GRID.house_board = fit("Fuse box (distribution board)", board(2, 10), { wall: true });
GRID.house_main_switch = {
  label: "Main switch with EV-ready load control", brand: "Generic", cat: "Energy", w: 0.3, d: 0.2, h: 1.65, wall: true,
  parts: [
    b(0, 1.45, 0, 0.3, 0.38, 0.1, "#8d9299", { m: true }),
    b(0, 1.45, 0.052, 0.26, 0.34, 0.004, "#7a7f85"),
    cy(0, 1.5, 0.09, 0.1, 0.06, "#e6b800", { r: [Math.PI / 2, 0, 0] }),
    b(0, 1.5, 0.125, 0.09, 0.02, 0.02, "#d9362b"),
    b(0, 1.34, 0.056, 0.16, 0.05, 0.004, "#e8e6e1"),
    b(0.1, 1.34, 0.059, 0.03, 0.03, 0.004, GREEN, { glow: true }),
  ],
};

const GENERATORS: Record<string, Def> = {
  energy_generator_portable: {
    label: "Portable generator", brand: "Generic", cat: "Energy", w: 0.7, d: 0.55, h: 0.6,
    parts: [
      ...[-0.3, 0.3].flatMap((x) => [0.22, -0.22].map((z) => rod([x, 0.05, z], [x, 0.55, z], 0.03, "#2a2c30"))),
      rod([-0.3, 0.55, 0.22], [0.3, 0.55, 0.22], 0.03, "#2a2c30"),
      rod([-0.3, 0.55, -0.22], [0.3, 0.55, -0.22], 0.03, "#2a2c30"),
      b(0, 0.18, 0, 0.5, 0.18, 0.36, "#2b2d31"),
      b(-0.08, 0.4, 0, 0.34, 0.2, 0.38, "#d9362b", { m: true }),
      b(0.17, 0.32, 0, 0.18, 0.28, 0.38, "#3a3d42"),
      b(0, 0.14, 0.2, 0.46, 0.22, 0.04, "#2a2c30"),
      b(0.1, 0.2, 0.225, 0.2, 0.1, 0.006, "#d8d8d4"),
      b(-0.1, 0.22, 0.225, 0.04, 0.04, 0.006, GREEN, { glow: true }), // running light
      cx(-0.31, 0.06, -0.15, 0.12, 0.04, "#2a2c30"),
      cx(-0.31, 0.06, 0.15, 0.12, 0.04, "#2a2c30"),
    ],
  },
  energy_generator_standby: {
    label: "Standby generator, home backup", brand: "Generic", cat: "Energy", w: 1.2, d: 0.6, h: 0.95,
    parts: [
      b(0, 0.03, 0, 1.2, 0.06, 0.6, "#8d9299"),
      b(0, 0.43, 0, 1.12, 0.74, 0.54, "#d2c9b2", { m: true }),
      b(0, 0.82, 0, 1.16, 0.04, 0.58, "#b8ae96"),
      ...[0, 1, 2, 3, 4, 5].map((i) => b(-0.3, 0.2 + i * 0.07, 0.272, 0.4, 0.02, 0.006, "#6b665a")),
      b(0.35, 0.5, 0.272, 0.3, 0.3, 0.006, "#c4bda8"),
      b(0.35, 0.56, 0.276, 0.16, 0.08, 0.004, "#111214"),
      b(0.4, 0.43, 0.276, 0.03, 0.03, 0.004, GREEN, { glow: true }),
      cy(0.45, 0.88, -0.1, 0.1, 0.1, "#55585e"),
    ],
  },
};
const WIND: Record<string, Def> = {
  energy_wind_turbine: {
    label: "Small wind turbine", brand: "Generic", cat: "Energy", w: 2.1, d: 1.6, h: 6.7,
    parts: [
      cy(0, 0.1, 0, 0.4, 0.2, "#8d9299"),
      cy(0, 2.8, 0, 0.12, 5.4, LGREY),
      b(0, 5.6, -0.1, 0.18, 0.2, 0.62, WHITE, { m: true }),
      rod([0, 5.62, -0.4], [0, 5.65, -0.7], 0.04, LGREY),
      b(0, 5.72, -0.7, 0.02, 0.32, 0.3, "#d9362b"),
      sp(0, 5.6, 0.27, 0.2, DARK),
      b(0, 5.6, 0.33, 0.14, 2.0, 0.02, WHITE, { spin: { axis: "z", rpm: 90 } }),
      b(0, 5.6, 0.36, 2.0, 0.14, 0.02, WHITE, { spin: { axis: "z", rpm: 90 } }),
    ],
  },
};

export const ENERGY: Record<string, Def> = { ...SOLAR, ...INVERTERS, ...BATTERIES, ...GRID, ...GENERATORS, ...WIND };
withMaterials(ENERGY);
