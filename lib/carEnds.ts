import { Mesh } from "./carBuilder.ts";
import { clamp, lerp, type V3 } from "./mathUtil.ts";
import { type Ctx, type Pt, type YFn, contour, mirrored, oneSide, patch } from "./carSurf.ts";
import { AMBER, BLACK, CHROME, GREY } from "./carTrim.ts";
import { PLATE_HOLDER } from "./plate.ts";

// The nose and the tail: headlights, grille, intake, fog lights, tail lights, bumper cladding, exhaust tips and the number-plate mounts.
// What each one looks like comes from the resolved design (lib/carDesign.ts): grille type, lamp shape, daytime-running signature, tail-lamp shape.

const PLATE_LIFT = 0.0072; // plate centre above the bumper surface (the 6 mm plate sits on a 3.5 mm holder)

/** Underbody and top height at an end, their difference, and the half width where the rounding ends. */
type End = { yb: number; yt: number; h: number; wN: number };

function metrics(c: Ctx, front: boolean): End {
  const { f, surf } = c;
  const yb = surf.P[front ? surf.ns - 1 : 0][0][1];
  const yt = front ? f.endTop[0] : f.open === "bed" ? f.floorY : f.endTop[1];
  const wN = f.sec(front ? f.zF - f.ef : f.zR + f.er).wm;
  return { yb, yt, h: yt - yb, wN };
}

const ybAt = (c: Ctx): YFn => (_u, i) => c.surf.at(i, 0).p[1];

/** Plate holder on the bumper plus the mount the 3D view hangs the plate texture on. */
function plateMount(c: Ctx, front: boolean, yc: number, holderOn = true) {
  const holder = PLATE_HOLDER;
  if (holderOn) mirrored(c, () => contour(c, c.black, front, 0, { x: holder[0] / 2 }, () => yc - holder[1] / 2, () => yc + holder[1] / 2, { off: 0.0035, color: BLACK }));
  const pp = c.surf.endAt(front, 0, yc);
  const ny = clamp(pp.n[1], -1, 1);
  c.plates.push({
    end: front ? "front" : "rear",
    p: [pp.p[0], pp.p[1] + pp.n[1] * PLATE_LIFT, pp.p[2] + pp.n[2] * PLATE_LIFT],
    rot: front ? [-Math.asin(ny), 0, 0] : [Math.asin(ny), Math.PI, 0],
  });
}

/** A trapezoid lying on the nose: `hwTop` / `hwBot` are half widths at the top and bottom edges (mirrored by the caller). */
function trap(c: Ctx, m: Mesh, yTop: number, yBot: number, hwTop: number, hwBot: number, off: number, color?: V3) {
  const ny = 4;
  const nx = 3;
  const rows: Pt[][] = [];
  for (let ky = 0; ky <= ny; ky++) {
    const t = ky / ny;
    const y = lerp(yBot, yTop, t);
    const hw = lerp(hwBot, hwTop, t);
    rows.push(Array.from({ length: nx + 1 }, (_, kx) => c.surf.endAt(true, (hw * kx) / nx, y)));
  }
  patch(m, rows, off, color);
}

/**
 * The Mitsubishi "mouth": one chrome frame, wider at the bottom, around an upper slatted grille and a lower mesh intake, the plate between them.
 * Returns true when it drew the nose (the plate holder is then left off: the plate sits on the chrome).
 */
function mouth(c: Ctx, e: End): boolean {
  const { f, black, chrome, surf } = c;
  const { face } = f.d;
  const hwBot = (face.grilleW * f.W) / 2;
  const hwTop = hwBot * 0.74;
  const yTop = e.yt - 0.035;
  const yBot = e.yb + 0.085;
  const hw = (y: number) => lerp(hwBot, hwTop, (y - yBot) / (yTop - yBot));
  const yG = yTop - 0.15; // bottom of the upper grille
  const yI = yBot + 0.13; // top of the lower intake
  const bar: V3 = [0.1, 0.1, 0.11];
  const edge = 0.018;
  mirrored(c, () => {
    trap(c, black, yTop + 0.008, yBot - 0.008, hwTop + 0.012, hwBot + 0.012, 0.003, BLACK); // shadow line round the frame
    trap(c, chrome, yTop, yBot, hwTop, hwBot, 0.0045, CHROME);
    trap(c, black, yTop - edge, yG, hw(yTop - edge) - edge, hw(yG) - edge, 0.0065, BLACK); // upper grille
    trap(c, black, yI, yBot + edge, hw(yI) - edge, hw(yBot + edge) - edge, 0.0065, BLACK); // lower intake
    const n = face.bars ?? 3;
    for (let k = 1; k <= n; k++) {
      const y = lerp(yTop - edge, yG, k / (n + 1));
      trap(c, black, y + 0.004, y - 0.004, hw(y) - edge, hw(y) - edge, 0.0085, bar);
    }
    for (let k = 1; k <= 3; k++) {
      const y = lerp(yI, yBot + edge, k / 4);
      trap(c, black, y + 0.005, y - 0.005, hw(y) - edge, hw(y) - edge, 0.0085, bar);
    }
    trap(c, black, yI - 0.04, yBot + edge, 0.012, 0.012, 0.0085, bar); // centre post of the mesh
  });
  const pb = surf.endAt(true, 0, (yTop + yG) / 2).p;
  chrome.ellipsoid([pb[0], pb[1], pb[2] + 0.002], [0.045, 0.03, 0.009], 10, 4, CHROME);
  return true;
}

