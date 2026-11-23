import type { Def, Part } from "../catalog";
import { b, cy, sp, cx, cz, rod, WHITE, DARK, GREY, STEEL, OAK, WOOD, STONE } from "../partKit.ts";

// Pet houses, hutches, coops, pens and farm structures (category "Animals"). Same conventions as lib/partKit.ts:
// metres, parts local to the footprint centre, y = part centre height, front = +z. `M` marks recolourable wood.
const M = { m: true as const };
const def = (label: string, w: number, d: number, h: number, parts: Part[], extra: Partial<Pick<Def, "wall" | "light">> = {}): Def => ({ label, brand: "Generic", cat: "Animals", w, d, h, parts, ...extra });

const DOORC = "#1b1511";
const DARKW = "#5a4128";
const TRIM = "#e6dcc6";
const FELT = "#4b4f55";
const SHING = "#7a4b3a";
const HAYC = "#d8b54a";
const HAYD = "#b8932f";
const GALV = "#aab2ba";
const WIREC = "#9aa3ab";
const GLASS = "#8fb6c9";
const WATER = "#6fb2d4";

const shift = (ps: Part[], dx: number, dz: number): Part[] => ps.map((p): Part => ({ ...p, p: [p.p[0] + dx, p.p[1], p.p[2] + dz] }));

/** two roof panels meeting at a ridge along z: span w, depth d, eaves at y0, ridge at y0 + rise */
const gable = (w: number, d: number, y0: number, rise: number, c: string, t = 0.03): Part[] => {
  const hs = (w - 0.06) / 2, a = Math.atan2(rise, hs), L = Math.hypot(hs, rise);
  return [-1, 1].map((s) => b((s * hs) / 2, y0 + rise / 2, 0, L, t, d, c, { r: [0, 0, -s * a] }));
};
/** stepped triangle filling a gable end at depth z (inscribed under the roof of the same w) */
const gend = (w: number, y0: number, rise: number, z: number, c: string, n = 5, t = 0.03, m?: true): Part[] => {
  const hs = (w - 0.06) / 2;
  return Array.from({ length: n }, (_, k) => b(0, y0 + ((k + 0.5) * rise) / n, z, 2 * hs * (1 - (k + 0.85) / n), rise / n, t, c, m && M));
};
/** side wall as z-strips whose tops follow a sloping roof */
const slopedWall = (x: number, t: number, z0: number, z1: number, n: number, base: number, top: (z: number) => number, c: string): Part[] =>
  Array.from({ length: n }, (_, i) => {
    const dz = (z1 - z0) / n, zc = z0 + (i + 0.5) * dz, h = top(zc) - base;
    return b(x, base + h / 2, zc, t, h, dz, c, M);
  });
/** board whose top surface runs from (x0, y0) to (x1, y1), x0 < x1, `wd` wide along z, with cleats */
const ramp = (x0: number, y0: number, x1: number, y1: number, z: number, wd: number, c: string, cleats: number): Part[] => {
  const t = 0.025, a = Math.atan2(y1 - y0, x1 - x0), L = Math.hypot(x1 - x0, y1 - y0), nx = -Math.sin(a), ny = Math.cos(a);
  const board = b((x0 + x1) / 2 - (nx * t) / 2, (y0 + y1) / 2 - (ny * t) / 2, z, L, t, wd, c, { ...M, r: [0, 0, a] });
  const bars = Array.from({ length: cleats }, (_, i) => {
    const f = (i + 1) / (cleats + 1);
    return b(x0 + (x1 - x0) * f + nx * 0.009, y0 + (y1 - y0) * f + ny * 0.009, z, 0.02, 0.018, wd - 0.03, DARKW, { r: [0, 0, a] });
  });
  return [board, ...bars];
};
const span = (lo: number, hi: number, n: number) => Array.from({ length: n }, (_, i) => lo + ((i + 0.5) * (hi - lo)) / n);

// ---- wire / rail pens -------------------------------------------------------------------------------------------
type Run = { h: number; rails: number[]; sp: number; wire: string; rail: string; post: string; pt: number; rt: number; pipe?: true; m?: true };
const post = (x: number, z: number, o: Run): Part => (o.pipe ? cy(x, o.h / 2, z, o.pt, o.h, o.post) : b(x, o.h / 2, z, o.pt, o.h, o.pt, o.post, o.m && M));
/** one fence side along `ax` at fixed coordinate f between lo and hi: rails, vertical wires, intermediate posts */
const side = (ax: "x" | "z", f: number, lo: number, hi: number, o: Run): Part[] => {
  if (hi - lo < 0.2) return [];
  const len = hi - lo, mid = (lo + hi) / 2, n = Math.max(1, Math.round(len / 1.5));
  const bx = (u: number, y: number, su: number, sy: number, sf: number, c: string, m?: true) => (ax === "x" ? b(u, y, f, su, sy, sf, c, m && M) : b(f, y, u, sf, sy, su, c, m && M));
  const rails = o.rails.map((y) => (o.pipe ? (ax === "x" ? cx(mid, y, f, o.rt, len, o.rail) : cz(f, y, mid, o.rt, len, o.rail)) : bx(mid, y, len, o.rt, o.rt, o.rail, o.m)));
  const bars = span(lo, hi, Math.max(1, Math.round(len / o.sp))).map((u) => bx(u, (o.h + 0.02) / 2, 0.012, o.h - 0.06, 0.012, o.wire));
  const posts = Array.from({ length: n - 1 }, (_, i) => (ax === "x" ? post(lo + ((i + 1) * len) / n, f, o) : post(f, lo + ((i + 1) * len) / n, o)));
  return [...rails, ...bars, ...posts];
};
/** gate leaf centred on x, gw wide, in the plane z */
const gate = (x: number, gw: number, z: number, o: Run): Part[] => {
  const t = 0.03, y0 = 0.08, gh = o.h - 0.15, yc = y0 + gh / 2, c = o.rail, m = o.m;
  return [
    b(x - gw / 2 + t / 2, yc, z, t, gh, t, c, m && M), b(x + gw / 2 - t / 2, yc, z, t, gh, t, c, m && M),
    b(x, y0 + t / 2, z, gw, t, t, c, m && M), b(x, y0 + gh - t / 2, z, gw, t, t, c, m && M),
    rod([x - gw / 2 + t, y0 + t, z], [x + gw / 2 - t, y0 + gh - t, z], 0.02, c),
    b(x - gw / 6, yc, z, 0.01, gh - 0.06, 0.01, o.wire), b(x + gw / 6, yc, z, 0.01, gh - 0.06, 0.01, o.wire),
    b(x + gw / 2 - 0.05, yc, z + 0.015, 0.03, 0.07, 0.02, DARK),
    b(x - gw / 2 + 0.01, y0 + gh * 0.2, z + 0.015, 0.03, 0.05, 0.015, DARK), b(x - gw / 2 + 0.01, y0 + gh * 0.8, z + 0.015, 0.03, 0.05, 0.015, DARK),
  ];
};
/** rectangular w x d pen: corner posts, wired sides, optional front gate at x (gate opening gw) */
const pen = (w: number, d: number, o: Run, g?: { x: number; w: number }): Part[] => {
  const ex = w / 2 - o.pt / 2, ez = d / 2 - o.pt / 2;
  const out: Part[] = [-1, 1].flatMap((sx) => [-1, 1].map((sz) => post(sx * ex, sz * ez, o)));
  out.push(...side("x", -ez, -ex, ex, o), ...side("z", -ex, -ez, ez, o), ...side("z", ex, -ez, ez, o));
  if (!g) return [...out, ...side("x", ez, -ex, ex, o)];
  const a = g.x - g.w / 2, c2 = g.x + g.w / 2;
  return [...out, post(a, ez, o), post(c2, ez, o), ...side("x", ez, -ex, a, o), ...side("x", ez, c2, ex, o), ...gate(g.x, g.w - o.pt - 0.02, ez, o)];
};

