import type { Def, Part } from "../catalog";
import { b, cy, sp, cx, cz, rod, el, ring, range, gable, gd, plantAt, swung, STEEL, WOOD, OAK, DECK, BLACK, DARK, WHITE, LEAF1, LEAF2, TRUNK, TERRA, SOIL, RED, GOLD, ROPE, SAND, WATER, FELT, ROOFC, TEAK, CREAM, PI } from "./kit.ts";

const BLUE = "#3f78b5", YEL = "#f0c43c", GRN = "#4a9a4a", PINK = "#e88aa8", ORG = "#ee7d2d", SKY = "#8fb0c8", ROCK = "#9a8f84", HULL = "#7a4f35";
const HOLDS = [RED, YEL, BLUE, GRN, ORG, PINK];

/** moves a group of parts */
const at = (ps: Part[], dx: number, dy: number, dz: number): Part[] => ps.map((p) => ({ ...p, p: [p.p[0] + dx, p.p[1] + dy, p.p[2] + dz] }));
/** a hanging part that swings about the beam: every part of one swing shares pivot, angle and speed */
type Sw = (p: Part) => Part;
const sw = (pivot: number, deg = 7, rpm = 12): Sw => (p) => swung(p, pivot, deg, rpm, "x");
/** seat on two ropes hanging from beam height Y */
const hangSeat = (S: Sw, x: number, Y: number, y: number, c: string, wd = 0.42, rope = FELT): Part[] => [
  ...[-1, 1].map((s) => S(b(x + s * (wd / 2 - 0.03), (Y + y) / 2, 0, 0.02, Y - y, 0.02, rope))),
  S(b(x, y, 0, wd, 0.04, 0.2, c, { m: true })), S(b(x, y - 0.03, 0, wd - 0.06, 0.02, 0.17, BLACK)),
];
/** A-frame end of a swing: two legs meeting at the beam */
const aEnd = (x: number, zh: number, top: number, th: number, c: string): Part[] =>
  [-1, 1].map((s) => rod([x, 0.03, s * zh], [x, top, 0], th, c, { m: true }));
/** slide profile: height f(u) from (u0, y0) down to (u1, y1), steep at the top and flattening at the end */
const profile = (u0: number, y0: number, u1: number, y1: number, e = 1.4, n = 7) => {
  const f = (u: number) => y1 + (y0 - y1) * Math.max(0, 1 - (u - u0) / (u1 - u0)) ** e;
  return { f, pts: range(n + 1).map((i): [number, number] => { const u = u0 + ((u1 - u0) * i) / n; return [u, f(u)]; }) };
};
/** curved chute with side rails: along x (at z = fix) or along z (at x = fix) */
const chute = (dir: "x" | "z", fix: number, pts: [number, number][], wd: number, c: string, rail: string): Part[] =>
  pts.slice(1).flatMap(([u1, y1], i) => {
    const [u0, y0] = pts[i], du = u1 - u0, dy = y1 - y0, L = Math.hypot(du, dy) + 0.02, a = Math.atan2(dy, du), um = (u0 + u1) / 2, ym = (y0 + y1) / 2;
    return dir === "x"
      ? [b(um, ym, fix, L, 0.04, wd, c, { r: [0, 0, a], m: true }), ...[-1, 1].map((s) => b(um, ym + 0.05, fix + (s * wd) / 2, L, 0.1, 0.03, rail, { r: [0, 0, a] }))]
      : [b(fix, ym, um, wd, 0.04, L, c, { r: [-a, 0, 0], m: true }), ...[-1, 1].map((s) => b(fix + (s * wd) / 2, ym + 0.05, um, 0.03, 0.1, L, rail, { r: [-a, 0, 0] }))];
  });
/** ladder leaning from a = [z, y] (bottom) to e = [z, y] (top), width wd about x0 */
const ladder = (x0: number, a: [number, number], e: [number, number], wd: number, n: number, c: string): Part[] => [
  ...[-1, 1].map((s) => rod([x0 + (s * wd) / 2, a[1], a[0]], [x0 + (s * wd) / 2, e[1], e[0]], 0.05, c, { m: true })),
  ...range(n).map((i) => { const t = (i + 1) / (n + 1); return b(x0, a[1] + (e[1] - a[1]) * t, a[0] + (e[0] - a[0]) * t, wd, 0.03, 0.04, c); }),
];
/** triangular gable end made of stacked boards */
const gableEnd = (w: number, y0: number, z: number, c: string, n = 3): Part[] =>
  range(n).map((i) => b(0, y0 + 0.08 + i * 0.16, z, w * (1 - (i + 0.6) / (n + 0.4)), 0.16, 0.04, c, { m: true }));
const post = (x: number, z: number, h: number, c: string, t = 0.1, m = true) => b(x, h / 2, z, t, h, t, c, m ? { m: true } : undefined);
/** a small branch with leaves for the tree swings */
const branch = (): Part[] => [cx(0, 2.64, 0, 0.1, 0.5, TRUNK), sp(-0.1, 2.66, 0, 0.26, LEAF2), sp(0.1, 2.68, 0, 0.24, LEAF1)];

