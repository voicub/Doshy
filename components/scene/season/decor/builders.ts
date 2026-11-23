import type { HolidayId } from "@/lib/season";
import { RAIL_TOP, decorSpots, type Anchors, type Mount } from "../anchors";
import { rngOf, type V3 } from "@/lib/mathUtil";
import { emptyBatch, strand, type Batch } from "./batch";

type DecorCtx = { a: Anchors; /** the garden environment is shown */ garden: boolean; /** it is snowing */ snowing: boolean };

const FLOOR = 0.06; // top of a floor slab
const SE = Math.PI / 4; // yaw that turns a +z facing part toward the isometric camera (plan south-east)
const TAU = Math.PI * 2;

const WARM = "#ffe2b0";
const XMAS = [WARM, "#ff4b3a", "#3cd37a", WARM];
const PASTEL = ["#f7b6c8", "#b8e3f2", "#fbe48f", "#c9f0c4", "#d9c3f4", "#ffd0a8"];

/** World position of a point on a mount: `s` along the wall, `y` height, `off` outward from the wall face. */
const onMount = (m: Mount, s: number, y: number, off: number): V3 => [m.x - m.ny * s + m.nx * off, y, m.y + m.nx * s + m.ny * off];
const yawOf = (m: Mount) => Math.atan2(m.nx, m.ny);

/** Lights along the top of every railing module, optionally with a separate set of colours. */
function railLights(b: Batch, a: Anchors, colors: string[], o: { sag?: number; step?: number; tw?: number } = {}) {
  a.rails.forEach((r, i) => {
    const hx = (r.dx * r.len) / 2, hz = (r.dy * r.len) / 2;
    strand(b, [r.x - hx, RAIL_TOP - 0.1, r.y - hz], [r.x + hx, RAIL_TOP - 0.1, r.y + hz], { colors, sag: o.sag ?? 0.07, step: o.step, tw: o.tw, phase: i * 2 });
  });
}

/** Lights tracing each window's frame on the outside face. */
function windowLights(b: Batch, a: Anchors, colors: string[], includeDoor = false) {
  const frames = includeDoor && a.entrance ? [...a.windows, a.entrance] : a.windows;
  frames.forEach((m, i) => {
    const hw = m.w / 2 + 0.04, y0 = m.sill - 0.02, y1 = m.sill + m.h + 0.04, off = 0.07;
    const opt = { colors, sag: 0.03, step: 0.2, phase: i * 3 };
    strand(b, onMount(m, -hw, y0, off), onMount(m, -hw, y1, off), { ...opt, sag: 0 });
    strand(b, onMount(m, -hw, y1, off), onMount(m, hw, y1, off), opt);
    strand(b, onMount(m, hw, y1, off), onMount(m, hw, y0, off), { ...opt, sag: 0 });
  });
}

// ---------------------------------------------------------------- christmas