// ---- dog / cat houses -------------------------------------------------------------------------------------------
type Kennel = { w: number; d: number; h: number; fh: number; rise: number; dw: number; dh: number; wood: string; roof: string; round?: true; lite?: true; lamp?: true };
const kennelParts = (k: Kennel): Part[] => {
  const { w, d, h, fh, rise, dw, dh, wood, roof } = k;
  const tw = 0.025, bw = w - 0.12, bd = d - 0.1, zf = bd / 2, fb = fh + 0.03, y0 = h - 0.035 - rise, wh = y0 - fb, my = fb + wh / 2, hr = dh - dw / 2;
  const door: Part[] = k.round
    ? [cz(0, fb + dw / 2 + 0.04, zf + 0.002, dw + 0.04, 0.004, TRIM), cz(0, fb + dw / 2 + 0.04, zf + 0.006, dw, 0.012, DOORC),
       ...[-1, 1].map((s) => cx(s * (bw / 2 + 0.004), my, 0, 0.07, 0.008, DOORC))]
    : [b(0, fb + hr / 2, zf + 0.002, dw + 0.05, hr, 0.004, TRIM), cz(0, fb + hr, zf + 0.002, dw + 0.05, 0.004, TRIM),
       b(0, fb + hr / 2, zf + 0.006, dw, hr, 0.012, DOORC), cz(0, fb + hr, zf + 0.006, dw, 0.012, DOORC)];
  const detail: Part[] = k.lite
    ? []
    : [...[-1, 1].map((s) => b(s * (bw / 2 - 0.02), my, zf + 0.004, 0.04, wh, 0.01, wood, M)),
       ...[-1, 1].flatMap((s) => [0.33, 0.66].map((f) => b(s * (bw / 2 + 0.004), fb + wh * f, 0, 0.008, 0.012, bd - 0.05, DARKW))),
       b(0, fb + 0.01, zf + 0.02, dw + 0.06, 0.02, 0.04, wood, M)];
  const ly = y0 - 0.04;
  const lamp: Part[] = k.lamp
    ? [b(0, ly + 0.03, zf + 0.012, 0.03, 0.03, 0.024, DARK), b(0, ly + 0.035, zf + 0.025, 0.07, 0.012, 0.06, DARK), sp(0, ly, zf + 0.022, 0.055, "#ffd27a", { glow: true })]
    : [];
  return [
    ...[-1, 1].flatMap((sx) => [-1, 1].map((sz) => b(sx * (bw / 2 - 0.04), fh / 2, sz * (bd / 2 - 0.04), 0.06, fh, 0.06, DARKW))),
    b(0, fh + 0.015, 0, bw + 0.04, 0.03, bd, wood, M),
    b(0, my, -zf + tw / 2, bw, wh, tw, wood, M), b(0, my, zf - tw / 2, bw, wh, tw, wood, M),
    ...[-1, 1].map((s) => b(s * (bw / 2 - tw / 2), my, 0, tw, wh, bd - 2 * tw, wood, M)),
    ...gend(bw + 0.06, y0, rise, zf - 0.0125, wood, k.lite ? 3 : 5, 0.025, true), ...gend(bw + 0.06, y0, rise, -zf + 0.0125, wood, k.lite ? 3 : 5, 0.025, true),
    ...door, ...detail,
    ...gable(w, d, y0, rise, roof, 0.03), b(0, y0 + rise + 0.005, 0, 0.06, 0.04, d, DARKW),
    ...lamp,
  ];
};
const KWOOD = "#c79a63", KROOF = "#6a4436";
const kennelS = def("Dog house, small 0.5 x 0.7 m", 0.5, 0.7, 0.55, kennelParts({ w: 0.5, d: 0.7, h: 0.55, fh: 0.05, rise: 0.13, dw: 0.22, dh: 0.27, wood: KWOOD, roof: KROOF }));
const kennelM = def("Dog house, medium 0.7 x 1.0 m", 0.7, 1.0, 0.8, kennelParts({ w: 0.7, d: 1.0, h: 0.8, fh: 0.07, rise: 0.2, dw: 0.3, dh: 0.4, wood: KWOOD, roof: KROOF }));
const kennelL = def("Dog house, large with heat lamp 0.9 x 1.2 m", 0.9, 1.2, 1.0, kennelParts({ w: 0.9, d: 1.2, h: 1.0, fh: 0.08, rise: 0.25, dw: 0.34, dh: 0.5, wood: KWOOD, roof: KROOF, lamp: true }), { light: { y: 0.675, color: "#ffb25a" } });

const catHouse = def("Cat house, round door 0.45 x 0.4 m", 0.45, 0.4, 0.4,
  kennelParts({ w: 0.45, d: 0.4, h: 0.4, fh: 0.03, rise: 0.1, dw: 0.13, dh: 0.13, wood: "#d8c3a0", roof: "#8a5a45", round: true, lite: true }));