// ---------- swings ----------
const porchSwing = (() => {
  const Y = 1.85, S = sw(Y, 5, 10);
  return gd("Porch swing seat with stand 2.1 m", 2.1, 1.1, 1.9, [
    ...[-1, 1].flatMap((s) => [...aEnd(s * 0.98, 0.5, Y, 0.07, WOOD), b(s * 0.98, 0.14, 0, 0.06, 0.05, 0.95, WOOD, { m: true })]),
    cx(0, Y, 0, 0.08, 2.1, WOOD, { m: true }),
    ...[-1, 1].flatMap((sx) => [-1, 1].map((sz) => S(b(sx * 0.8, (Y + 0.5) / 2, sz * 0.25, 0.02, Y - 0.5, 0.02, STEEL)))),
    S(b(0, 0.45, 0, 1.7, 0.05, 0.5, TEAK, { m: true })),
    ...range(4).map((i) => S(b(0, 0.64 + i * 0.12, -0.25, 1.7, 0.08, 0.04, TEAK, { m: true }))),
    ...[-1, 1].flatMap((s) => [S(b(s * 0.84, 0.6, 0, 0.05, 0.04, 0.5, TEAK, { m: true })), S(b(s * 0.84, 0.52, 0.2, 0.05, 0.14, 0.05, TEAK)), S(b(s * 0.84, 0.52, -0.2, 0.05, 0.14, 0.05, TEAK))]),
    S(b(0, 0.52, 0.04, 1.55, 0.08, 0.4, SKY, { m: true })), S(b(0, 0.8, -0.2, 1.5, 0.4, 0.07, SKY, { m: true })),
    S(b(-0.5, 0.62, 0, 0.3, 0.16, 0.12, CREAM)), S(b(0.5, 0.62, 0, 0.3, 0.16, 0.12, GOLD)),
  ], { tags: "outdoor patio porch swing bench two seater chair hanging", wind: true });
})();

const treeSwing = (() => {
  const S = sw(2.6, 8, 11);
  return gd("Tree swing with wooden seat", 0.5, 0.4, 2.8, [...branch(), ...hangSeat(S, 0, 2.6, 0.45, OAK, 0.42, ROPE)],
    { tags: "outdoor garden rope swing branch kids child", wind: true });
})();

const tyreSwing = (() => {
  const S = sw(2.6, 9, 10), tyre = (a: number, d: number, c: string) => S(sp(0.22 * Math.cos(a), 0.7 + 0.22 * Math.sin(a), 0, d, c));
  return gd("Tyre swing", 0.7, 0.5, 2.8, [
    ...branch(),
    ...[-0.04, 0.04].map((dx) => S(b(dx, 1.65, 0, 0.02, 1.9, 0.02, ROPE))),
    ...range(12).map((i) => tyre((i / 12) * PI * 2, 0.15, BLACK)), ...range(6).map((i) => tyre((i / 6) * PI * 2 + 0.26, 0.17, DARK)),
  ], { tags: "outdoor garden tire swing rope kids child", wind: true });
})();

const swingA = (() => {
  const Y = 1.95, S = sw(Y, 7, 12);
  return gd("Double swing set A-frame 2.4 m", 2.4, 1.9, 2.0, [
    ...[-1, 1].flatMap((s) => [...aEnd(s * 1.1, 0.9, Y, 0.08, WOOD), b(s * 1.1, 0.4, 0, 0.06, 0.05, 1.1, WOOD, { m: true })]),
    cx(0, Y, 0, 0.1, 2.4, WOOD, { m: true }),
    ...hangSeat(S, -0.5, Y, 0.45, RED), ...hangSeat(S, 0.5, Y, 0.45, BLUE),
  ], { tags: "outdoor garden kids child play swings", wind: true });
})();

const swingSlide = (() => {
  const Y = 1.95, S = sw(Y, 7, 12), fx = -1.2, run = profile(0.2, 1.2, 1.68, 0.2);
  return gd("Double swing set with slide 3.4 m", 3.4, 1.9, 2.0, [
    ...[-1, 1].flatMap((s) => aEnd(fx + s * 0.45, 0.9, Y, 0.08, WOOD)),
    cx(fx, Y, 0, 0.1, 1.0, WOOD, { m: true }),
    ...hangSeat(S, fx - 0.21, Y, 0.45, RED, 0.36), ...hangSeat(S, fx + 0.21, Y, 0.45, BLUE, 0.36),
    ...[-0.45, 0.15].flatMap((x) => [-0.35, 0.35].map((z) => post(x, z, 1.85, WOOD, 0.08))),
    b(-0.15, 1.2, 0, 0.7, 0.05, 0.8, DECK),
    b(-0.5, 1.37, 0, 0.03, 0.3, 0.8, GRN, { m: true }), ...[-1, 1].map((s) => b(-0.2, 1.37, s * 0.39, 0.6, 0.3, 0.03, GRN, { m: true })),
    ...at(gable(0.8, 0.9, 1.85, 0.12, ROOFC, { m: true }), -0.15, 0, 0),
    ...chute("x", 0, run.pts, 0.4, YEL, BLUE),
    ...[0.7, 1.2].flatMap((u) => [-1, 1].map((s) => b(u, run.f(u) / 2 - 0.02, s * 0.2, 0.04, run.f(u) - 0.04, 0.04, STEEL))),
    ...ladder(-0.15, [0.88, 0.03], [0.45, 1.18], 0.4, 4, WOOD),
  ], { tags: "outdoor garden kids child play swings slide tower", wind: true });
})();