function xmasTree(b: Batch, x: number, z: number, h: number, rnd: () => number, presents: boolean) {
  b.boxes.push({ p: [x, FLOOR + h * 0.06, z], s: [h * 0.07, h * 0.12, h * 0.07], c: "#5a3d28" });
  const tiers = 4, ht = h * 0.28, step = h * 0.19, y0 = FLOOR + h * 0.12;
  const green = ["#1f6b3a", "#1b6034", "#175529", "#2a7a44"];
  const radius = (i: number) => h * 0.3 * (1 - i * 0.2);
  for (let i = 0; i < tiers; i++) b.cones.push({ p: [x, y0 + i * step + ht / 2, z], s: [radius(i), ht, radius(i)], c: green[i] });
  const top = y0 + (tiers - 1) * step + ht;
  const orn = ["#d9302b", "#e8b53a", "#3a6fd9", "#e8e2d0"];
  const r = Math.max(0.022, h * 0.017);
  for (let k = 0; k < Math.round(h * 7); k++) {
    const i = (rnd() * tiers) | 0, f = 0.2 + rnd() * 0.5, a = rnd() * TAU, rad = radius(i) * (1 - f) * 1.04;
    b.spheres.push({ p: [x + Math.cos(a) * rad, y0 + i * step + f * ht, z + Math.sin(a) * rad], s: [r, r, r], c: orn[k % 4] });
  }
  // spiral of twinkling lights
  const n = Math.round(h * 15), lights = ["#ffd9a0", "#ff5a4a", "#5ad0ff", "#7aff9a"];
  let prev: V3 | null = null;
  for (let k = 0; k <= n; k++) {
    const t = k / n, a = t * 3.2 * TAU, rad = radius(0) * (1 - t) * 0.95 + 0.02;
    const p: V3 = [x + Math.cos(a) * rad, y0 + 0.02 + t * (top - y0 - 0.1), z + Math.sin(a) * rad];
    if (prev) b.wire.push(prev, p);
    prev = p;
    b.bulbs.push({ p, s: [Math.max(0.016, h * 0.012), Math.max(0.016, h * 0.012), Math.max(0.016, h * 0.012)], c: lights[k % 4], e: 2.4, ph: k * 2.1, tw: 0.6 });
  }
  // star: a glowing core and two crossed plates
  const sy = top + h * 0.03, s = h * 0.1;
  b.bulbs.push({ p: [x, sy, z], s: [h * 0.03, h * 0.03, h * 0.03], c: "#ffd060", e: 3.4, tw: 0.15, ph: 1 });
  b.glowBoxes.push({ p: [x, sy, z], s: [s, s, h * 0.015], r: [0, SE, 0], c: "#ffc850", e: 3 }, { p: [x, sy, z], s: [s, s, h * 0.015], r: [0, SE, SE], c: "#ffc850", e: 3 });
  if (!presents) return;
  const wrap = [["#c92a2a", "#f0c040"], ["#2a6fc9", "#f4f4f4"], ["#2aa05a", "#c92a2a"], ["#8a3ac9", "#f0c040"]];
  for (let k = 0; k < 4; k++) {
    const a = (k / 4) * TAU + 0.5 + rnd() * 0.4, d = h * 0.3 + rnd() * h * 0.06, w = h * (0.07 + rnd() * 0.05), ph = w * (0.7 + rnd() * 0.4);
    const px = x + Math.cos(a) * d, pz = z + Math.sin(a) * d, py = FLOOR + ph / 2, yaw = rnd() * TAU;
    b.boxes.push({ p: [px, py, pz], s: [w, ph, w], r: [0, yaw, 0], c: wrap[k][0] }, { p: [px, py, pz], s: [w * 1.04, ph * 1.04, w * 0.16], r: [0, yaw, 0], c: wrap[k][1] }, { p: [px, py, pz], s: [w * 0.16, ph * 1.04, w * 1.04], r: [0, yaw, 0], c: wrap[k][1] });
  }
}

function snowman(b: Batch, x: number, z: number) {
  const white = "#f2f6fa", y = 0.02;
  const ball = (r: number, cy: number) => b.spheres.push({ p: [x, y + cy, z], s: [r, r, r], c: white });
  ball(0.42, 0.4);
  ball(0.3, 0.98);
  ball(0.22, 1.42);
  const dir: V3 = [Math.SQRT1_2, 0, Math.SQRT1_2];
  const at = (d: number, side: number, cy: number): V3 => [x + dir[0] * d - dir[2] * side, y + cy, z + dir[2] * d + dir[0] * side];
  b.spheres.push({ p: at(0.2, 0.08, 1.47), s: [0.025, 0.025, 0.025], c: "#16181c" }, { p: at(0.2, -0.08, 1.47), s: [0.025, 0.025, 0.025], c: "#16181c" });
  for (const cy of [0.85, 1.0, 1.15]) b.spheres.push({ p: at(0.29, 0, cy), s: [0.03, 0.03, 0.03], c: "#16181c" });
  b.cones.push({ p: at(0.29, 0, 1.42), s: [0.035, 0.2, 0.035], r: [0, -SE, -Math.PI / 2], c: "#ff8a1f" });
  b.boxes.push(
    { p: [x, y + 1.24, z], s: [0.48, 0.07, 0.48], r: [0, SE, 0], c: "#c92a2a" },
    { p: [x, y + 1.61, z], s: [0.36, 0.03, 0.36], c: "#16181c" },
    { p: [x, y + 1.74, z], s: [0.22, 0.24, 0.22], c: "#16181c" },
    { p: [x - 0.5, y + 1.05, z + 0.1], s: [0.5, 0.03, 0.03], r: [0, 0.3, 0.5], c: "#5a3d28" },
    { p: [x + 0.5, y + 1.05, z - 0.1], s: [0.5, 0.03, 0.03], r: [0, 0.3, -0.5], c: "#5a3d28" },
  );
}