const dogBed = def("Dog bed, round bolster 0.7 m", 0.7, 0.7, 0.18, [
  cy(0, 0.02, 0, 0.7, 0.04, "#8c7a68", M),
  ...Array.from({ length: 18 }, (_, i) => { const a = (i / 18) * Math.PI * 2; return sp(0.275 * Math.cos(a), 0.085, 0.275 * Math.sin(a), 0.15, "#8c7a68", M); }),
  cy(0, 0.075, 0, 0.44, 0.07, "#d9cdb8"),
  b(0.08, 0.113, -0.04, 0.3, 0.012, 0.22, "#c97b5a", { r: [0, 0.3, 0] }),
  cx(-0.05, 0.13, 0.1, 0.025, 0.12, "#f1e7d3"),
  sp(-0.11, 0.13, 0.09, 0.035, "#f1e7d3"), sp(-0.11, 0.13, 0.115, 0.035, "#f1e7d3"), sp(0.01, 0.13, 0.09, 0.035, "#f1e7d3"), sp(0.01, 0.13, 0.115, 0.035, "#f1e7d3"),
]);

const bowls = def("Pet bowls on mat 0.5 x 0.3 m", 0.5, 0.3, 0.1, [
  b(0, 0.01, 0, 0.5, 0.02, 0.3, "#3f5f7a", M),
  ...[-1, 1].map((s) => b(0, 0.021, s * 0.13, 0.48, 0.004, 0.015, "#e8e4da")),
  ...[-1, 1].flatMap((s) => [cy(s * 0.12, 0.055, 0, 0.18, 0.07, STEEL), cy(s * 0.12, 0.085, 0, 0.19, 0.01, "#dde1e5"), b(s * 0.12, 0.055, 0.092, 0.06, 0.02, 0.004, WHITE)]),
  cy(-0.12, 0.062, 0, 0.15, 0.01, "#7a5233"),
  cy(0.12, 0.062, 0, 0.15, 0.01, WATER),
  ...Array.from({ length: 10 }, (_, i) => { const r = 0.012 + (i % 3) * 0.012, a = i * 2.4; return sp(-0.12 + r * Math.cos(a), 0.078 + (i % 3) * 0.004, r * Math.sin(a), 0.024, "#8a5a36"); }),
]);

const catTree = (() => {
  const sis = "#c8a96a", band = "#9b7f48", carpet = "#cfc6b6";
  return def("Cat tree 0.5 x 0.5 x 1.4 m", 0.5, 0.5, 1.4, [
    b(0, 0.02, 0, 0.5, 0.04, 0.5, carpet, M),
    cy(-0.16, 0.66, -0.16, 0.09, 1.24, sis), cy(0.17, 0.39, -0.17, 0.09, 0.7, sis),
    ...[0.2, 0.5, 0.6, 0.9, 0.98, 1.1, 1.2].map((y) => cy(-0.16, y, -0.16, 0.098, 0.012, band)),
    ...[0.15, 0.3, 0.55].map((y) => cy(0.17, y, -0.17, 0.098, 0.012, band)),
    b(0.07, 0.19, 0.07, 0.3, 0.3, 0.3, carpet, M),
    cz(0.07, 0.17, 0.223, 0.16, 0.006, TRIM), cz(0.07, 0.17, 0.228, 0.13, 0.01, DOORC),
    b(0.07, 0.36, 0.07, 0.36, 0.04, 0.36, carpet, M),
    b(0.03, 0.72, -0.05, 0.4, 0.04, 0.4, carpet, M),
    b(-0.08, 1.3, -0.08, 0.34, 0.04, 0.34, carpet, M),
    b(-0.08, 1.36, -0.23, 0.34, 0.08, 0.03, carpet, M), b(-0.08, 1.36, 0.075, 0.34, 0.08, 0.03, carpet, M),
    b(-0.235, 1.36, -0.08, 0.03, 0.08, 0.34, carpet, M), b(0.075, 1.36, -0.08, 0.03, 0.08, 0.34, carpet, M),
    b(-0.08, 1.335, -0.08, 0.28, 0.03, 0.28, "#e5d6c0"),
    cy(0, 1.155, 0, 0.008, 0.25, DARK, { spin: { axis: "z", rpm: 14, swing: 14, pivot: 1.28 } }),
    sp(0, 0.99, 0, 0.08, "#d8704f", { spin: { axis: "z", rpm: 14, swing: 14, pivot: 1.28 } }),
    b(0, 0.93, 0, 0.02, 0.06, 0.005, "#e6c24f", { spin: { axis: "z", rpm: 14, swing: 14, pivot: 1.28 } }),
  ]);
})();

const scratchPost = def("Scratching post 0.4 x 0.8 m", 0.4, 0.4, 0.8, [
  b(0, 0.02, 0, 0.4, 0.04, 0.4, "#cfc6b6", M),
  ...[-1, 1].flatMap((sx) => [-1, 1].map((sz) => sp(sx * 0.17, 0.045, sz * 0.17, 0.045, "#b9ae9b"))),
  cy(0, 0.35, 0, 0.1, 0.62, "#c8a96a"),
  ...Array.from({ length: 12 }, (_, i) => cy(0, 0.08 + i * 0.05, 0, 0.106, 0.012, "#9b7f48")),
  b(0, 0.675, 0, 0.26, 0.03, 0.26, "#cfc6b6", M),
  sp(0, 0.73, 0, 0.08, "#d8453b"),
  cy(0.11, 0.58, 0.11, 0.006, 0.2, DARK, { spin: { axis: "z", rpm: 16, swing: 12, pivot: 0.68 } }),
  sp(0.11, 0.45, 0.11, 0.06, "#e6c24f", { spin: { axis: "z", rpm: 16, swing: 12, pivot: 0.68 } }),
]);

const petDoor = def("Pet door, flap 0.3 x 0.4 m", 0.3, 0.08, 0.5, [
  ...[-1, 1].map((s) => b(s * 0.116, 0.3, 0, 0.012, 0.32, 0.08, "#e9e6df", M)),
  ...[-1, 1].map((s) => b(0, 0.3 + s * 0.166, 0, 0.24, 0.012, 0.08, "#e9e6df", M)),
  ...[-1, 1].flatMap((z) => [
    ...[-1, 1].map((s) => b(s * 0.13, 0.3, z * 0.034, 0.04, 0.4, 0.012, "#e9e6df", M)),
    ...[-1, 1].map((s) => b(0, 0.3 + s * 0.18, z * 0.034, 0.22, 0.04, 0.012, "#e9e6df", M)),
  ]),
  b(0, 0.3, 0, 0.21, 0.31, 0.008, "#6b7885"),
  b(0, 0.455, 0, 0.22, 0.012, 0.02, DARK), b(0, 0.147, 0, 0.21, 0.012, 0.012, DARK),
  ...[-1, 1].flatMap((sx) => [0.15, 0.45].map((y) => sp(sx * 0.13, y, 0.043, 0.014, GREY))),
  b(0, 0.22, 0.006, 0.12, 0.01, 0.004, "#566370"), b(0, 0.3, 0.006, 0.12, 0.01, 0.004, "#566370"), b(0, 0.38, 0.006, 0.12, 0.01, 0.004, "#566370"),
], { wall: true });

