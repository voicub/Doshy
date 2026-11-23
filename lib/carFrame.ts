import type { BodyStyle, CarSpec, Roofline, WheelStyle } from "./cars.ts";
import type { Resolved } from "./carDesign.ts";
import { roundPolyline, smooth } from "./carBuilder.ts";
import { clamp, lerp } from "./mathUtil.ts";
import { profileFor } from "./carProfiles.ts";

// The side-view and plan-view skeleton of one car: key heights and lengths from the spec plus the body-style defaults, the roofline as a
// rounded profile, and `sec(z)`: the cross-section of the body at any point along the length. lib/carGeometry.ts lofts those sections into a mesh.
// Metres, local coords: centred on the footprint, front = +z, the car's left side = +x, y up.

export type Style = {
  belt: number; // beltline height / car height
  hood: number; // bonnet length / car length
  ws: number; // windscreen rake: run / rise
  rr: number; // rear window rake: run / rise
  roof: Roofline;
  trunk?: number; // boot length / car length (notchback)
  clear: number; // ground clearance
  wheel: number; // wheel diameter
  share: number; // share of the overhang in front of the front axle
  blind: number; // share of the side glass at the back that is solid (C pillar, cargo box)
  nose: number; // drop of the front end below the bonnet line
  clad: number; // height of the black sill / arch cladding
  tum: number; // how much narrower the roof is than the shoulders, per side, as a share of the width
  doors: 2 | 4;
  rails?: true;
  steel?: true; // steel wheels by default
};

export const STYLES: Record<BodyStyle, Style> = {
  hatchback: { belt: 0.66, hood: 0.26, ws: 1.45, rr: 0.8, roof: "flat", clear: 0.14, wheel: 0.62, share: 0.56, blind: 0.22, nose: 0.07, clad: 0.07, tum: 0.11, doors: 4 },
  sedan: { belt: 0.67, hood: 0.29, ws: 1.5, rr: 1.3, roof: "notchback", trunk: 0.2, clear: 0.14, wheel: 0.65, share: 0.55, blind: 0.1, nose: 0.07, clad: 0.07, tum: 0.12, doors: 4 },
  estate: { belt: 0.66, hood: 0.27, ws: 1.45, rr: 0.25, roof: "flat", clear: 0.15, wheel: 0.65, share: 0.55, blind: 0.2, nose: 0.06, clad: 0.08, tum: 0.11, doors: 4, rails: true },
  suv: { belt: 0.68, hood: 0.25, ws: 1.15, rr: 0.3, roof: "flat", clear: 0.2, wheel: 0.74, share: 0.55, blind: 0.22, nose: 0.02, clad: 0.16, tum: 0.09, doors: 4, rails: true },
  crossover: { belt: 0.67, hood: 0.26, ws: 1.25, rr: 0.55, roof: "flat", clear: 0.18, wheel: 0.68, share: 0.55, blind: 0.22, nose: 0.04, clad: 0.14, tum: 0.1, doors: 4, rails: true },
  coupe: { belt: 0.66, hood: 0.33, ws: 1.8, rr: 2, roof: "fastback", clear: 0.12, wheel: 0.66, share: 0.5, blind: 0.28, nose: 0.09, clad: 0.07, tum: 0.14, doors: 2 },
  convertible: { belt: 0.7, hood: 0.34, ws: 1.8, rr: 1, roof: "notchback", trunk: 0.17, clear: 0.11, wheel: 0.64, share: 0.5, blind: 0, nose: 0.08, clad: 0.07, tum: 0.12, doors: 2 },
  pickup: { belt: 0.64, hood: 0.27, ws: 1.0, rr: 0.1, roof: "flat", clear: 0.22, wheel: 0.8, share: 0.5, blind: 0.2, nose: 0.03, clad: 0.14, tum: 0.1, doors: 4 },
  van: { belt: 0.52, hood: 0.14, ws: 0.8, rr: 0.05, roof: "flat", clear: 0.17, wheel: 0.7, share: 0.5, blind: 0.7, nose: 0.02, clad: 0.08, tum: 0.05, doors: 2, steel: true },
  minivan: { belt: 0.63, hood: 0.2, ws: 1.0, rr: 0.25, roof: "flat", clear: 0.15, wheel: 0.66, share: 0.55, blind: 0.16, nose: 0.04, clad: 0.08, tum: 0.07, doors: 4 },
  microcar: { belt: 0.62, hood: 0.08, ws: 0.45, rr: 0.1, roof: "flat", clear: 0.13, wheel: 0.5, share: 0.5, blind: 0.1, nose: 0.03, clad: 0.06, tum: 0.07, doors: 2, steel: true },
  sports: { belt: 0.63, hood: 0.37, ws: 2.0, rr: 2.2, roof: "fastback", clear: 0.1, wheel: 0.68, share: 0.5, blind: 0.3, nose: 0.1, clad: 0.06, tum: 0.15, doors: 2 },
};