function wreath(b: Batch, m: Mount) {
  const yaw = yawOf(m), cy = Math.min(1.6, m.sill + m.h * 0.75), R = 0.27;
  const c = onMount(m, 0, cy, 0.06);
  b.tori.push({ p: c, s: [R, R, R], r: [0, yaw, 0], c: "#1f6b3a" });
  for (const side of [-1, 1]) b.boxes.push({ p: onMount(m, side * 0.05, cy - R, 0.1), s: [0.12, 0.05, 0.02], r: [0, yaw, side * 0.55], c: "#c92a2a" });
  b.spheres.push({ p: onMount(m, 0, cy - R, 0.1), s: [0.03, 0.03, 0.03], c: "#c92a2a" });
  for (let k = 0; k < 10; k++) {
    const a = (k / 10) * TAU;
    b.bulbs.push({ p: onMount(m, Math.cos(a) * R, cy + Math.sin(a) * R, 0.11), s: [0.014, 0.014, 0.014], c: XMAS[k % 4], e: 2.4, ph: k * 1.7, tw: 0.6 });
  }
}

function christmas(c: DecorCtx): Batch {
  const b = emptyBatch(), { a } = c, rnd = rngOf(1224);
  if (a.balcony) xmasTree(b, a.balcony.x + a.balcony.w - 0.42, a.balcony.y + 0.5, 0.95, rnd, true);
  railLights(b, a, XMAS);
  windowLights(b, a, XMAS.slice(0, 3));
  if (a.entrance) {
    wreath(b, a.entrance);
    windowLights(b, { ...a, windows: [], entrance: a.entrance }, [WARM, WARM, "#ffc070"], true);
  }
  if (c.garden) {
    const s = decorSpots(a.bounds);
    xmasTree(b, s.tree.x, s.tree.y, 3.1, rnd, true);
    if (c.snowing) snowman(b, s.snowman.x, s.snowman.y);
  }
  return b;
}

// ---------------------------------------------------------------- easter

function egg(b: Batch, x: number, y: number, z: number, i: number, k = 1) {
  b.spheres.push({ p: [x, y, z], s: [0.05 * k, 0.065 * k, 0.05 * k], r: [0, 0, (i % 3) * 0.3 - 0.3], c: PASTEL[i % PASTEL.length] });
}

function basket(b: Batch, x: number, z: number, seed: number, y = FLOOR) {
  b.boxes.push(
    { p: [x, y + 0.07, z], s: [0.32, 0.14, 0.22], c: "#a8743a" },
    { p: [x, y + 0.145, z], s: [0.35, 0.02, 0.25], c: "#c99a5a" },
  );
  b.tori.push({ p: [x, y + 0.15, z], s: [0.15, 0.15, 0.15], r: [0, 0, 0], c: "#a8743a" });
  for (let k = 0; k < 6; k++) egg(b, x + ((k % 3) - 1) * 0.085, y + 0.17 + (k > 2 ? 0.03 : 0), z + (k > 2 ? 0.05 : -0.04), seed + k, 1.1);
}

function chick(b: Batch, x: number, y: number, z: number, k = 1) {
  const yellow = "#ffd84a";
  b.spheres.push(
    { p: [x, y + 0.085 * k, z], s: [0.09 * k, 0.085 * k, 0.085 * k], c: yellow },
    { p: [x + 0.05 * k, y + 0.19 * k, z + 0.05 * k], s: [0.06 * k, 0.06 * k, 0.06 * k], c: yellow },
    { p: [x + 0.085 * k, y + 0.205 * k, z + 0.03 * k], s: [0.012 * k, 0.012 * k, 0.012 * k], c: "#16181c" },
    { p: [x + 0.04 * k, y + 0.205 * k, z + 0.085 * k], s: [0.012 * k, 0.012 * k, 0.012 * k], c: "#16181c" },
  );
  b.cones.push({ p: [x + 0.1 * k, y + 0.18 * k, z + 0.1 * k], s: [0.02 * k, 0.05 * k, 0.02 * k], r: [0, -SE, -Math.PI / 2], c: "#ff8a1f" });
}