const swingWood = (() => {
  const Y = 2.1, S = sw(Y, 7, 12);
  const ropes = (x: number, y: number, wd: number) => [-1, 1].map((s) => S(b(x + (s * wd) / 2, (Y + y) / 2, 0, 0.02, Y - y, 0.02, ROPE)));
  return gd("Wooden swing set with glider and ladder 3.4 m", 3.4, 1.8, 2.2, [
    ...[-1, 1].flatMap((s) => [...aEnd(s * 1.55, 0.85, Y, 0.09, WOOD), b(s * 1.55, 0.4, 0, 0.07, 0.05, 1.0, WOOD, { m: true })]),
    cx(0, Y, 0, 0.12, 3.4, WOOD, { m: true }),
    ...hangSeat(S, -1.0, Y, 0.45, RED),
    ...[-1, 1].map((s) => S(b(-0.2 + s * 0.04, (Y + 0.95) / 2, 0, 0.03, Y - 0.95, 0.03, STEEL))), S(b(-0.2, 0.95, 0, 0.3, 0.03, 0.04, BLACK)),
    S(b(-0.2, 0.6, 0, 0.03, 0.7, 0.03, STEEL)), S(b(-0.2, 0.25, 0, 0.38, 0.04, 0.22, BLUE, { m: true })),
    ...ropes(0.45, 1.0, 0.34), S(b(0.45, 1.0, 0, 0.5, 0.04, 0.04, WOOD)),
    ...ropes(1.1, 0.3, 0.34), ...range(6).map((i) => S(b(1.1, 0.45 + i * 0.27, 0, 0.34, 0.03, 0.03, WOOD))),
  ], { tags: "outdoor garden kids child play swings trapeze rope ladder", wind: true });
})();

// ---------- slides and climbing ----------
const slideFree = (() => {
  const run = profile(-0.48, 1.0, 1.15, 0.2);
  return gd("Garden slide 1.9 m", 0.8, 2.4, 1.4, [
    ...[-1, 1].flatMap((sx) => [-0.9, -0.5].map((z) => post(sx * 0.33, z, 1.4, STEEL, 0.05, false))),
    b(0, 0.98, -0.7, 0.66, 0.05, 0.46, YEL, { m: true }), b(0, 1.2, -0.92, 0.66, 0.3, 0.03, BLUE, { m: true }),
    ...[-1, 1].map((s) => b(s * 0.33, 1.2, -0.7, 0.03, 0.3, 0.46, BLUE, { m: true })),
    ...chute("z", 0, run.pts, 0.4, YEL, BLUE),
    ...[0.2, 0.7].flatMap((u) => [-1, 1].map((s) => b(s * 0.2, run.f(u) / 2 - 0.02, u, 0.04, run.f(u) - 0.04, 0.04, STEEL))),
    ...ladder(0, [-1.15, 0.03], [-0.92, 0.96], 0.4, 5, BLUE),
  ], { tags: "outdoor garden kids child play playground ladder" });
})();

const slideTube = (() => {
  const run = profile(-0.45, 1.2, 1.2, 0.3), ang = (i: number) => Math.atan2(run.pts[i + 1][1] - run.pts[i][1], run.pts[i + 1][0] - run.pts[i][0]);
  return gd("Tube slide 2.6 m", 0.9, 2.6, 1.5, [
    ...[-1, 1].flatMap((sx) => [-1.1, -0.6].map((z) => post(sx * 0.38, z, 1.5, STEEL, 0.06, false))),
    b(0, 0.98, -0.85, 0.8, 0.05, 0.6, GRN, { m: true }), b(0, 1.25, -1.1, 0.8, 0.5, 0.03, BLUE, { m: true }),
    ...[-1, 1].map((s) => b(s * 0.38, 1.25, -0.85, 0.03, 0.5, 0.6, BLUE, { m: true })),
    ...run.pts.slice(0, -1).map(([u, y], i) => {
      const [u1, y1] = run.pts[i + 1];
      return b(0, (y + y1) / 2, (u + u1) / 2, 0.52, Math.hypot(u1 - u, y1 - y) + 0.04, 0.52, YEL, { shape: "cyl", r: [PI / 2 - ang(i), 0, 0], m: true });
    }),
    ...[1, 3, 5].map((i) => b(0, run.pts[i][1], run.pts[i][0], 0.56, 0.03, 0.56, BLUE, { shape: "cyl", r: [PI / 2 - ang(i), 0, 0] })),
    ...[0.1, 0.8].flatMap((u) => [-1, 1].map((s) => b(s * 0.2, run.f(u) / 2 - 0.15, u, 0.04, run.f(u) - 0.3, 0.04, STEEL))),
    ...ladder(0, [-1.28, 0.03], [-1.1, 0.96], 0.5, 5, BLUE),
  ], { tags: "outdoor garden kids child play playground wide tunnel enclosed" });
})();