export const RAIL_H = 0.035;
const ROOF_T = 0.06;
const SILL_R = 0.04; // radius of the rolled lower edge
const PLAN_P = 2.6; // squareness of the rounded nose / tail in plan view
const CAB_LIFT = 0.04; // the shoulder line sits this far below the top of a bonnet or boot lid
const ARCH_GAP = 0.05; // clearance between the tyre and the wheel arch

/** The cross-section of the body at one z. x values are before the plan-view rounding `cw` of the nose and tail. */
export type Sec = {
  z: number;
  cw: number; // 0..1 plan-view closure of the nose / tail: scales every x
  yb: number; // underbody height (rises at the bumpers)
  n: number; // height of the wheel-arch cut at this z (0 = none)
  xi: number; // inner wall of the wheel well
  wb: number; // half width at the rolled sill
  wm: number; // half width at mid-height: the widest point
  ym: number;
  xs: number; // half width of the shoulder line
  ysh: number; // shoulder line height
  wt: number; // half width of the roof / bonnet edge
  yt: number; // height of the top on the centre line
  crown: number; // how much lower the top edge is than the centre line
  k: number; // 0 on the bonnet and boot lid, 1 on the roof
  dip: number; // how far the centre line of the bonnet lies below its two ridges
  rsh: number;
  rt: number;
};

export interface Frame {
  s: CarSpec;
  st: Style;
  L: number; W: number; H: number;
  rails: boolean;
  open: "bed" | "cockpit" | undefined;
  gc: number; belt: number; hoodTop: number; noseTop: number; roofTop: number; glassTop: number; deckY: number; floorY: number; cockY: number;
  zF: number; zR: number; zWb: number; zWt: number; zRb: number; zRt: number; zB: number; noseLen: number;
  ws: number; rr: number;
  D: number; R: number; Ra: number; tw: number; xiFull: number;
  axleF: number; axleR: number;
  ef: number; er: number; // length of the rounded nose and tail
  wheels: WheelStyle;
  seams: number[];
  tipTop: [number, number]; // [front, rear] height of the top at the very ends
  endTop: [number, number]; // the same 3 cm inside the end, where the lights sit
  d: Resolved;
  sec: (z: number) => Sec;
  stations: (q: 0 | 1) => number[];
  top: (z: number) => number;
  archEdge: (axle: number) => number; // half length of the arch cut at the underbody line
  lean: (z: number, y: number) => number; // set-back of the upper nose at this z and height, metres
}

/** Linear interpolation on a polyline sorted by x. */
function evalPoly(poly: [number, number][], x: number): number {
  let lo = 0;
  let hi = poly.length - 1;
  if (x <= poly[0][0]) return poly[0][1];
  if (x >= poly[hi][0]) return poly[hi][1];
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (poly[mid][0] <= x) lo = mid;
    else hi = mid;
  }
  const [x0, y0] = poly[lo];
  const [x1, y1] = poly[hi];
  return x1 === x0 ? y1 : y0 + ((y1 - y0) * (x - x0)) / (x1 - x0);
}

const LIFT_F = 0.09; // how far the underbody rises at the front bumper
const LIFT_R = 0.07; // and at the rear one