/** The grille: a black opening with chrome (or dark) slats, a chrome-framed shield, a single bar, or a smooth closed nose. */
function grille(c: Ctx, e: End) {
  const { f, black, chrome, surf } = c;
  const { face } = f.d;
  const gW = (face.grilleW * f.W) / 2;
  const gy1 = e.yt - 0.075;
  const gy0 = gy1 - clamp(0.28 * e.h, 0.07, 0.16);
  const slat = face.grilleChrome ? CHROME : GREY;
  const slats = (xb: number, y0: number, y1: number, n: number) => {
    for (let k = 0; k <= n; k++) {
      const y = lerp(y0, y1, k / n);
      contour(c, face.grilleChrome ? chrome : black, true, 0, { x: xb }, () => y - 0.004, () => y + 0.004, { off: 0.0055, nv: 1, color: slat });
    }
  };
  if (face.grille === "closed") {
    mirrored(c, () => contour(c, black, true, 0, { x: 0.5 * e.wN }, () => e.yt - 0.1, () => e.yt - 0.085, { off: 0.003, nv: 1, color: BLACK }));
    return;
  }
  if (face.grille === "shield") {
    // chrome frame, wide at the top and narrowing towards the bottom, with a black opening and slats inside
    mirrored(c, () => {
      trap(c, chrome, gy1, gy0, gW * 0.8, gW, 0.0035, CHROME);
      trap(c, black, gy1 - 0.016, gy0 + 0.016, gW * 0.8 - 0.016, gW - 0.016, 0.005, BLACK);
      for (let k = 1; k <= 2; k++) {
        const y = lerp(gy1, gy0, k / 3);
        trap(c, black, y + 0.004, y - 0.004, gW * 0.9 - 0.016, gW * 0.9 - 0.016, 0.0066, [0.1, 0.1, 0.11]);
      }
    });
  } else if (face.grille === "bar") {
    mirrored(c, () => {
      contour(c, black, true, 0, { x: gW }, () => gy0, () => gy1, { off: 0.003, color: BLACK });
      contour(c, chrome, true, 0, { x: gW + 0.12 }, () => (gy0 + gy1) / 2 - 0.014, () => (gy0 + gy1) / 2 + 0.014, { off: 0.0055, nv: 1, color: CHROME });
    });
  } else {
    mirrored(c, () => {
      contour(c, black, true, 0, { x: gW }, () => gy0, () => gy1, { off: 0.003, color: face.grille === "mesh" ? GREY : BLACK });
      if (face.grille === "slats") slats(gW - 0.005, gy0, gy1, 3);
      else for (const k of [0.33, 0.66]) contour(c, black, true, 0, { x: gW }, () => lerp(gy0, gy1, k) - 0.003, () => lerp(gy0, gy1, k) + 0.003, { off: 0.0045, nv: 1, color: BLACK });
    });
  }
  const pb = surf.endAt(true, 0, (gy0 + gy1) / 2).p;
  chrome.ellipsoid([pb[0], pb[1], pb[2] + 0.002], [0.04, 0.026, 0.008], 10, 4, CHROME);
}