// ---- rabbit ----------------------------------------------------------------------------------------------------
const hutch = (() => {
  const bx = -0.225, wd = 0.85, W = "#b98e5a";
  const top = (z: number) => 0.85 + (0.29 - z) * (0.1 / 0.58) - 0.005;
  const wire = span(-0.18, 0.16, 6).map((x) => b(x, 0.65, 0.29, 0.01, 0.36, 0.01, WIREC));
  return def("Rabbit hutch with ramp 1.3 x 0.6 m", 1.3, 0.6, 1.0, [
    ...[-0.62, 0.17].flatMap((x) => [-1, 1].map((s) => b(x, 0.21, s * 0.27, 0.06, 0.42, 0.06, W, M))),
    b(bx, 0.1, 0, 0.79, 0.015, 0.54, GALV),
    b(bx, 0.435, 0, wd, 0.03, 0.6, W, M),
    b(bx, 0.7, -0.285, wd, 0.5, 0.03, W, M),
    ...slopedWall(-0.635, 0.03, -0.3, 0.3, 4, 0.45, top, W), ...slopedWall(0.185, 0.03, -0.3, 0.3, 4, 0.45, top, W),
    b(bx, 0.65, 0, 0.02, 0.4, 0.56, W, M),
    b(-0.4375, 0.65, 0.285, 0.425, 0.4, 0.03, W, M),
    b(-0.4375, 0.5175, 0.306, 0.17, 0.135, 0.012, DOORC), cz(-0.4375, 0.585, 0.306, 0.17, 0.012, DOORC),
    b(-0.195, 0.65, 0.29, 0.03, 0.4, 0.03, W, M), b(0.175, 0.65, 0.29, 0.03, 0.4, 0.03, W, M),
    b(-0.01, 0.835, 0.29, 0.4, 0.03, 0.03, W, M), b(-0.01, 0.465, 0.29, 0.4, 0.03, 0.03, W, M),
    ...wire,
    b(0.175, 0.65, 0.305, 0.02, 0.05, 0.015, DARK),
    sp(-0.1, 0.5, -0.1, 0.13, HAYC), sp(0.02, 0.49, -0.15, 0.1, HAYC), b(0.05, 0.47, -0.05, 0.16, 0.03, 0.12, HAYC),
    cy(0.15, 0.62, -0.05, 0.07, 0.2, "#9fd0e8"), cy(0.15, 0.735, -0.05, 0.04, 0.03, DARK),
    cy(-0.05, 0.475, 0.1, 0.12, 0.05, "#b86b4b"),
    b(-0.21, 0.915, 0, 0.88, 0.03, 0.58, FELT, { r: [0.1707, 0, 0] }),
    ...ramp(0.2, 0.45, 0.64, 0.02, 0, 0.24, W, 4),
  ]);
})();

const rabbitRun = (() => {
  const o: Run = { h: 0.6, rails: [0.08, 0.57], sp: 0.16, wire: WIREC, rail: OAK, post: OAK, pt: 0.045, rt: 0.025, m: true };
  const W = "#b98e5a";
  return def("Rabbit run, wire 1.8 x 0.9 m", 1.8, 0.9, 0.6, [
    ...shift(pen(1.4, 0.9, o, { x: 0.15, w: 0.45 }), 0.2, 0),
    b(-0.7, 0.02, 0, 0.4, 0.04, 0.84, W, M),
    b(-0.885, 0.2, 0, 0.03, 0.34, 0.84, W, M), ...[-1, 1].map((s) => b(-0.7, 0.2, s * 0.405, 0.4, 0.34, 0.03, W, M)),
    b(-0.515, 0.2, 0, 0.03, 0.34, 0.84, W, M),
    b(-0.498, 0.1, 0, 0.012, 0.12, 0.22, DOORC), cx(-0.498, 0.16, 0, 0.22, 0.012, DOORC),
    b(-0.7, 0.41, 0, 0.42, 0.03, 0.88, SHING, { r: [0, 0, 0.1] }),
  ]);
})();

// ---- chickens --------------------------------------------------------------------------------------------------
const coopS = (() => {
  const W = "#9db391", yf = 0.9;
  const top = (z: number) => yf + (0.315 - z) * (0.1 / 0.63) - 0.005;
  return def("Chicken coop, 4 hens 1.5 x 0.8 m", 1.5, 0.8, 1.1, [
    ...[-0.31, 0.36].flatMap((x) => [-1, 1].map((s) => b(x, 0.225, s * 0.3, 0.06, 0.45, 0.06, OAK, M))),
    ...[0.15, -0.15].map((z) => b(0.72, 0.24, z, 0.04, 0.48, 0.04, OAK, M)),
    b(0.025, 0.465, 0, 0.75, 0.03, 0.66, W, M),
    b(0.025, 0.74, -0.315, 0.75, 0.52, 0.03, W, M),
    b(0.025, 0.61, 0.315, 0.75, 0.26, 0.03, W, M),
    b(0.025, 0.885, 0.315, 0.75, 0.03, 0.03, W, M),
    ...span(-0.33, 0.38, 6).map((x) => b(x, 0.805, 0.315, 0.012, 0.13, 0.012, WIREC)),
    ...slopedWall(-0.335, 0.03, -0.33, 0.33, 3, 0.48, top, W), ...slopedWall(0.385, 0.03, -0.33, 0.33, 3, 0.48, top, W),
    b(-0.357, 0.6, 0, 0.012, 0.24, 0.18, DOORC), b(-0.358, 0.76, 0, 0.012, 0.12, 0.22, OAK, M),
    ...ramp(-0.74, 0.02, -0.36, 0.49, 0, 0.2, OAK, 4),
    b(0.575, 0.495, 0, 0.35, 0.03, 0.4, W, M),
    b(0.575, 0.63, 0.185, 0.35, 0.3, 0.03, W, M), b(0.575, 0.63, -0.185, 0.35, 0.3, 0.03, W, M), b(0.735, 0.63, 0, 0.03, 0.3, 0.34, W, M),
    b(0.57, 0.53, 0, 0.3, 0.04, 0.34, HAYC), sp(0.6, 0.575, 0.05, 0.05, "#f2e4cb"),
    b(0.552, 0.83, 0, 0.4, 0.02, 0.42, W, { ...M, r: [0, 0, -0.2] }),
    b(0.025, 0.965, 0, 0.85, 0.03, 0.8, FELT, { r: [0.1574, 0, 0] }),
    cx(0.025, 0.78, 0.1, 0.03, 0.7, WOOD),
    ...[-0.32, 0.37].map((x) => b(x, 0.62, 0.1, 0.03, 0.28, 0.03, WOOD)),
    b(0.3, 0.68, 0.34, 0.04, 0.03, 0.03, DARK), b(0.3, 0.7, 0.36, 0.07, 0.012, 0.07, DARK), sp(0.3, 0.66, 0.357, 0.06, "#ffe2a8", { glow: true }),
  ], { light: { y: 0.66, color: "#ffe2a8" } });
})();