function bunny(b: Batch, x: number, z: number) {
  const white = "#f4f1ea", y = 0.02;
  b.spheres.push(
    { p: [x, y + 0.16, z], s: [0.18, 0.16, 0.22], c: white },
    { p: [x + 0.08, y + 0.34, z + 0.08], s: [0.1, 0.1, 0.1], c: white },
    { p: [x - 0.1, y + 0.14, z - 0.16], s: [0.06, 0.06, 0.06], c: white },
    { p: [x + 0.15, y + 0.34, z + 0.15], s: [0.02, 0.02, 0.02], c: "#e89ab0" },
  );
  b.boxes.push({ p: [x + 0.04, y + 0.5, z + 0.04], s: [0.04, 0.22, 0.03], r: [0.12, 0, 0.12], c: white }, { p: [x + 0.12, y + 0.5, z + 0.12], s: [0.04, 0.22, 0.03], r: [-0.12, 0, -0.12], c: white });
}

function easter(c: DecorCtx): Batch {
  const b = emptyBatch(), { a } = c, rnd = rngOf(404);
  if (a.balcony) {
    const r = a.balcony;
    basket(b, r.x + 0.75, r.y + r.h * 0.55, 0);
    basket(b, r.x + r.w - 1.0, r.y + r.h * 0.6, 3);
    for (let k = 0; k < 4; k++) egg(b, r.x + 1.3 + k * 0.5, FLOOR + 0.065, r.y + 0.35 + rnd() * 0.5, k + 2);
    chick(b, r.x + 1.5, FLOOR, r.y + r.h * 0.7);
    chick(b, r.x + r.w - 0.55, FLOOR, r.y + 0.5, 0.9);
  }
  if (c.garden) {
    const { x0, y0, x1, y1 } = a.bounds;
    for (let k = 0; k < 18; k++) {
      // eggs scattered on the lawn within a few metres of the building
      const side = (rnd() * 4) | 0, t = rnd(), d = 0.9 + rnd() * 2.4;
      const x = side < 2 ? x0 + t * (x1 - x0) : side === 2 ? x0 - d : x1 + d;
      const z = side === 0 ? y0 - d : side === 1 ? y1 + d : y0 + t * (y1 - y0);
      egg(b, x, 0.08, z, k, 1.8);
    }
    const s = decorSpots(a.bounds);
    bunny(b, s.bunny.x, s.bunny.y);
    chick(b, s.bunny.x - 0.7, 0.02, s.bunny.y + 0.5, 1.4);
    chick(b, s.bunny.x - 1.0, 0.02, s.bunny.y - 0.1, 1.2);
    basket(b, s.bunny.x - 1.6, s.bunny.y + 1.4, 1, 0.02);
  }
  return b;
}

// ---------------------------------------------------------------- halloween

function pumpkin(b: Batch, x: number, y: number, z: number, k: number) {
  const face = (lx: number, ly: number, w: number, h: number) =>
    b.glowBoxes.push({ p: [x + Math.sin(SE) * 0.19 * k + Math.cos(SE) * lx * k, y + 0.165 * k + ly * k, z + Math.cos(SE) * 0.19 * k - Math.sin(SE) * lx * k], s: [w * k, h * k, 0.02 * k], r: [0, SE, 0], c: "#ffb030", e: 2.6 });
  b.spheres.push({ p: [x, y + 0.165 * k, z], s: [0.2 * k, 0.165 * k, 0.2 * k], c: "#e8731a" });
  b.boxes.push({ p: [x, y + 0.34 * k, z], s: [0.035 * k, 0.07 * k, 0.035 * k], r: [0, 0, 0.2], c: "#4a6b2a" });
  face(-0.07, 0.05, 0.055, 0.06);
  face(0.07, 0.05, 0.055, 0.06);
  face(0, -0.06, 0.15, 0.03);
  face(-0.045, -0.09, 0.04, 0.03);
  face(0.045, -0.09, 0.04, 0.03);
  b.bulbs.push({ p: [x, y + 0.16 * k, z], s: [0.05 * k, 0.05 * k, 0.05 * k], c: "#ff9a30", e: 3, tw: 0.5, ph: x * 7 });
  b.pools.push({ p: [x, y + 0.012, z], s: [1.3 * k, 1, 1.3 * k], c: "#ff7a1a", e: 0.55 });
}