/** Headlights: a wedge swept back into the wing, silver reflector with a projector bowl and chrome bezel, daytime-running signature, indicator. Draws one side. */
function headlamp(c: Ctx, e: End, gW: number, withMouth: boolean) {
  const { f, black, lamp, chrome, surf } = c;
  const { face } = f.d;
  const shape = face.lamp;
  const lampH = clamp((shape === "slim" ? 0.2 : shape === "angular" ? 0.3 : 0.32) * e.h, 0.05, 0.17);
  const taper = shape === "angular" ? 0.62 : 0.35;
  const top: YFn = (u) => e.yt - 0.05 + (shape === "angular" ? 0.012 * u : -0.03 * u);
  const bot: YFn = (u, i) => top(u, i) - lampH * (1 - taper * u);
  const xa = withMouth ? Math.min(gW * 0.93 + 0.03, 0.7 * e.wN) : Math.min(gW + 0.015, 0.7 * e.wN);
  const end = { z: f.zF - (shape === "slim" ? 0.22 : 0.16) };
  const yLens = (top(0.12, 0) + bot(0.12, 0)) / 2;
  if (shape === "round") {
    const pc = surf.endAt(true, xa + 0.1, e.yt - 0.12).p;
    chrome.ellipsoid([pc[0], pc[1], pc[2] - 0.012], [0.085, 0.085, 0.02], 12, 5, CHROME);
    c.glass.ellipsoid([pc[0], pc[1], pc[2] - 0.008], [0.075, 0.075, 0.016], 12, 5);
    lamp.ellipsoid([pc[0], pc[1], pc[2] - 0.004], [0.05, 0.05, 0.012], 10, 4);
  } else {
    contour(c, black, true, xa - 0.014, end, (u, i) => bot(u, i) - 0.014, (u, i) => top(u, i) + 0.012, { off: 0.0033, nv: 3, color: BLACK }); // dark surround
    contour(c, chrome, true, xa - 0.004, end, (u, i) => bot(u, i) - 0.006, (u, i) => top(u, i) + 0.004, { off: 0.0046, nv: 3, color: CHROME }); // bezel
    contour(c, lamp, true, xa, end, bot, top, { off: 0.0062, nv: 4 }); // reflector under a clear lens
    const pl = surf.endAt(true, xa + 0.085, yLens).p;
    chrome.ellipsoid([pl[0], pl[1], pl[2] - 0.004], [0.04, 0.04, 0.014], 12, 5, CHROME);
    black.ellipsoid([pl[0], pl[1], pl[2]], [0.03, 0.03, 0.012], 10, 5, BLACK); // projector bowl
    contour(c, black, true, xa, end, (u, i) => bot(u, i) + 0.006, (u, i) => bot(u, i) + 0.026, { off: 0.0075, nv: 1, ua: 0.8, color: AMBER });
  }
  if (face.drl === "strip" || face.drl === "c" || face.drl === "bar") {
    contour(c, lamp, true, xa, end, (u, i) => top(u, i) - 0.028, (u, i) => top(u, i) - 0.012, { off: 0.0075, nv: 1 });
  }
  if (face.drl === "c") contour(c, lamp, true, xa, end, (u, i) => bot(u, i), (u, i) => top(u, i) - 0.012, { off: 0.0075, nv: 1, ub: 0.07 });
  if (face.drl === "bar") contour(c, lamp, true, 0, { x: xa }, () => e.yt - 0.045, () => e.yt - 0.033, { off: 0.0062, nv: 1 });
}

/** Lower intake, fog light and bumper cladding. Draws one side. */
function lowerFront(c: Ctx, e: End, withMouth: boolean) {
  const { f, black, lamp, chrome, surf } = c;
  const { face } = f.d;
  const yb = ybAt(c);
  const intakeY0 = e.yb + 0.04 * e.h;
  const intakeY1 = e.yb + 0.45 * e.h;
  const wFog = withMouth ? 0.6 * e.wN : clamp(0.52 * e.wN, 0.36, 0.62 * e.wN);
  const yFog = withMouth ? e.yb + 0.13 : (intakeY0 + intakeY1) / 2 + 0.02;
  if (face.intake !== "none" && !withMouth) {
    const xi0 = face.intake === "split" ? PLATE_HOLDER[0] / 2 + 0.03 : 0;
    contour(c, black, true, xi0, { x: 0.62 * e.wN }, () => intakeY0, () => intakeY1, { off: 0.0025, nv: 4, color: BLACK });
  }
  if (face.fog && face.intake !== "none") {
    if (withMouth || face.intake === "wide") {
      // a black pod with a chrome ring round the lamp, low in each bumper corner
      contour(c, black, true, wFog - 0.085, { x: wFog + 0.085 }, () => yFog - 0.065, () => yFog + 0.065, { off: 0.0042, nv: 3, color: BLACK });
    }
    const pf = surf.endAt(true, wFog, yFog).p;
    chrome.ellipsoid([pf[0], pf[1], pf[2] - 0.004], [0.046, 0.046, 0.011], 12, 4, CHROME);
    lamp.ellipsoid([pf[0], pf[1], pf[2]], [0.034, 0.034, 0.011], 10, 4);
  }
  contour(c, black, true, 0, { z: f.zF - 0.5 }, (u, i) => yb(u, i) + 0.006, (u, i) => yb(u, i) + 0.085, { off: 0.01, nv: 4, color: BLACK });
}

