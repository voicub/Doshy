import { Mesh, roundPolyline } from "./carBuilder.ts";
import { clamp, lerp, type V3 } from "./mathUtil.ts";
import type { Frame } from "./carFrame.ts";
import { type Ctx, type Pt, mirrored, oneSide, patch, rod, strip } from "./carSurf.ts";

// Everything that sits on the body sides and roof: glass, window frames, rails, mirrors, wipers, spoiler, shut lines, handles,
// sill cladding and wheel-arch mouldings, charge flap, the pickup bed and the convertible cockpit. Written for the left side, mirrored.

export const BLACK: V3 = [0.011, 0.012, 0.014];
export const GREY: V3 = [0.03, 0.032, 0.035];
export const CHROME: V3 = [0.82, 0.84, 0.87];
export const AMBER: V3 = [1, 0.5, 0.06];
const RAIL: V3 = [0.62, 0.64, 0.67];
const SEAT: V3 = [0.04, 0.042, 0.047];
const FLOOR: V3 = [0.016, 0.017, 0.019];
const ARCH: V3 = [0.02, 0.021, 0.023]; // unpainted black plastic arch flares

const zRange = (zs: number[], a: number, b: number) => zs.filter((z) => z >= a - 1e-9 && z <= b + 1e-9);

/** Height of the black sill cladding: the body style's, scaled by the design on the cars that wear heavy cladding (SUVs, crossovers, pickups). */
const claddingOf = (f: Frame): number => f.st.clad * (f.st.clad > 0.1 ? 0.55 + 0.45 * f.d.cladding : 1);

// ---------------------------------------------------------------------------------------------------------------- glasshouse

const SILL = 0.06; // side glass starts this far above the shoulder line
const HEADER = 0.085; // and stops this far below the roof edge

function sideWindows(c: Ctx) {
  const { f, surf, glass, black } = c;
  const lo = (z: number) => f.sec(z).ysh + SILL;
  const hi = (z: number) => {
    const s = f.sec(z);
    return s.yt - s.crown - HEADER;
  };
  let zMin = Infinity;
  let zMax = -Infinity;
  for (let z = f.zRb - 0.1; z <= f.zWb + 0.1; z += 0.01) {
    if (hi(z) - lo(z) > 0.05) {
      zMin = Math.min(zMin, z);
      zMax = Math.max(zMax, z);
    }
  }
  if (zMax < zMin) return;
  const zr = Math.max(zMin, f.zRt + (f.zWt - f.zRt) * f.st.blind);
  if (zMax - zr < 0.15) return;
  const ranges: [number, number][] = f.st.doors === 4 && f.zB > zr + 0.25 && f.zB < zMax - 0.25 ? [[zr, f.zB - 0.045], [f.zB + 0.045, zMax]] : [[zr, zMax]];
  const win = (a: number, b: number, ex: number, m: Mesh, off: number, color?: V3) => {
    const nz = Math.max(3, Math.ceil((b - a) / (c.q ? 0.25 : 0.09)));
    const rows: Pt[][] = [];
    for (let k = 0; k <= nz; k++) {
      const z = lerp(a - ex, b + ex, k / nz);
      const y0 = lo(z) - ex;
      const y1 = Math.max(y0 + 0.002, hi(z) + ex);
      rows.push([0, 1, 2].map((v) => surf.sideAt(z, lerp(y0, y1, v / 2))));
    }
    patch(m, rows, off, color);
  };
  mirrored(c, () => {
    win(zr, zMax, f.d.pillars === "black" ? 0.06 : 0.016, black, 0.005, BLACK); // frame, which is also the B pillar (and all the pillars when they are black)
    for (const [a, b] of ranges) win(a, b, 0, glass, 0.008);
    if (f.d.windowTrim === "chrome") strip(c.chrome, Array.from({ length: 8 }, (_, k) => surf.sideAt(lerp(zr, zMax, k / 7), lo(lerp(zr, zMax, k / 7)) - 0.014)), 0.012, 0.0055, CHROME);
  });
}