function cobwebs(b: Batch, a: Anchors) {
  a.rails.forEach((r) => {
    const hx = (r.dx * r.len) / 2, hz = (r.dy * r.len) / 2;
    const corner: V3 = [r.x - hx, RAIL_TOP - 0.02, r.y - hz];
    const at = (s: number, down: number): V3 => [corner[0] + r.dx * s, corner[1] - down, corner[2] + r.dy * s];
    const tips: V3[] = [at(0.42, 0), at(0.36, 0.2), at(0.2, 0.3), at(0.05, 0.36)];
    tips.forEach((t) => b.wire.push(corner, t));
    for (const f of [0.4, 0.75]) tips.slice(0, -1).forEach((t, i) => b.wire.push(lerp(corner, t, f), lerp(corner, tips[i + 1], f)));
  });
}
const lerp = (a: V3, b: V3, t: number): V3 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

function halloween(c: DecorCtx): Batch {
  const b = emptyBatch("#aeb4c2"), { a } = c;
  if (a.balcony) {
    const r = a.balcony;
    pumpkin(b, r.x + 0.55, FLOOR, r.y + r.h - 0.5, 1.2);
    pumpkin(b, r.x + r.w - 0.6, FLOOR, r.y + r.h - 0.5, 1);
    pumpkin(b, r.x + r.w / 2, FLOOR, r.y + 0.45, 0.8);
    b.pools.push({ p: [r.x + r.w / 2, FLOOR + 0.01, r.y + r.h / 2], s: [r.w * 0.9, 1, r.h * 1.1], c: "#7a3ad9", e: 0.35 });
  }
  railLights(b, a, ["#ff8a1f", "#9a4bff", "#ff8a1f", "#ffb04a"], { tw: 0.45 });
  cobwebs(b, a);
  if (c.garden) {
    const s = decorSpots(a.bounds);
    s.pumpkins.forEach((p, i) => pumpkin(b, p.x, 0.02, p.y, i ? 1.7 : 2.1));
    pumpkin(b, s.snowman.x, 0.02, s.snowman.y, 1.3);
    pumpkin(b, s.bunny.x - 0.2, 0.02, s.bunny.y + 1.4, 0.9);
    b.pools.push({ p: [s.tree.x, 0.015, s.tree.y], s: [4.5, 1, 4.5], c: "#7a3ad9", e: 0.4 });
  }
  return b;
}

// ---------------------------------------------------------------- the rest

function valentine(c: DecorCtx): Batch {
  const b = emptyBatch("#3a2a30"), { a } = c;
  railLights(b, a, ["#ff6fa8", "#ffd0e0", "#ff3b6b"], { tw: 0.5 });
  windowLights(b, a, ["#ff6fa8", "#ffd0e0"]);
  if (a.balcony) b.pools.push({ p: [a.balcony.x + a.balcony.w / 2, FLOOR + 0.01, a.balcony.y + a.balcony.h / 2], s: [a.balcony.w * 1.3, 1, a.balcony.h * 1.5], c: "#ff4f8e", e: 0.5 });
  return b;
}