const climbFrame = (() => {
  const run = profile(-0.1, 1.05, 1.25, 0.2), tx = -0.7, tz = -0.2;
  const L = Math.hypot(0.7, 0.95), nz = 0.95 / L, ny = 0.7 / L; // the rock wall leans from (z 1.15, y 0.05) up to (z 0.45, y 1.0)
  return gd("Climbing frame with rock wall and slide 2.7 m", 2.7, 2.4, 2.5, at([
    ...[-1, 1].flatMap((sx) => [-1, 1].map((sz) => post(tx + sx * 0.55, tz + sz * 0.65, 2.2, WOOD, 0.1))),
    b(tx, 1.0, tz, 1.2, 0.05, 1.4, DECK),
    ...at(gable(1.4, 1.6, 2.2, 0.3, ROOFC, { m: true }), tx, 0, tz),
    b(tx, 1.2, tz - 0.65, 1.2, 0.35, 0.04, GRN, { m: true }), b(tx - 0.55, 1.2, tz, 0.04, 0.35, 1.3, GRN, { m: true }),
    b(tx, 1.6, tz + 0.65, 1.2, 0.04, 0.04, WOOD), b(tx - 0.3, 1.38, tz + 0.65, 0.04, 0.4, 0.04, WOOD), b(tx + 0.3, 1.38, tz + 0.65, 0.04, 0.4, 0.04, WOOD),
    b(tx, 0.525, 0.8, 0.8, 0.05, L, ROCK, { r: [Math.atan2(-0.95, -0.7), 0, 0] }),
    ...[[-0.25, 0.1], [0.2, 0.2], [-0.1, 0.35], [0.25, 0.5], [-0.28, 0.62], [0.05, 0.75], [-0.2, 0.9], [0.25, 0.92]].map(([dx, t], i) =>
      sp(tx + dx, 0.05 + 0.95 * t + 0.05 * ny, 1.15 - 0.7 * t + 0.05 * nz, 0.08, HOLDS[i % 6])),
    ...chute("x", tz, run.pts, 0.4, YEL, BLUE),
    ...[0.5, 1.0].flatMap((u) => [-1, 1].map((s) => b(u, run.f(u) / 2 - 0.02, tz + s * 0.2, 0.04, run.f(u) - 0.04, 0.04, STEEL))),
    ...range(3).map((i) => sp(tx - 0.3 + i * 0.3, 1.1, tz - 0.4, 0.1, HOLDS[i])), // toy balls on the platform
  ], 0.055, 0, 0), { tags: "outdoor garden kids child play playground tower wall climbing" });
})();

const monkeyBars = gd("Monkey bars 2.4 m", 2.4, 0.9, 2.1, [
  b(0, 0.02, 0, 2.4, 0.04, 0.9, "#7a5a3a"),
  ...[-1, 1].flatMap((sx) => [-1, 1].flatMap((sz) => [post(sx * 1.1, sz * 0.3, 2.05, BLUE, 0.07), rod([sx * 1.1, 0.05, sz * 0.42], [sx * 1.1, 1.2, sz * 0.3], 0.04, STEEL)])),
  ...[-1, 1].map((s) => b(0, 2.02, s * 0.3, 2.2, 0.05, 0.05, BLUE, { m: true })),
  ...range(7).map((i) => cz(-0.9 + i * 0.3, 2.02, 0, 0.035, 0.6, STEEL)),
  ...range(5).map((i) => cz(-1.1, 0.35 + i * 0.35, 0, 0.035, 0.6, STEEL)),
], { tags: "outdoor garden kids child play playground climbing bars ladder" });

const seesaw = (() => {
  const a = 0.12;
  return gd("Seesaw 2.4 m", 2.4, 0.4, 1.0, [
    b(0, 0.5, 0, 2.3, 0.06, 0.26, YEL, { r: [0, 0, a], m: true }),
    cz(0, 0.46, 0, 0.07, 0.34, STEEL),
    ...[-1, 1].flatMap((s) => [-1, 1].map((e) => rod([e * 0.28, 0.03, s * 0.15], [0, 0.46, s * 0.15], 0.06, BLUE, { m: true }))),
    ...[-1, 1].flatMap((s) => {
      const x = s * 0.9, y = 0.5 + x * Math.sin(a);
      return [b(x, y + 0.2, 0, 0.03, 0.34, 0.03, STEEL), cz(x, y + 0.37, 0, 0.035, 0.3, BLACK), cy(s * 1.0, 0.1, 0, 0.3, 0.2, BLACK)];
    }),
  ], { tags: "outdoor garden kids child play playground teeter totter" });
})();