/** Windscreen or rear glass lying on the top surface between two z. */
function screen(c: Ctx, za: number, zb: number, ex: number, m: Mesh, off: number, color?: V3) {
  const { f, surf } = c;
  const nz = c.q ? 4 : 9;
  const rows: Pt[][] = [];
  for (let k = 0; k <= nz; k++) {
    const z = lerp(za - ex, zb + ex, k / nz);
    const xg = Math.max(0.05, f.sec(z).wt - 0.075 + ex);
    rows.push([0, 1, 2, 3, 4].map((v) => surf.topAt(z, (xg * v) / 4)));
  }
  patch(m, rows, off, color);
}

/** A convertible's windscreen: glass in a thin frame standing on the cowl. */
function openWindscreen(c: Ctx) {
  const { f, glass, paint, black } = c;
  const base = c.surf.topAt(f.zWb, 0).p[1];
  const half = f.W / 2 - 0.16;
  const topHalf = half - 0.05;
  const yTop = f.H - 0.015; // the top bar of the frame (0.03 thick) ends exactly at the car's height
  const zTop = f.zWb - f.ws * (yTop - base);
  mirrored(c, () => {
    glass.grid([[[0, base + 0.004, f.zWb], [half, base + 0.004, f.zWb]], [[0, yTop, zTop], [topHalf, yTop, zTop]]], [0, f.ws, 1]);
    rod(paint, [half + 0.005, base, f.zWb], [topHalf + 0.005, yTop, zTop], 0.014, 6);
  });
  paint.box([0, yTop, zTop], [2 * topHalf, 0.03, 0.04]);
  black.box([0, base + 0.01, f.zWb + 0.01], [2 * half, 0.02, 0.04], BLACK);
}

export function glasshouse(c: Ctx) {
  const { f, glass, black } = c;
  if (f.open === "cockpit") return openWindscreen(c);
  sideWindows(c);
  mirrored(c, () => {
    screen(c, f.zWt + 0.035, f.zWb - 0.03, 0.02, black, 0.005, BLACK);
    screen(c, f.zWt + 0.035, f.zWb - 0.03, 0, glass, 0.008);
    if (f.s.bodyStyle !== "van" && f.zRt - f.zRb > 0.04) {
      screen(c, f.zRb + 0.03, f.zRt - 0.035, 0.02, black, 0.005, BLACK);
      screen(c, f.zRb + 0.03, f.zRt - 0.035, 0, glass, 0.008);
    }
  });
  // wipers
  const xg = f.sec(f.zWb - 0.05).wt - 0.1;
  mirrored(c, () => {
    const pts = [[0.08, f.zWb - 0.02], [xg * 0.5, f.zWb - 0.032], [xg, f.zWb - 0.05]].map(([x, z]) => c.surf.topAt(z, x));
    strip(black, pts, 0.012, 0.007, BLACK);
  });
}

export function roofFittings(c: Ctx) {
  const { f, surf, black, chrome, paint } = c;
  const roofAt = (z: number, x: number) => surf.topAt(z, x).p[1];
  if (!f.open) {
    if (f.rails) {
      const z0 = f.zRt + 0.15;
      const z1 = f.zWt - 0.15;
      const x = f.sec((z0 + z1) / 2).wt * 0.72;
      mirrored(c, () => {
        const r = 0.0135;
        const hs = [z0, z1].map((z) => roofAt(z, x));
        const hi = Math.max(...hs);
        const ys = hs.map((h) => f.H - 0.005 - r - (hi - h)); // the highest end puts the rail's top at the car's height; it follows the roof where it dips
        rod(chrome, [x, ys[0], z0], [x, ys[1], z1], r, c.q ? 4 : 6, RAIL);
        [z0, z1].forEach((z, k) => black.box([x, (hs[k] + ys[k] - r) / 2, z], [0.03, ys[k] - r - hs[k] + 0.012, 0.04], BLACK));
      });
    }
    const zf = f.zRt + (f.zWt - f.zRt) * 0.25;
    black.ellipsoid([0, roofAt(zf, 0), zf], [0.014, 0.014, 0.055], 8, 4, BLACK); // shark-fin antenna, flush with the roof so the car keeps its height
  }
  if (f.s.spoiler ?? f.s.bodyStyle === "sports") {
    const y = f.deckY + 0.13;
    paint.box([0, y, f.zR + 0.2], [f.W * 0.78, 0.03, 0.22]);
    mirrored(c, () => black.box([f.W * 0.3, y - 0.07, f.zR + 0.2], [0.03, 0.12, 0.05], BLACK));
  }
}