function martisor(c: DecorCtx): Batch {
  const b = emptyBatch(), { a } = c, rnd = rngOf(301);
  const red = "#d4202a", white = "#f4f4f4";
  a.rails.forEach((r, ri) => {
    const hx = (r.dx * r.len) / 2, hz = (r.dy * r.len) / 2, n = Math.max(6, Math.round(r.len / 0.05));
    for (let k = 0; k <= n; k++) {
      const t = k / n, ang = k * 0.9;
      for (const strandIdx of [0, 1]) {
        const ph = ang + strandIdx * Math.PI;
        b.spheres.push({ p: [r.x - hx + 2 * hx * t - r.dy * Math.cos(ph) * 0.025, 1.02 + Math.sin(ph) * 0.025, r.y - hz + 2 * hz * t + r.dx * Math.cos(ph) * 0.025], s: [0.02, 0.02, 0.02], c: strandIdx ? white : red });
      }
    }
    for (const t of [0.15, 0.5, 0.85]) {
      const x = r.x - hx + 2 * hx * t, z = r.y - hz + 2 * hz * t;
      b.boxes.push({ p: [x, 0.92, z], s: [0.04, 0.11, 0.04], c: ri % 2 ? white : red }, { p: [x + r.dy * 0.04, 0.88, z - r.dx * 0.04], s: [0.035, 0.1, 0.035], c: ri % 2 ? red : white });
    }
  });
  const drop = (x: number, y: number, z: number, k: number) => {
    b.boxes.push({ p: [x, y + 0.09 * k, z], s: [0.012 * k, 0.18 * k, 0.012 * k], c: "#4a8a3a" }, { p: [x + 0.02, y + 0.05 * k, z], s: [0.012, 0.12 * k, 0.012], r: [0, 0, -0.3], c: "#4a8a3a" });
    b.spheres.push({ p: [x, y + 0.17 * k, z], s: [0.024 * k, 0.034 * k, 0.024 * k], c: white });
  };
  if (a.balcony) {
    const r = a.balcony, px = r.x + 0.8, pz = r.y + 0.45;
    b.boxes.push({ p: [px, FLOOR + 0.09, pz], s: [0.9, 0.18, 0.24], c: "#7a5638" });
    for (let k = 0; k < 9; k++) drop(px - 0.38 + k * 0.095, FLOOR + 0.18, pz + (rnd() - 0.5) * 0.12, 1.1);
  }
  if (c.garden) {
    const { x0, y0, x1, y1 } = a.bounds;
    for (let g = 0; g < 12; g++) {
      const side = g % 4, t = rnd(), d = 1 + rnd() * 3.5;
      const cx = side < 2 ? x0 + t * (x1 - x0) : side === 2 ? x0 - d : x1 + d;
      const cz = side === 0 ? y0 - d : side === 1 ? y1 + d : y0 + t * (y1 - y0);
      for (let k = 0; k < 6; k++) drop(cx + (rnd() - 0.5) * 0.5, 0.01, cz + (rnd() - 0.5) * 0.5, 1 + rnd() * 0.4);
    }
  }
  return b;
}

function nationalDay(c: DecorCtx): Batch {
  const b = emptyBatch("#2b2f36"), { a } = c;
  const tri = ["#2a52d6", "#fcd116", "#ce1126"];
  railLights(b, a, tri, { tw: 0.35 });
  windowLights(b, a, tri, true);
  return b;
}

function newYear(c: DecorCtx): Batch {
  const b = emptyBatch("#2b2f36"), { a } = c;
  railLights(b, a, ["#ffd060", "#fff1d0", "#ffd060", "#c0c8d8"], { tw: 0.5 });
  windowLights(b, a, ["#ffd060", "#fff1d0"]);
  return b;
}

const BUILDERS: Record<HolidayId, (c: DecorCtx) => Batch> = { CHRISTMAS: christmas, EASTER: easter, HALLOWEEN: halloween, VALENTINE: valentine, MARTISOR: martisor, NATIONAL_DAY: nationalDay, NEW_YEAR: newYear };

const GROUPS = ["boxes", "cones", "spheres", "tori", "bulbs", "glowBoxes", "pools"] as const;

/**
 * The decor group is raised with the flat; lawn pieces (every builder appends them last, behind the `garden` flag) are lowered
 * by `elev` so they stand on the ground.
 */
export function buildHolidayAt(id: HolidayId, c: DecorCtx, elev: number): Batch {
  const full = BUILDERS[id](c);
  if (!c.garden || !elev) return full;
  const base = BUILDERS[id]({ ...c, garden: false });
  for (const g of GROUPS) for (const p of full[g].slice(base[g].length)) p.p[1] -= elev;
  return full;
}