const springRider = gd("Spring rider horse", 0.45, 1.1, 1.05, [
  b(0, 0.02, 0, 0.4, 0.04, 0.7, BLUE, { m: true }),
  cy(0, 0.23, 0, 0.07, 0.4, STEEL), ...range(5).map((i) => cy(0, 0.07 + i * 0.08, 0, 0.13, 0.02, DARK)),
  el(0, 0.62, 0, 0.3, 0.28, 0.55, PINK, { m: true }),
  b(0, 0.78, 0.26, 0.12, 0.3, 0.14, PINK, { r: [-0.5, 0, 0], m: true }), el(0, 0.9, 0.38, 0.16, 0.2, 0.28, PINK, { m: true }), b(0, 0.85, 0.5, 0.1, 0.09, 0.08, "#f6c3d3"),
  ...[-1, 1].flatMap((s) => [b(s * 0.05, 1.0, 0.33, 0.04, 0.08, 0.04, PINK, { m: true }), sp(s * 0.075, 0.93, 0.45, 0.03, BLACK), b(s * 0.1, 0.45, 0.2, 0.07, 0.15, 0.08, WHITE), b(s * 0.1, 0.45, -0.2, 0.07, 0.15, 0.08, WHITE), b(s * 0.14, 0.8, 0.3, 0.025, 0.025, 0.14, STEEL)]),
  b(0, 0.9, 0.2, 0.06, 0.2, 0.08, YEL, { r: [-0.4, 0, 0] }), rod([0, 0.62, -0.26], [0, 0.45, -0.34], 0.05, YEL), b(0, 0.76, -0.02, 0.28, 0.04, 0.26, RED),
], { tags: "outdoor garden kids child play rocker bouncy animal pony" });

// ---------- play houses ----------
const sandbox = gd("Sandbox with seats and canopy 1.5 m", 1.5, 1.5, 1.55, [
  b(0, 0.14, 0, 1.38, 0.2, 1.38, SAND),
  ...[-1, 1].flatMap((s) => [b(0, 0.12, s * 0.7, 1.5, 0.24, 0.06, WOOD, { m: true }), b(s * 0.7, 0.12, 0, 0.06, 0.24, 1.38, WOOD, { m: true }),
    b(0, 0.27, s * 0.68, 1.5, 0.04, 0.14, OAK, { m: true }), b(s * 0.68, 0.27, 0, 0.14, 0.04, 1.22, OAK, { m: true })]),
  ...[-1, 1].flatMap((sx) => [-1, 1].map((sz) => post(sx * 0.72, sz * 0.72, 1.35, WOOD, 0.05))),
  ...gable(1.5, 1.5, 1.35, 0.18, "#e87a5a", { m: true }),
  cy(0.3, 0.3, 0.1, 0.14, 0.12, RED), cy(-0.2, 0.28, -0.2, 0.12, 0.1, BLUE), rod([-0.3, 0.26, 0.3], [-0.2, 0.36, 0.45], 0.025, YEL),
], { tags: "outdoor garden kids child play sand pit sandpit shade" });

const wendy = gd("Wendy house with porch 1.8 x 1.5 m", 1.8, 1.5, 2.0, [
  b(0, 0.04, 0, 1.8, 0.08, 1.5, DECK), b(0, 0.75, -0.25, 1.6, 1.34, 1.0, OAK, { m: true }),
  ...[-1, 1].map((s) => post(s * 0.75, 0.7, 1.42, WOOD, 0.07)),
  ...gable(1.8, 1.5, 1.42, 0.55, ROOFC), ...gableEnd(1.6, 1.42, 0.75, OAK), ...gableEnd(1.6, 1.42, -0.75, OAK),
  b(-0.4, 0.62, 0.26, 0.45, 1.0, 0.03, PINK, { m: true }), sp(-0.25, 0.6, 0.29, 0.05, GOLD),
  b(0.4, 0.85, 0.26, 0.4, 0.4, 0.03, WHITE), b(0.4, 0.85, 0.275, 0.32, 0.32, 0.01, SKY), b(0.81, 0.85, -0.25, 0.03, 0.4, 0.4, WHITE), b(0.83, 0.85, -0.25, 0.01, 0.32, 0.32, SKY),
  ...[-1, 1].map((s) => b(0.4 + s * 0.27, 0.85, 0.27, 0.1, 0.4, 0.03, PINK, { m: true })),
  b(0.4, 0.6, 0.33, 0.46, 0.1, 0.12, WOOD), plantAt("flower_bed_c", 0.44, 0.2, 0.1, 0.4, 0.33, 1, 0.65),
  b(0.85, 0.6, -0.25, 0.1, 0.1, 0.46, WOOD), plantAt("flower_bed_c", 0.08, 0.2, 0.44, 0.85, -0.25, 2, 0.65),
  ...[[-0.75, -0.2], [0.2, 0.75]].map(([x0, x1]) => b((x0 + x1) / 2, 0.45, 0.74, x1 - x0, 0.05, 0.04, WOOD)),
  ...[-0.74, -0.2, 0.2, 0.74].map((x) => b(x, 0.3, 0.74, 0.04, 0.4, 0.04, WOOD)),
  cy(0.5, 0.16, 0.58, 0.18, 0.16, TERRA), sp(0.5, 0.3, 0.58, 0.16, RED), sp(0.54, 0.34, 0.62, 0.1, GOLD), cy(-0.55, 0.15, 0.58, 0.16, 0.14, TERRA), sp(-0.55, 0.27, 0.58, 0.15, PINK),
], { tags: "outdoor garden kids child play playhouse cottage cabin hut" });