export function mirrorsAndWipers(c: Ctx) {
  const { f, surf, paint, black, glass } = c;
  const zM = f.zWb - f.ws * (f.belt + 0.06 - f.hoodTop) - 0.06;
  const hx = f.W / 2 + 0.075;
  const hy = f.belt + 0.08;
  const hz = zM - 0.03;
  mirrored(c, () => {
    const root = surf.sideAt(zM, f.belt + 0.03).p;
    rod(black, [root[0] - 0.01, root[1], root[2]], [hx - 0.03, hy - 0.02, hz + 0.02], 0.012, 5, BLACK);
    paint.ellipsoid([hx, hy, hz], [0.052, 0.062, 0.1], c.q ? 8 : 12, c.q ? 4 : 8);
    glass.ellipsoid([hx - 0.004, hy, hz - 0.096], [0.044, 0.05, 0.006], 8, 3);
  });
}

// ---------------------------------------------------------------------------------------------------------------- body sides

/** Black sill cladding under the doors and, on cars with flared cladding, the wheel-arch mouldings. Draws one side. */
function sillAndArches(c: Ctx, clad: number) {
  const { f, surf, black } = c;
  const flare = clad > 0.1;
  const col = flare ? ARCH : BLACK;
  const zs = zRange(surf.zs, f.zR + 0.14, f.zF - 0.14);
  const rows = zs.map((z) => {
    const s = f.sec(z);
    const y0 = s.yb + s.n + 0.004;
    const y1 = Math.max(y0 + 0.002, s.yb + clad);
    return [0, 1, 2].map((v) => surf.sideAt(z, lerp(y0, y1, v / 2)));
  });
  patch(black, rows, 0.007, col);
  if (!flare) return;
  for (const a of [f.axleF, f.axleR]) {
    const rm = f.Ra + 0.032;
    const phiM = Math.acos(clamp((f.gc + 0.05 - f.R) / rm, -1, 1));
    const n = c.q ? 8 : 14;
    const pts = Array.from({ length: n + 1 }, (_, k) => {
      const phi = -phiM + (2 * phiM * k) / n;
      return surf.sideAt(a + rm * Math.sin(phi), f.R + rm * Math.cos(phi));
    });
    strip(black, pts, 0.075, 0.009, col);
  }
}

/** Shut lines and door handles. Draws one side. */
function shutLines(c: Ctx) {
  const { f, surf, black } = c;
  f.seams.forEach((z, k) => {
    const s = f.sec(z);
    const y0 = Math.max(f.gc + 0.1, s.yb + s.n + 0.04);
    const y1 = s.ysh + SILL - 0.016;
    strip(black, [0, 1, 2, 3].map((v) => surf.sideAt(z, lerp(y0, y1, v / 3))), 0.007, 0.004, BLACK);
    if (k < f.seams.length - 1) {
      const hp = surf.sideAt(z - 0.17, s.ysh - 0.05);
      black.box([hp.p[0] + hp.n[0] * 0.008, hp.p[1], hp.p[2]], [0.014, 0.022, 0.11], BLACK);
    }
  });
}

/** The two bonnet shut lines: one along the edge, one across the front. Draws one side. */
function bonnetLines(c: Ctx) {
  const { f, surf, black } = c;
  const xh = f.sec(f.zWb + 0.3).wt - 0.06;
  const z0 = f.zWb + 0.04;
  const z1 = f.zF - f.noseLen - 0.03;
  const along = Array.from({ length: 6 }, (_, k) => surf.topAt(lerp(z0, z1, k / 5), xh));
  strip(black, along, 0.006, 0.004, BLACK);
  strip(black, [0, 1, 2, 3].map((k) => surf.topAt(z1, (xh * k) / 3)), 0.006, 0.004, BLACK);
}