const coopL = (() => {
  const W = "#9b4a3a", top = (z: number) => 1.6 + (0.73 - z) * 0.1712 - 0.005;
  const lampY = 1.47;
  return def("Chicken coop, walk-in 2.0 x 1.6 m", 2.0, 1.6, 1.9, [
    ...[-0.55, 0.58].flatMap((x) => [-1, 1].map((s) => b(x, 0.06, s * 0.68, 0.1, 0.12, 0.1, GREY))),
    b(0.01, 0.135, 0, 1.26, 0.03, 1.46, W, M),
    b(0.01, 1.0, -0.71, 1.22, 1.7, 0.04, W, M),
    b(0.01, 0.875, 0.71, 1.22, 1.45, 0.04, W, M),
    ...slopedWall(-0.58, 0.04, -0.75, 0.75, 5, 0.15, top, W), ...slopedWall(0.6, 0.04, -0.75, 0.75, 5, 0.15, top, W),
    b(0, 1.745, 0, 1.3, 0.04, 1.58, FELT, { r: [0.1696, 0, 0] }),
    cx(0, 1.62, 0.775, 0.05, 1.3, GREY), cy(0.62, 0.9, 0.77, 0.04, 1.45, GREY),
    // door
    b(0.3, 0.845, 0.74, 0.55, 1.35, 0.02, "#6e4a2c"),
    b(0.01, 0.845, 0.745, 0.03, 1.4, 0.02, TRIM, M), b(0.59, 0.845, 0.745, 0.03, 1.4, 0.02, TRIM, M), b(0.3, 1.545, 0.745, 0.62, 0.03, 0.02, TRIM, M),
    rod([0.06, 0.25, 0.752], [0.54, 1.45, 0.752], 0.03, "#5a3b22"),
    b(0.3, 0.5, 0.752, 0.55, 0.04, 0.01, "#5a3b22"), b(0.3, 1.25, 0.752, 0.55, 0.04, 0.01, "#5a3b22"),
    b(0.5, 0.85, 0.765, 0.03, 0.12, 0.02, GREY),
    b(0.06, 0.4, 0.76, 0.06, 0.04, 0.01, DARK), b(0.06, 1.3, 0.76, 0.06, 0.04, 0.01, DARK),
    // window
    b(-0.3, 1.1, 0.745, 0.5, 0.4, 0.012, GLASS),
    b(-0.3, 1.33, 0.745, 0.56, 0.04, 0.025, TRIM, M), b(-0.3, 0.87, 0.75, 0.6, 0.04, 0.04, TRIM, M),
    b(-0.57, 1.1, 0.745, 0.04, 0.4, 0.025, TRIM, M), b(-0.03, 1.1, 0.745, 0.04, 0.4, 0.025, TRIM, M),
    b(-0.3, 1.1, 0.752, 0.012, 0.4, 0.01, WHITE), b(-0.3, 1.1, 0.752, 0.5, 0.012, 0.01, WHITE),
    // pop hole + ramp
    b(-0.605, 0.34, 0.3, 0.012, 0.3, 0.24, DOORC), b(-0.607, 0.57, 0.3, 0.014, 0.2, 0.3, OAK, M),
    ...ramp(-0.99, 0.02, -0.62, 0.2, 0.3, 0.26, OAK, 4),
    // nest boxes
    b(0.82, 0.55, 0, 0.36, 0.03, 1.05, W, M),
    ...[0.45, -0.45].map((z) => b(0.97, 0.27, z, 0.04, 0.54, 0.04, W, M)),
    ...[-0.51, -0.17, 0.17, 0.51].map((z) => b(0.82, 0.7, z, 0.36, 0.28, 0.02, W, M)),
    b(0.985, 0.7, 0, 0.03, 0.28, 1.04, W, M),
    ...[-0.34, 0, 0.34].map((z) => b(0.8, 0.59, z, 0.28, 0.05, 0.3, HAYC)),
    sp(0.78, 0.63, -0.32, 0.05, "#f2e4cb"), sp(0.82, 0.63, 0.36, 0.05, "#e9d3b4"),
    b(0.79, 0.91, 0, 0.42, 0.02, 1.08, W, { ...M, r: [0, 0, -0.15] }),
    // lamp
    b(-0.3, 1.5, 0.76, 0.03, 0.03, 0.04, DARK), b(-0.3, 1.505, 0.772, 0.07, 0.012, 0.06, DARK), sp(-0.3, lampY, 0.772, 0.055, "#ffe2a8", { glow: true }),
  ], { light: { y: lampY, color: "#ffe2a8" } });
})();

const chickenRun = def("Chicken run, wire 3.0 x 2.0 m", 3.0, 2.0, 1.8,
  pen(3.0, 2.0, { h: 1.8, rails: [0.12, 0.9, 1.78], sp: 0.4, wire: WIREC, rail: OAK, post: OAK, pt: 0.08, rt: 0.035, m: true }, { x: 0.7, w: 0.9 }));

const nestBox = (() => {
  const W = "#b98e5a";
  return def("Nest box row, 3 hens 0.9 x 0.4 m", 0.9, 0.4, 0.5, [
    b(0, 0.06, 0, 0.9, 0.03, 0.4, W, M), ...[-1, 1].map((s) => b(s * 0.4, 0.03, 0, 0.06, 0.06, 0.36, W, M)),
    b(0, 0.28, -0.185, 0.9, 0.4, 0.03, W, M),
    ...[-0.44, -0.15, 0.15, 0.44].map((x) => b(x, 0.23, 0, 0.02, 0.32, 0.37, W, M)),
    ...[-0.3, 0, 0.3].flatMap((x, i) => [
      b(x, 0.12, 0.185, 0.28, 0.07, 0.02, W, M), b(x, 0.1, -0.01, 0.26, 0.04, 0.3, HAYC), sp(x, 0.13, -0.03, 0.18, HAYC),
      ...(i === 1 ? [] : [sp(x + 0.03, 0.16, 0.0, 0.05, "#f2e4cb")]),
    ]),
    b(0, 0.45, 0, 0.9, 0.02, 0.42, SHING, { r: [0.197, 0, 0] }),
  ]);
})();