const treehouse = (() => {
  const P = 1.62;
  return gd("Treehouse with ladder 2.2 m", 2.2, 2.2, 3.0, [
    ...[-1, 1].flatMap((sx) => [-1, 1].map((sz) => post(sx * 0.95, sz * 0.95, P, WOOD, 0.12))),
    ...[-1, 1].flatMap((s) => [rod([s * 0.95, 0.4, -0.95], [s * 0.95, 1.4, -0.4], 0.05, WOOD), rod([s * 0.95, 0.4, 0.95], [s * 0.95, 1.4, 0.4], 0.05, WOOD)]),
    b(0, P, 0, 2.1, 0.06, 2.1, DECK),
    ...range(6).map((i) => b(0, P + 0.035, -0.8 + i * 0.35, 2.1, 0.01, 0.01, WOOD)),
    b(0, P + 0.56, -0.3, 1.4, 1.0, 1.2, OAK, { m: true }),
    ...at(gable(1.7, 1.5, P + 1.07, 0.3, ROOFC), 0, 0, -0.3), ...at(gableEnd(1.4, P + 1.06, 0.31, OAK, 2), 0, 0, 0), ...at(gableEnd(1.4, P + 1.06, -0.91, OAK, 2), 0, 0, 0),
    b(-0.25, P + 0.45, 0.31, 0.4, 0.8, 0.03, "#5a3f2b"), sp(-0.12, P + 0.45, 0.34, 0.05, GOLD), b(0.4, P + 0.6, 0.31, 0.3, 0.3, 0.03, WHITE), b(0.4, P + 0.6, 0.325, 0.24, 0.24, 0.01, SKY),
    b(0.71, P + 0.6, -0.3, 0.03, 0.3, 0.3, WHITE),
    ...[-1, 1].flatMap((s) => [b(s * 1.0, P + 0.3, 1.0, 0.06, 0.6, 0.06, WOOD), b(s * 1.0, P + 0.55, 0.7, 0.05, 0.05, 0.62, WOOD)]),
    b(-0.55, P + 0.55, 1.0, 0.95, 0.05, 0.05, WOOD), b(0.85, P + 0.55, 1.0, 0.4, 0.05, 0.05, WOOD),
    ...ladder(0.4, [1.08, 0.03], [0.92, P], 0.4, 6, WOOD),
  ], { tags: "outdoor garden kids child play den cabin platform tower" });
})();

const pirate = gd("Pirate ship climber 3 m", 1.8, 3.0, 2.4, [
  b(0, 0.14, -0.1, 1.5, 0.1, 2.5, HULL), b(0, 0.4, -0.1, 1.4, 0.05, 2.4, DECK),
  ...[-1, 1].flatMap((s) => [b(s * 0.75, 0.5, -0.1, 0.07, 0.7, 2.5, HULL, { m: true }), b(s * 0.75, 1.0, 0.0, 0.05, 0.05, 2.2, OAK), b(s * 0.75, 1.15, -0.95, 0.07, 0.5, 0.8, HULL, { m: true }),
    ...[-0.2, 0.5].map((z) => b(s * 0.75, 0.75, z, 0.05, 0.25, 0.05, OAK)), cx(s * 0.74, 0.58, 0.45, 0.1, 0.28, DARK), cx(s * 0.74, 0.58, -0.25, 0.1, 0.28, DARK),
    ...[0.3, 0.55, 0.8].map((y) => rod([s * 0.75, y, 1.15], [0, y, 1.42], 0.07, HULL, { m: true }))]),
  b(0, 0.9, -1.38, 1.5, 1.0, 0.06, HULL, { m: true }), b(0, 0.85, -0.95, 1.4, 0.05, 0.8, DECK), b(0, 0.55, -0.45, 0.6, 0.15, 0.2, OAK), b(0, 0.7, -0.55, 0.6, 0.15, 0.2, OAK),
  b(0, 0.4, 1.0, 0.7, 0.05, 0.5, DECK), rod([0, 0.75, 1.1], [0, 1.1, 1.46], 0.08, OAK),
  cy(0, 1.25, 0.15, 0.1, 2.3, WOOD), cy(0, 1.75, 0.15, 0.5, 0.06, WOOD), ...ring(8, 0.25, (x, z) => b(x, 1.85, 0.15 + z, 0.03, 0.2, 0.03, WOOD)),
  cx(0, 1.55, 0.15, 0.05, 1.3, WOOD), b(0, 1.15, 0.2, 1.2, 0.7, 0.03, CREAM, { m: true }), b(0, 2.25, -0.05, 0.02, 0.18, 0.3, BLACK), sp(0, 2.25, -0.05, 0.07, WHITE),
  cz(0, 1.15, -0.65, 0.35, 0.04, WOOD), cy(0, 0.7, -0.65, 0.06, 0.6, WOOD), sp(0, 1.15, -0.62, 0.07, GOLD),
], { tags: "outdoor garden kids child play boat ship pirate climbing frame" });