/** Key heights, lengths and wheel sizes of one car: the spec, the body-style defaults and the profile table combined. */
function frameDims(ds: Resolved): Dims {
  const s = ds.spec;
  const st = STYLES[s.bodyStyle];
  const { length: L, width: W, height: H, wheelbase: WB } = s;
  const roofline = s.roof ?? st.roof;
  const rails = (s.rails ?? !!st.rails) && s.bodyStyle !== "pickup" && s.bodyStyle !== "convertible";
  const open = s.bodyStyle === "pickup" ? "bed" : s.bodyStyle === "convertible" ? "cockpit" : undefined;
  const gc = s.clearance ?? st.clear;
  const belt = H * (s.belt ?? st.belt);
  const hoodTop = belt - 0.03;
  const roofTop = H - (rails ? RAIL_H : 0);
  const glassTop = roofTop - ROOF_T;
  const zF = L / 2;
  const zR = -L / 2;
  const prof = profileFor(s, roofline);
  const zWb = zF - prof.wb * L;
  const zWt = zF - prof.wt * L;
  const zPk = Math.min(zF - prof.pk * L, zWt - 0.05);
  const zRt = Math.min(zF - prof.rt * L, zPk - 0.15);
  const zRb = Math.max(zF - prof.rb * L, zR + 0.02, zRt - 0.9);
  const ws = (zWb - zWt) / Math.max(0.1, glassTop - hoodTop);
  const rr = Math.abs(zRb - zRt) / Math.max(0.1, glassTop - (roofline === "flat" ? belt : belt - 0.03));
  const deckY = roofline === "flat" ? belt : belt - 0.03;
  const axleF = zF - (L - WB) * (s.overhang ?? st.share);
  const axleR = axleF - WB;
  const zB = zWb - clamp(0.42 * (zWb - zRb), 0.9, 1.25);
  const D = Math.min(s.wheel ?? st.wheel, 2 * (Math.min(zF - axleF, axleR - zR) - 0.02 - ARCH_GAP)); // the arch must fit inside the overhangs
  const R = D / 2;
  const noseTop = hoodTop - st.nose;
  return {
    s, st, L, W, H, roofline, rails, open, gc, belt, hoodTop, roofTop, glassTop, deckY, prof,
    zF, zR, zWb, zWt, zPk, zRt, zRb, ws, rr, axleF, axleR, zB, D, R, Ra: R + ARCH_GAP, noseTop,
    tw: clamp(W * 0.115, 0.15, 0.3),
    floorY: belt - 0.22,
    cockY: belt - 0.25,
    noseLen: Math.min(0.34, 0.6 * (zF - zWb)),
    ef: Math.min(0.36, L * prof.noseR),
    er: Math.min(0.32, L * prof.tailR),
    tum: (s.tumble ?? prof.tum) * W,
  };
}
type Dims = {
  s: CarSpec; st: Style; L: number; W: number; H: number; roofline: Roofline; rails: boolean; open: "bed" | "cockpit" | undefined;
  gc: number; belt: number; hoodTop: number; roofTop: number; glassTop: number; deckY: number; prof: { dropF: number; dropR: number; taperF: number; taperR: number };
  zF: number; zR: number; zWb: number; zWt: number; zPk: number; zRt: number; zRb: number; ws: number; rr: number;
  axleF: number; axleR: number; zB: number; D: number; R: number; Ra: number; noseTop: number; tw: number;
  floorY: number; cockY: number; noseLen: number; ef: number; er: number; tum: number;
};