/** The charge flap outline on the rear wing, on the side of the car's charge port. */
function chargeFlap(c: Ctx, port: "l" | "r") {
  const { f, surf, black } = c;
  oneSide(c, port === "l", () => {
    const [za, zb] = [f.zR + 0.4, f.zR + 0.56];
    const s = f.sec(za);
    const [ya, yb] = [s.ysh - 0.2, s.ysh - 0.1];
    const line = (pa: [number, number], pb: [number, number]) => strip(black, [0, 1, 2].map((k) => surf.sideAt(lerp(pa[0], pb[0], k / 2), lerp(pa[1], pb[1], k / 2))), 0.006, 0.0025, BLACK);
    line([za, ya], [zb, ya]);
    line([za, yb], [zb, yb]);
    line([za, ya], [za, yb]);
    line([zb, ya], [zb, yb]);
  });
}

/** Sill cladding, wheel-arch mouldings, shut lines, door handles, charge flap, bonnet lines, tow bar. */
export function sideTrim(c: Ctx) {
  const { f, black } = c;
  const clad = claddingOf(f);
  mirrored(c, () => {
    sillAndArches(c, clad);
    shutLines(c);
    if (!f.open || f.open === "bed") bonnetLines(c);
  });
  if (f.s.fuel === "ev") {
    const port = f.s.port ?? "r";
    c.info.chargePort = port;
    if (port !== "f") chargeFlap(c, port);
  }
  if (f.s.tow) {
    black.box([0, f.gc * 0.6, f.zR + 0.12], [0.06, 0.05, 0.2], BLACK);
    c.chrome.ellipsoid([0, f.gc * 0.6 + 0.06, f.zR + 0.05], [0.025, 0.025, 0.025], 8, 5, CHROME);
  }
}

// ---------------------------------------------------------------------------------------------------------------- pickup bed, convertible cockpit

/** A rounded wall standing on the body along z, following the plan rounding of the ends. */
function wall(c: Ctx, z0: number, z1: number, inset: number, yTop: number) {
  const { f, surf, paint } = c;
  const zs = zRange(surf.zs, z0, z1);
  const rows = zs.map((z) => {
    const s = f.sec(z);
    const xo = s.xs * s.cw;
    const xi = Math.max(0, xo - inset);
    const poly = roundPolyline([[xo, s.ysh - 0.1], [xo, yTop], [xi, yTop], [xi, s.ysh - 0.1]], [0, 0.025, 0.025, 0], [1, 3, 3, 1]);
    return poly.map(([x, y]): V3 => [x, y, z]);
  });
  paint.grid(rows, (p) => [p[0] - (f.W / 2 - inset / 2), p[1] - (yTop - 0.1), 0]);
}

export function openBody(c: Ctx) {
  const { f, surf, black } = c;
  if (!f.open) return;
  if (f.open === "bed") {
    mirrored(c, () => wall(c, f.zR, f.zRb, 0.07, f.belt - 0.02));
    const zs = zRange(surf.zs, f.zR + 0.05, f.zRb - 0.02);
    mirrored(c, () => {
      const rows = zs.map((z) => {
        const s = f.sec(z);
        const xm = Math.max(0.02, s.xs * s.cw - 0.09);
        return [0, 1, 2].map((k) => surf.topAt(z, (xm * k) / 2));
      });
      patch(black, rows, 0.004, FLOOR);
    });
    return;
  }
  // convertible: door tops, dark floor, two seats
  mirrored(c, () => wall(c, f.zRb + 0.05, f.zWb - 0.05, 0.06, f.belt));
  const zs = zRange(surf.zs, f.zRb + 0.12, f.zWb - 0.12);
  mirrored(c, () => {
    const rows = zs.map((z) => {
      const s = f.sec(z);
      const xm = s.xs * s.cw - 0.08;
      return [0, 1, 2].map((k) => surf.topAt(z, (xm * k) / 2));
    });
    patch(black, rows, 0.004, FLOOR);
    const zs0 = f.zWb - 0.78;
    black.box([f.W * 0.22, f.cockY + 0.07, zs0], [0.46, 0.12, 0.5], SEAT);
    black.box([f.W * 0.22, f.cockY + 0.3, zs0 - 0.27], [0.46, 0.4, 0.1], SEAT);
  });
}