const duckHouse = (() => {
  const W = "#7fa0b8", bw = 0.5, bd = 0.64, cxb = -0.1, y0 = 0.545, rise = 0.12, tw = 0.025;
  return def("Duck house on stilts 0.8 x 0.7 m", 0.8, 0.7, 0.7, [
    ...[-0.34, 0.14].flatMap((x) => [-1, 1].map((s) => cy(x, 0.11, s * 0.29, 0.05, 0.22, OAK, M))),
    ...[-1, 1].map((s) => b(cxb, 0.14, s * 0.29, 0.5, 0.025, 0.025, WOOD)), ...[-0.34, 0.14].map((x) => b(x, 0.12, 0, 0.025, 0.025, 0.58, WOOD)),
    b(cxb, 0.235, 0, 0.54, 0.03, 0.66, OAK, M),
    b(cxb, 0.3975, -bd / 2 + tw / 2, bw, 0.295, tw, W, M), b(cxb, 0.3975, bd / 2 - tw / 2, bw, 0.295, tw, W, M),
    b(cxb - bw / 2 + tw / 2, 0.3975, 0, tw, 0.295, bd - 2 * tw, W, M), b(cxb + bw / 2 - tw / 2, 0.3975, 0, tw, 0.295, bd - 2 * tw, W, M),
    ...shift(gend(bw + 0.06, y0, rise, bd / 2 - 0.0125, W, 4, 0.025, true), cxb, 0), ...shift(gend(bw + 0.06, y0, rise, -bd / 2 + 0.0125, W, 4, 0.025, true), cxb, 0),
    ...shift(gable(0.6, 0.7, y0, rise, SHING, 0.025), cxb, 0), b(cxb, y0 + rise + 0.005, 0, 0.05, 0.035, 0.7, DARKW),
    b(0.156, 0.31, 0, 0.012, 0.12, 0.2, DOORC), cx(0.156, 0.37, 0, 0.2, 0.012, DOORC),
    b(-0.1, 0.42, 0.327, 0.17, 0.13, 0.008, WHITE), b(-0.1, 0.42, 0.33, 0.14, 0.1, 0.008, GLASS),
    ...ramp(0.16, 0.255, 0.38, 0.02, 0, 0.2, OAK, 3),
  ]);
})();

const duckPond = (() => {
  const rim = "#2f3a33", body = "#46705a";
  return def("Duck pond, plastic 1.6 x 1.2 m", 1.6, 1.2, 0.2, [
    ...[-1, 1].map((s) => cy(s * 0.2, 0.08, 0, 1.2, 0.16, body, M)), b(0, 0.08, 0, 0.4, 0.16, 1.2, body, M),
    ...[-1, 1].map((s) => cy(s * 0.2, 0.17, 0, 1.08, 0.02, WATER)), b(0, 0.17, 0, 0.4, 0.02, 1.08, WATER),
    ...[-1, 1].map((s) => b(0, 0.18, s * 0.57, 0.4, 0.04, 0.06, rim, M)),
    ...ringArc(0.2, -Math.PI / 2, 0.18, rim), ...ringArc(-0.2, Math.PI / 2, 0.18, rim),
    ...([[-0.7, 0.5, 0.16], [-0.55, 0.55, 0.1], [0.7, -0.5, 0.15], [0.58, -0.56, 0.1], [0.68, 0.5, 0.12], [-0.7, -0.52, 0.12]] as const).map(([x, z, s]) => sp(x, s / 2, z, s, STONE)),
    cy(0.0, 0.19, 0.0, 0.2, 0.04, STONE),
    cy(-0.3, 0.185, 0.15, 0.2, 0.01, "#4f8a45"), cy(0.35, 0.185, -0.2, 0.16, 0.01, "#4f8a45"), sp(0.35, 0.2, -0.2, 0.04, "#f3d4e0"),
  ]);
})();
/** half ring of rim boxes (radius .57, 8 segments) around the pond end centred at x = c0, starting at angle a0 */
function ringArc(c0: number, a0: number, y: number, c: string): Part[] {
  const n = 8, R = 0.57, da = Math.PI / n, L = 2 * R * Math.tan(da / 2) * 1.04;
  return Array.from({ length: n }, (_, i) => {
    const a = a0 + (i + 0.5) * da;
    return b(c0 + R * Math.cos(a), y, R * Math.sin(a), L, 0.04, 0.06, c, { ...M, r: [0, -(a + Math.PI / 2), 0] });
  });
}

// ---- birds -----------------------------------------------------------------------------------------------------
const birdHouse = (() => {
  const W = "#c79a63";
  return def("Bird house on post 0.3 m", 0.3, 0.3, 1.7, [
    b(0, 0.03, 0, 0.16, 0.06, 0.16, GREY), b(0, 0.68, 0, 0.06, 1.24, 0.06, W, M),
    rod([0.03, 1.12, 0], [0.11, 1.28, 0], 0.02, WOOD), rod([-0.03, 1.12, 0], [-0.11, 1.28, 0], 0.02, WOOD),
    b(0, 1.29, 0, 0.26, 0.02, 0.26, W, M), b(0, 1.41, 0, 0.2, 0.22, 0.2, W, M),
    cz(0, 1.41, 0.1, 0.085, 0.006, TRIM), cz(0, 1.41, 0.104, 0.06, 0.01, DOORC), cz(0, 1.35, 0.12, 0.012, 0.06, WOOD),
    ...gable(0.3, 0.3, 1.52, 0.12, SHING, 0.02), b(0, 1.6475, 0, 0.03, 0.025, 0.3, DARKW),
    ...gend(0.26, 1.52, 0.12, 0.09, W, 4, 0.02, true), ...gend(0.26, 1.52, 0.12, -0.09, W, 4, 0.02, true),
    sp(0, 1.665, 0.14, 0.035, DARKW),
  ]);
})();