/** Side-view profile of the top line: control points and corner radii per body type, rounded, with the roof peak lifted back to the exact roof height. */
function topProfile(g: Dims): [number, number][] {
  const { open, zF, zR, zWb, zWt, zPk, zRt, zRb, hoodTop, roofTop, deckY, floorY, cockY, noseTop, noseLen, prof, H } = g;
  const rrb = g.roofline === "notchback" ? 0.12 : 0.04;
  const nosePts: [number, number][] = [[zF - noseLen, noseTop], [zF - 0.04, noseTop - 0.03], [zF, noseTop - 0.1]];
  const tailZ = Math.min(0.05, 0.5 * (zRb - zR));
  const roofRear = roofTop - prof.dropR * H;
  const roofFront = roofTop - prof.dropF * H;
  let ctrl: [number, number][];
  let radii: number[];
  let samples: number[];
  if (open === "bed") {
    ctrl = [[zR, floorY], [zRb, floorY], [zRt, roofRear], [zPk, roofTop], [zWt, roofFront], [zWb, hoodTop], ...nosePts];
    radii = [0, 0.02, 0.2, 0.3, 0.25, 0.12, 0.15, 0.05, 0];
    samples = [1, 3, 6, 7, 6, 5, 5, 4, 1];
  } else if (open === "cockpit") {
    ctrl = [[zR, deckY - 0.08], [zR + tailZ, deckY - 0.025], [zRb, deckY], [zRb + 0.06, cockY], [zWb - 0.1, cockY], [zWb, hoodTop], ...nosePts];
    radii = [0, 0.05, 0.1, 0.03, 0.03, 0.1, 0.15, 0.05, 0];
    samples = [1, 4, 5, 3, 3, 5, 5, 4, 1];
  } else {
    ctrl = [[zR, deckY - 0.08], [zR + tailZ, deckY - 0.025], [zRb, deckY], [zRt, roofRear], [zPk, roofTop], [zWt, roofFront], [zWb, hoodTop], ...nosePts];
    radii = [0, 0.05, rrb, 0.25, 0.4, 0.25, 0.12, 0.15, 0.05, 0];
    samples = [1, 4, 5, 6, 7, 6, 5, 5, 4, 1];
  }
  const profile = roundPolyline(ctrl, radii, samples);
  if (open === "cockpit") return profile;
  // the rounding shaves the apex: lift the roof peak so the highest point of the roof is exactly the roof height
  const lift = roofTop - Math.max(...profile.map((p) => p[1]));
  const pkIdx = ctrl.findIndex(([z]) => z === zPk);
  ctrl[pkIdx] = [ctrl[pkIdx][0], ctrl[pkIdx][1] + lift];
  return roundPolyline(ctrl, radii, samples);
}

/** Underbody height and the wheel-arch cut, both as functions of z. */
type ArchShape = { ybAt: (z: number) => number; archTop: (z: number) => number; archEdge: (axle: number) => number };
function archShape({ gc, zF, zR, axleF, axleR, R, Ra }: Dims): ArchShape {
  const ybAt = (z: number) => gc + LIFT_F * smooth(zF - 0.55, zF, z) + LIFT_R * (1 - smooth(zR, zR + 0.5, z));
  const archTop = (z: number) => {
    let ya = -Infinity;
    for (const a of [axleF, axleR]) {
      const d = Math.abs(z - a);
      if (d < Ra) ya = Math.max(ya, R + Math.sqrt(Ra * Ra - d * d));
    }
    return ya;
  };
  const archEdge = (axle: number) => {
    // half length of the cut where the arch circle meets the underbody line (bisection: yb varies a little with z)
    let lo = 0;
    let hi = Ra;
    for (let i = 0; i < 40; i++) {
      const mid = (lo + hi) / 2;
      if (R + Math.sqrt(Ra * Ra - mid * mid) > ybAt(axle + mid)) lo = mid;
      else hi = mid;
    }
    return lo;
  };
  return { ybAt, archTop, archEdge };
}

/** The cross-section of the body at one z (see `Sec`). */
function makeSec(g: Dims, ds: Resolved, top: (z: number) => number, shape: ArchShape, xiFull: number) {
  const { L, W, open, zF, zR, ef, er, hoodTop, roofTop, belt, prof, tum } = g;
  return (z: number): Sec => {
    const u = (z - zR) / L;
    const t = z > zF - ef ? (zF - z) / ef : z < zR + er ? (z - zR) / er : 1;
    const cw = Math.pow(1 - Math.pow(1 - clamp(t, 0, 1), PLAN_P), 1 / PLAN_P);
    const yt = top(z);
    const taper = (1 - prof.taperR * (1 - smooth(0, 0.28, u))) * (1 - prof.taperF * smooth(0.82, 1, u));
    const wsh = (W / 2) * taper;
    const k = open ? 0 : clamp((yt - hoodTop) / (roofTop - hoodTop), 0, 1);
    const ysh = open ? Math.min(belt, yt - CAB_LIFT) : Math.min(belt + 0.05 * smooth(0.85, 0.15, u) - 0.015, yt - CAB_LIFT); // the shoulder line climbs towards the tail
    const yb = shape.ybAt(z);
    const ym = lerp(yb, ysh, 0.55);
    const wb = wsh - 0.045;
    const n = Math.max(0, Math.min(shape.archTop(z) - yb, ym - yb - 0.05));
    const base = wb - SILL_R;
    return {
      z, cw, yb, n,
      xi: base + (Math.min(xiFull, wb - 0.1) - base) * smooth(0, 0.05, n),
      wb, wm: wsh, ym,
      xs: wsh * (0.985 - 0.015 * ds.crease),
      ysh,
      wt: lerp(wsh * 0.9, wsh - tum, k),
      yt,
      crown: open ? 0 : lerp(0.028, 0.014, k),
      k,
      dip: open ? 0 : 0.018 * (1 - k) * ds.crease, // two power-bulge ridges on the bonnet: the centre lies a little lower
      rsh: (0.05 + (1 - k) * 0.05) * (1 - 0.7 * ds.crease),
      rt: lerp(0.09, 0.07, k),
    };
  };
}