/** The charge-flap outline on a closed nose (cars with a front charge port). Draws one side. */
function chargeFlap(c: Ctx, e: End) {
  const y0 = e.yt - 0.27;
  const y1 = e.yt - 0.18;
  contour(c, c.black, true, 0.06, { x: 0.064 }, () => y0, () => y1, { off: 0.0035, nv: 1, color: BLACK });
  contour(c, c.black, true, 0, { x: 0.064 }, () => y0 - 0.003, () => y0 + 0.003, { off: 0.0035, nv: 1, color: BLACK });
  contour(c, c.black, true, 0, { x: 0.064 }, () => y1 - 0.003, () => y1 + 0.003, { off: 0.0035, nv: 1, color: BLACK });
}

export function frontEnd(c: Ctx) {
  const { f } = c;
  const { face } = f.d;
  const e = metrics(c, true);
  const gW = (face.grilleW * f.W) / 2;
  const withMouth = face.grille === "shield" && face.intake === "wide" && /mitsubishi/.test(face.id ?? "");
  mirrored(c, () => {
    headlamp(c, e, gW, withMouth);
    lowerFront(c, e, withMouth);
  });
  if (withMouth) mouth(c, e);
  else grille(c, e);
  if (face.grille === "closed" && f.s.port === "f") mirrored(c, () => chargeFlap(c, e));
  plateMount(c, true, withMouth ? e.yb + 0.27 : e.yb + clamp(0.28 * e.h, 0.13, 0.25), !withMouth);
}

export function rearEnd(c: Ctx) {
  const { f, black, tail, chrome, surf } = c;
  const e = metrics(c, false);
  const yb = ybAt(c);
  const shape = f.d.rear.lamp;
  const xa = Math.min(PLATE_HOLDER[0] / 2 + 0.03, 0.45 * e.wN);
  const lampH = clamp((shape === "vertical" ? 0.45 : shape === "block" ? 0.34 : 0.3) * e.h, 0.07, shape === "vertical" ? 0.34 : 0.19);
  const top: YFn = () => e.yt - 0.03;
  const bot: YFn = (u, i) => top(u, i) - lampH * (1 - 0.2 * u);
  mirrored(c, () => {
    if (shape === "round") {
      const pc = surf.endAt(false, xa + 0.09, e.yt - 0.1).p;
      chrome.ellipsoid([pc[0], pc[1], pc[2] + 0.004], [0.07, 0.07, 0.01], 12, 5, CHROME);
      tail.ellipsoid([pc[0], pc[1], pc[2] + 0.006], [0.058, 0.058, 0.01], 12, 5);
    } else {
      const end = shape === "wrap" || shape === "bar" ? { z: f.zR + 0.15 } : shape === "vertical" ? { z: f.zR + 0.07 } : { x: 0.96 * e.wN };
      contour(c, tail, false, xa, end, bot, top, { off: 0.005, nv: 5 });
      if (shape === "bar") contour(c, tail, false, 0, { x: xa }, () => top(0, 0) - 0.05, () => top(0, 0) - 0.025, { off: 0.0045, nv: 1 });
    }
    contour(c, tail, false, 0.55 * e.wN, { x: 0.8 * e.wN }, () => e.yb + 0.07, () => e.yb + 0.115, { off: 0.0045, nv: 1 }); // reflector
    contour(c, black, false, 0, { z: f.zR + 0.5 }, (u, i) => yb(u, i) + 0.006, (u, i) => yb(u, i) + 0.1, { off: 0.01, nv: 4, color: BLACK });
  });
  plateMount(c, false, e.yb + clamp(0.3 * e.h, 0.14, 0.3));

  if (f.s.fuel !== "ev" && f.d.rear.exhaust !== "hidden") {
    const x = 0.3 * f.W;
    const y = e.yb + 0.05;
    const z0 = surf.endAt(false, x, y).p[2];
    const twin = f.d.rear.exhaust === "twin";
    const tip = () => {
      chrome.lathe([x, y, z0], "z", [[0.032, 0.05], [0.032, -0.012]], c.q ? 6 : 10, CHROME);
      black.lathe([x, y, z0], "z", [[0, -0.004], [0.026, -0.004]], c.q ? 6 : 10, BLACK, [0, 0, -1] as V3);
    };
    if (twin) mirrored(c, tip);
    else oneSide(c, true, tip);
    c.info.exhausts = twin ? 2 : 1;
  }
}