const birdTable = (() => {
  const W = "#b98e5a";
  return def("Bird table 0.6 m", 0.6, 0.6, 1.5, [
    b(0, 0.03, 0, 0.3, 0.06, 0.3, GREY), b(0, 0.5975, 0, 0.07, 1.075, 0.07, W, M),
    rod([0.035, 0.85, 0], [0.22, 1.135, 0], 0.03, WOOD), rod([-0.035, 0.85, 0], [-0.22, 1.135, 0], 0.03, WOOD),
    rod([0, 0.85, 0.035], [0, 1.135, 0.22], 0.03, WOOD), rod([0, 0.85, -0.035], [0, 1.135, -0.22], 0.03, WOOD),
    b(0, 1.15, 0, 0.6, 0.03, 0.6, W, M),
    ...[-1, 1].flatMap((s) => [b(0, 1.185, s * 0.285, 0.6, 0.04, 0.03, W, M), b(s * 0.285, 1.185, 0, 0.03, 0.04, 0.54, W, M)]),
    ...[-1, 1].flatMap((sx) => [-1, 1].map((sz) => b(sx * 0.26, 1.29, sz * 0.26, 0.025, 0.25, 0.025, WOOD))),
    ...gable(0.6, 0.58, 1.415, 0.07, SHING, 0.02), b(0, 1.495, 0, 0.03, 0.02, 0.6, DARKW),
    ...gend(0.54, 1.415, 0.07, 0.27, W, 3, 0.02, true), ...gend(0.54, 1.415, 0.07, -0.27, W, 3, 0.02, true),
    cy(-0.1, 1.195, 0.1, 0.14, 0.03, "#a8643a"),
    ...([[0.1, 0.05], [0.18, -0.1], [-0.15, -0.15], [0.05, -0.2], [-0.2, 0.0], [0.15, 0.18]] as const).map(([x, z]) => sp(x, 1.176, z, 0.02, "#7a5a33")),
  ]);
})();

// ---- horses and farm -------------------------------------------------------------------------------------------
const stable = (() => {
  const W = "#8a5f3d", DD = "#6e4a2c", ROOFG = "#6f8a46";
  return def("Horse stable box 3.2 x 3.6 m", 3.2, 3.6, 2.8, [
    b(0, 0.06, 0, 3.04, 0.12, 3.24, GREY), b(0, 0.13, 0, 2.9, 0.02, 3.1, HAYC),
    b(0, 1.06, -1.57, 3.0, 1.88, 0.06, W, M), ...[-1, 1].map((s) => b(s * 1.47, 1.06, 0, 0.06, 1.88, 3.08, W, M)),
    b(-1.025, 1.06, 1.57, 0.95, 1.88, 0.06, W, M), b(1.025, 1.06, 1.57, 0.95, 1.88, 0.06, W, M), b(0, 1.875, 1.57, 1.1, 0.25, 0.06, W, M),
    ...[-1, 1].flatMap((sx) => [-1, 1].map((sz) => b(sx * 1.5, 1.06, sz * 1.6, 0.1, 1.88, 0.1, DARKW))),
    b(0, 0.745, 1.6, 1.06, 1.25, 0.04, DD), rod([-0.45, 0.2, 1.625], [0.45, 1.3, 1.625], 0.04, DD),
    b(0, 0.3, 1.625, 1.0, 0.08, 0.01, DD), b(0, 1.2, 1.625, 1.0, 0.08, 0.01, DD), b(0.45, 1.0, 1.635, 0.04, 0.12, 0.02, DARK),
    b(-1.025, 1.56, 1.64, 0.95, 0.36, 0.04, DD),
    ...gend(3.06, 2.0, 0.7, 1.57, W, 6, 0.06, true), ...gend(3.06, 2.0, 0.7, -1.57, W, 6, 0.06, true),
    ...gable(3.2, 3.6, 2.0, 0.7, ROOFG, 0.06), b(0, 2.74, 0, 0.16, 0.07, 3.6, DARKW),
    ...[-1, 1].map((s) => cz(s * 1.55, 1.99, 0, 0.07, 3.6, GREY)), cy(1.55, 1.0, 1.5, 0.06, 1.9, GREY),
    // hay rack and buckets inside
    b(-1.3, 1.45, -0.8, 0.08, 0.04, 0.9, DARKW), b(-1.3, 0.95, -0.8, 0.08, 0.04, 0.9, DARKW),
    ...span(-1.2, -0.4, 5).map((z) => b(-1.3, 1.2, z, 0.03, 0.5, 0.03, DARKW)),
    b(-1.34, 1.2, -0.8, 0.1, 0.4, 0.8, HAYC), b(-1.25, 0.88, -0.8, 0.2, 0.1, 0.9, DARKW),
    cy(1.2, 0.27, -1.3, 0.3, 0.3, "#3d6aa8"), cy(1.2, 0.27, -0.85, 0.3, 0.3, "#c9ccd0"),
    // window
    b(1.51, 1.4, -0.4, 0.012, 0.5, 0.7, GLASS),
    b(1.51, 1.7, -0.4, 0.02, 0.06, 0.82, TRIM), b(1.51, 1.1, -0.4, 0.02, 0.06, 0.82, TRIM),
    b(1.51, 1.4, -0.8, 0.02, 0.5, 0.06, TRIM), b(1.51, 1.4, 0.0, 0.02, 0.5, 0.06, TRIM),
    b(1.52, 1.4, -0.4, 0.01, 0.5, 0.02, TRIM), b(1.52, 1.4, -0.4, 0.01, 0.02, 0.7, TRIM),
  ]);
})();

const hayBale = def("Straw bale 0.9 x 0.45 m", 0.9, 0.45, 0.36, [
  b(0, 0.18, 0, 0.9, 0.36, 0.45, HAYC),
  ...[-1, 1].flatMap((s) => [b(s * 0.22, 0.362, 0, 0.014, 0.008, 0.452, "#7a6a4a"), b(s * 0.22, 0.18, 0.2255, 0.014, 0.36, 0.006, "#7a6a4a"), b(s * 0.22, 0.18, -0.2255, 0.014, 0.36, 0.006, "#7a6a4a")]),
  ...[-1, 1].flatMap((s) => [0.06, 0.13, 0.2, 0.27].map((y) => b(0, y, s * 0.2265, 0.88, 0.005, 0.004, HAYD))),
  ...[-0.12, 0, 0.12].map((z) => b(0, 0.362, z, 0.88, 0.004, 0.006, HAYD)),
  b(-0.2, 0.37, 0.1, 0.12, 0.008, 0.008, HAYC, { r: [0, 0.5, 0] }), b(0.15, 0.37, -0.12, 0.14, 0.008, 0.008, HAYC, { r: [0, -0.4, 0] }),
  b(0.3, 0.37, 0.14, 0.1, 0.008, 0.008, HAYC, { r: [0, 0.9, 0] }), b(-0.3, 0.37, -0.1, 0.12, 0.008, 0.008, HAYC, { r: [0, -0.2, 0] }),
]);