/** The z positions to cut sections at: denser at the rounded ends and around the wheel arches; `q` 1 is the coarse variant. */
function frameStations({ L, zF, zR, zWb, zWt, zRb, zRt, ef, er, axleF, axleR }: Dims, archEdge: (axle: number) => number, q: 0 | 1) {
  const zs: number[] = [zR, zF];
  const dz = q ? 0.24 : Math.max(0.11, L / 34);
  for (let z = zR + er; z <= zF - ef; z += dz) zs.push(z);
  for (const t of q ? [0.05, 0.2, 0.5, 1] : [0.03, 0.08, 0.17, 0.3, 0.5, 0.75, 1]) zs.push(zF - ef * t, zR + er * t);
  for (const z of [zWb, zWt, zRb, zRt]) if (z > zR + er && z < zF - ef) zs.push(z);
  const K = q ? 4 : 8;
  for (const a of [axleF, axleR]) {
    const e = archEdge(a);
    for (let i = 0; i <= K; i++) zs.push(a - e * Math.cos((Math.PI * i) / K));
  }
  zs.sort((a, b) => a - b);
  const out: number[] = [];
  for (const z of zs) {
    if (out.length && z - out[out.length - 1] <= 0.006) {
      if (z === zF) out[out.length - 1] = z; // the tip itself is never dropped, else the nose would not close
      continue;
    }
    out.push(z);
  }
  return out;
}

export function makeFrame(ds: Resolved): Frame {
  const g = frameDims(ds);
  const { s, st, L, W, H, rails, open, gc, belt, hoodTop, roofTop, glassTop, deckY, floorY, cockY, noseTop, noseLen, zF, zR, zWb, zWt, zRb, zRt, zB, ws, rr, D, R, Ra, tw, axleF, axleR, ef, er } = g;
  const front = zWb - 0.15;
  const profile = topProfile(g);
  const top = (z: number) => evalPoly(profile, z);
  const tipTop: [number, number] = [top(zF), top(zR)];
  const endTop: [number, number] = [top(zF - 0.03), top(zR + 0.03)];
  const shape = archShape(g);
  const xiFull = W / 2 - 0.03 - tw - 0.075;

  /** How far back the upper part of the nose is pulled at this z and height, so the front face slopes while the bumper stays at the very end. */
  const leanMax = s.bodyStyle === "van" || s.bodyStyle === "microcar" ? 0.03 : s.bodyStyle === "sports" || s.bodyStyle === "coupe" ? 0.12 : 0.07;
  const lean = (z: number, y: number) => leanMax * smooth(zF - ef, zF, z) * smooth(gc + LIFT_F + 0.2, gc + LIFT_F + 0.55, y);

  return {
    s, st, L, W, H, rails, open, gc, belt, hoodTop, noseTop, roofTop, glassTop, deckY, floorY, cockY,
    zF, zR, zWb, zWt, zRb, zRt, zB, noseLen, ws, rr, D, R, Ra, tw, xiFull, axleF, axleR, ef, er,
    wheels: s.wheels ?? (st.steel ? "steel" : "alloy"),
    seams: st.doors === 4 ? [front, zB, Math.max(zB - 0.95, zRb + 0.3)] : [front, front - L * 0.27],
    tipTop, endTop, d: ds, sec: makeSec(g, ds, top, shape, xiFull), stations: (q) => frameStations(g, shape.archEdge, q), top, archEdge: shape.archEdge, lean,
  };
}