// ---------- sport and role play ----------
const hoop = (() => {
  const zc = -0.02;
  return gd("Basketball hoop on pole", 0.8, 1.8, 3.05, [
    b(0, 0.2, -0.45, 0.6, 0.4, 0.9, "#4a4d52"), b(0, 0.42, -0.45, 0.5, 0.04, 0.8, BLACK),
    cy(0, 1.5, -0.8, 0.1, 3.0, DARK), cy(0, 0.85, -0.8, 0.14, 0.3, BLUE), rod([0, 2.3, -0.8], [0, 2.7, -0.4], 0.05, DARK), rod([0, 2.75, -0.8], [0, 2.75, -0.4], 0.05, DARK),
    b(0, 2.75, -0.35, 0.8, 0.6, 0.04, WHITE, { m: true }), b(0, 2.67, -0.325, 0.3, 0.2, 0.01, RED), b(0, 2.75, -0.325, 0.78, 0.58, 0.005, "#d8dadd"),
    b(0, 2.55, -0.25, 0.04, 0.04, 0.12, ORG),
    ...ring(12, 0.225, (x, z) => b(x, 2.55, zc + 0.05 + z, 0.07, 0.025, 0.07, ORG)),
    ...ring(10, 0.225, (x, z) => rod([x, 2.55, zc + 0.05 + z], [x * 0.6, 2.2, zc + 0.05 + z * 0.6], 0.01, WHITE)),
    ...ring(10, 0.15, (x, z) => b(x, 2.37, zc + 0.05 + z, 0.05, 0.01, 0.05, WHITE)),
  ], { tags: "outdoor garden kids sport basket ball driveway net backboard" });
})();

const goal = (() => {
  const zf = 0.55, zb = -0.55;
  const slope = (y: number) => zf - ((zf - zb) * (2.05 - y)) / 2.0; // net surface z at height y
  return gd("Football goal 3 m", 3.0, 1.2, 2.1, [
    ...[-1, 1].flatMap((s) => [cy(s * 1.45, 1.025, zf, 0.1, 2.05, WHITE), b(s * 1.45, 0.03, 0, 0.06, 0.06, 1.1, WHITE), rod([s * 1.45, 2.0, zf], [s * 1.45, 0.05, zb], 0.05, WHITE)]),
    cx(0, 2.05, zf, 0.1, 3.0, WHITE), cx(0, 0.04, zb, 0.05, 2.9, WHITE),
    ...range(11).map((i) => rod([-1.35 + i * 0.27, 2.02, zf], [-1.35 + i * 0.27, 0.05, zb], 0.01, "#e4e6e8")),
    ...[0.3, 0.7, 1.1, 1.5, 1.9].map((y) => b(0, y, slope(y), 2.9, 0.01, 0.01, "#e4e6e8")),
    ...[-1, 1].flatMap((s) => [0.35, 0.75, 1.15, 1.55, 1.95].map((y) => b(s * 1.44, y, (zf + slope(y)) / 2, 0.01, 0.01, zf - slope(y) + 0.02, "#e4e6e8"))),
  ], { tags: "outdoor garden kids sport soccer football net posts" });
})();