const hayRound = def("Round hay bale 1.2 m", 1.3, 1.3, 1.3, [
  cz(0, 0.6, 0, 1.2, 1.2, HAYC),
  ...[-1, 1].flatMap((s) => [0.95, 0.7, 0.45, 0.2].map((dia, i) => cz(0, 0.6, s * (0.604 + i * 0.002), dia, 0.006, i % 2 === 0 ? HAYD : "#e2c466"))),
  ...[-0.4, 0, 0.4].map((z) => cz(0, 0.6, z, 1.212, 0.014, "#c4cdd1")),
  ...([[0.45, 0.5, 0.5], [-0.5, 0.55, -0.3], [0.55, -0.45, 1.1], [-0.4, -0.5, 0.2], [0.1, 0.5, -0.7], [-0.55, 0.3, 0.9], [0.5, 0.1, 0.3], [-0.1, -0.62, 0.0]] as const)
    .map(([x, z, r]) => b(x, 0.01, z, 0.22, 0.02, 0.05, HAYC, { r: [0, r, 0] })),
]);

const trough = def("Water trough 1.2 x 0.5 m", 1.2, 0.5, 0.55, [
  b(0, 0.21, 0, 1.1, 0.02, 0.4, GALV),
  ...[-1, 1].map((s) => b(0, 0.38, s * 0.2, 1.2, 0.34, 0.02, GALV)), ...[-1, 1].map((s) => b(s * 0.59, 0.38, 0, 0.02, 0.34, 0.38, GALV)),
  b(0, 0.5, 0, 1.14, 0.02, 0.38, WATER),
  ...[-1, 1].map((s) => cx(0, 0.535, s * 0.2, 0.04, 1.2, STEEL)), ...[-1, 1].map((s) => cz(s * 0.59, 0.535, 0, 0.04, 0.4, STEEL)),
  ...[-1, 1].flatMap((s) => [-0.45, -0.15, 0.15, 0.45].map((x) => b(x, 0.38, s * 0.212, 0.03, 0.3, 0.012, GREY))),
  ...[-1, 1].flatMap((sx) => [-1, 1].map((sz) => b(sx * 0.5, 0.1, sz * 0.14, 0.04, 0.2, 0.04, DARK))),
  ...[-1, 1].map((s) => b(0, 0.08, s * 0.14, 1.0, 0.03, 0.03, DARK)),
  rod([-0.55, 0.52, 0], [-0.35, 0.52, 0], 0.012, STEEL), sp(-0.35, 0.52, 0, 0.1, "#d8453b"),
]);

const feeder = def("Poultry feeder, hanging 0.4 m", 0.4, 0.4, 0.6, [
  cy(0, 0.035, 0, 0.4, 0.07, GALV), cy(0, 0.062, 0, 0.36, 0.01, "#8a6a45"), cy(0, 0.085, 0, 0.12, 0.03, GREY),
  ...[0, 1, 2].map((i) => { const a = (i / 3) * Math.PI * 2; return b(0.07 * Math.cos(a), 0.08, 0.07 * Math.sin(a), 0.015, 0.03, 0.015, STEEL); }),
  cy(0, 0.27, 0, 0.2, 0.36, GALV), cy(0, 0.18, 0, 0.21, 0.012, GREY), cy(0, 0.36, 0, 0.21, 0.012, GREY),
  cy(0, 0.465, 0, 0.26, 0.03, GALV), cy(0, 0.495, 0, 0.2, 0.03, GALV), cy(0, 0.525, 0, 0.12, 0.03, GALV), cy(0, 0.55, 0, 0.05, 0.02, STEEL),
  b(0, 0.575, 0, 0.01, 0.03, 0.02, STEEL), b(0, 0.59, 0, 0.02, 0.03, 0.01, STEEL), b(0, 0.595, 0, 0.05, 0.01, 0.01, STEEL),
  ...([[0.15, 0.1], [-0.12, 0.16], [0.1, -0.15], [-0.16, -0.08], [0.0, 0.17], [-0.05, -0.18]] as const).map(([x, z]) => sp(x, 0.078, z, 0.02, "#a68a54")),
]);

// ---- dog runs, fence -------------------------------------------------------------------------------------------
const chain: Run = { h: 1.8, rails: [1.78, 0.9, 0.03], sp: 0.35, wire: "#b9bec4", rail: STEEL, post: STEEL, pt: 0.06, rt: 0.04, pipe: true };
const dogRun = def("Dog run, chain-link 3.0 x 1.5 m", 3.0, 1.5, 1.8, [
  b(0, 0.02, 0, 2.98, 0.04, 1.48, "#a9adb2"), ...pen(3.0, 1.5, chain, { x: 0.6, w: 0.9 }),
]);
const kennelRun = def("Dog kennel and run, chain-link 3.5 x 1.5 m", 3.5, 1.5, 1.8, [
  b(0, 0.02, 0, 3.48, 0.04, 1.48, "#a9adb2"),
  ...pen(3.5, 1.5, { ...chain, rails: [1.78, 0.03], sp: 0.5 }, { x: 0.9, w: 0.9 }),
  ...shift(kennelParts({ w: 0.8, d: 1.0, h: 0.7, fh: 0.05, rise: 0.16, dw: 0.26, dh: 0.36, wood: KWOOD, roof: KROOF, lite: true }), -1.28, 0),
]);

const paddockFence = (() => {
  const W = "#9a7a52";
  return def("Paddock fence, 3 rails 3.0 m", 3.0, 0.12, 1.3, [
    ...[-1.45, 0, 1.45].flatMap((x) => [b(x, 0.65, 0, 0.1, 1.3, 0.1, W, M), b(x, 1.31, 0, 0.12, 0.02, 0.12, DARKW), b(x, 0.04, 0, 0.12, 0.08, 0.12, GREY)]),
    ...[0.45, 0.8, 1.15].flatMap((y) => [b(0, y, 0.04, 3.0, 0.1, 0.04, W, M), ...[-1.45, 0, 1.45].map((x) => sp(x, y, 0.052, 0.018, DARK))]),
  ]);
})();

export const HOUSES: Record<string, Def> = {
  an_kennel_s: kennelS, an_kennel_m: kennelM, an_kennel_l: kennelL,
  an_dog_bed: dogBed, an_bowls: bowls, an_cat_tree: catTree, an_cat_house: catHouse, an_scratch_post: scratchPost, an_pet_door: petDoor,
  an_hutch: hutch, an_rabbit_run: rabbitRun,
  an_coop_s: coopS, an_coop_l: coopL, an_chicken_run: chickenRun, an_nest_box: nestBox, an_duck_house: duckHouse, an_duck_pond: duckPond,
  an_bird_house: birdHouse, an_bird_table: birdTable,
  an_stable: stable, an_hay_bale: hayBale, an_hay_round: hayRound, an_trough: trough, an_feeder: feeder,
  an_dog_run: dogRun, an_kennel_run: kennelRun, an_paddock_fence: paddockFence,
};