const mudKitchen = gd("Mud kitchen for kids 1.1 m", 1.1, 0.5, 0.9, [
  ...[-1, 1].flatMap((sx) => [-1, 1].map((sz) => post(sx * 0.5, sz * 0.2, 0.6, WOOD, 0.06))),
  b(0, 0.62, 0, 1.1, 0.05, 0.5, OAK, { m: true }), b(0, 0.15, 0, 1.0, 0.03, 0.4, WOOD), b(-0.35, 0.33, 0.0, 0.32, 0.45, 0.4, WOOD, { m: true }),
  b(-0.35, 0.33, 0.21, 0.28, 0.4, 0.02, OAK), sp(-0.27, 0.33, 0.23, 0.03, GOLD),
  b(0.1, 0.665, 0.02, 0.36, 0.015, 0.3, STEEL), b(0.1, 0.675, 0.02, 0.3, 0.01, 0.24, "#7f8a92"), rod([0.1, 0.7, -0.15], [0.1, 0.85, -0.15], 0.025, STEEL), rod([0.1, 0.85, -0.15], [0.1, 0.85, -0.06], 0.025, STEEL),
  cy(0.42, 0.655, 0.0, 0.16, 0.02, DARK), cy(0.42, 0.655, 0.15, 0.12, 0.02, DARK), cy(0.42, 0.705, 0.0, 0.14, 0.08, STEEL), cy(0.42, 0.74, 0.0, 0.1, 0.02, SOIL),
  b(0, 0.775, -0.23, 1.1, 0.25, 0.04, GRN, { m: true }), b(0, 0.775, -0.205, 0.9, 0.18, 0.01, "#2f4a3a"),
  b(0, 0.5, -0.12, 0.96, 0.03, 0.24, WOOD), cy(-0.15, 0.55, -0.12, 0.1, 0.08, TERRA), cy(0.25, 0.55, -0.12, 0.12, 0.08, STEEL),
  ...[-0.4, -0.2, 0, 0.2, 0.4].map((x, i) => b(x, 0.78, -0.18, 0.02, 0.16 - (i % 2) * 0.04, 0.02, i % 2 ? STEEL : RED)),
], { tags: "outdoor garden kids child play kitchen pretend cooking sink" });

const paddling = gd("Paddling pool round 1.8 m", 1.8, 1.8, 0.45, [
  cy(0, 0.15, 0, 1.72, 0.3, BLUE, { m: true }), cy(0, 0.32, 0, 1.45, 0.02, WATER),
  ...ring(24, 0.78, (x, z) => sp(x, 0.34, z, 0.22, "#5aa0d8", { m: true })), ...ring(24, 0.78, (x, z) => sp(x, 0.12, z, 0.2, BLUE, { m: true })),
  cy(0.3, 0.335, 0.2, 0.16, 0.02, YEL), sp(0.3, 0.37, 0.2, 0.09, YEL), sp(0.3, 0.41, 0.24, 0.05, YEL), b(0.3, 0.39, 0.29, 0.04, 0.015, 0.03, ORG),
  cy(-0.35, 0.335, -0.2, 0.2, 0.02, RED), cy(-0.35, 0.345, -0.2, 0.08, 0.02, WATER),
], { tags: "outdoor garden kids child water summer pool inflatable splash" });

const eggChair = (() => {
  const Y = 1.93, S = sw(Y, 6, 10);
  return gd("Hanging egg chair with stand", 1.2, 1.2, 2.0, [
    b(0, 0.03, -0.05, 0.07, 0.06, 1.0, DARK), b(0, 0.03, -0.5, 0.9, 0.06, 0.07, DARK),
    rod([0, 0.03, -0.5], [0, 1.7, -0.45], 0.07, DARK), rod([0, 1.7, -0.45], [0, 1.96, -0.2], 0.07, DARK), rod([0, 1.96, -0.2], [0, 1.95, 0.1], 0.07, DARK),
    S(b(0, 1.6, 0.1, 0.03, 0.7, 0.03, ROPE)), S(b(0, 1.28, 0.1, 0.12, 0.04, 0.12, STEEL)),
    S(el(0, 0.76, 0.1, 0.95, 1.0, 0.85, "#7a6048", { m: true })), S(el(0, 0.78, 0.22, 0.7, 0.8, 0.5, CREAM, { m: true })), S(el(0, 0.45, 0.28, 0.55, 0.14, 0.45, GOLD, { m: true })), S(el(-0.1, 0.8, 0.12, 0.28, 0.3, 0.14, SKY)),
  ], { tags: "outdoor garden patio rattan hanging chair swing seat cocoon pod", wind: true });
})();

export const PLAY: Record<string, Def> = {
  gd_porch_swing_seat: porchSwing, gd_tree_swing: treeSwing, gd_tyre_swing: tyreSwing,
  gd_swing_set_double_aframe: swingA, gd_swing_set_double_slide: swingSlide, gd_swing_set_wood_glider: swingWood,
  gd_play_slide_freestanding: slideFree, gd_play_slide_tube: slideTube, gd_play_climbing_frame_rockwall: climbFrame,
  gd_play_monkey_bars: monkeyBars, gd_play_seesaw: seesaw, gd_play_spring_rider_horse: springRider,
  gd_play_sandbox_canopy: sandbox, gd_play_wendy_house: wendy, gd_play_treehouse: treehouse, gd_play_pirate_ship: pirate,
  gd_play_basketball_hoop: hoop, gd_play_football_goal: goal, gd_play_mud_kitchen: mudKitchen, gd_play_paddling_pool: paddling,
  gd_egg_chair_stand: eggChair,
};
