import { Mesh } from "./carBuilder.ts";
import { clamp, type V3 } from "./mathUtil.ts";
import { type Frame } from "./carFrame.ts";

// Wheels and wheel-arch liners. Built for the left side (+x) and mirrored by the caller. `h` offsets run along the axle, outward positive.

const RUBBER: V3 = [0.018, 0.018, 0.02];
const ALLOY: V3 = [0.8, 0.82, 0.85];
const STEEL: V3 = [0.5, 0.52, 0.55];
const DISC: V3 = [0.36, 0.37, 0.4];
const CALIPER: V3 = [0.05, 0.05, 0.055];
const DARK: V3 = [0.012, 0.012, 0.014];
const X: V3 = [1, 0, 0];

/** Spokes of a wheel (0 = a plain steel wheel with a hub cap). */
export const spokeCount = (f: Frame): number => (f.d.wheel.style === "steel" ? 0 : f.d.wheel.spokes);

export function wheel(f: Frame, q: 0 | 1, black: Mesh, chrome: Mesh, axle: number) {
  const { R, tw, W } = f;
  const cx = W / 2 - 0.03 - tw / 2;
  const c: V3 = [cx, R, axle];
  const rimR = R * 0.66;
  const hubR = rimR * 0.2;
  const sw = R - rimR;
  const seg = q ? 12 : 20;

  // tyre: rows of [radius, offset]; outer half to the centre of the tread, then mirrored for the inner half
  const half: [number, number][] = q
    ? [[rimR, 0.44], [rimR + 0.55 * sw, 0.5], [R - 0.025, 0.47], [R, 0.33], [R, 0]]
    : [[rimR, 0.44], [rimR + 0.55 * sw, 0.5], [R - 0.025, 0.47], [R, 0.36], [R - 0.006, 0.16], [R, 0]];
  const tyre: [number, number][] = [...half.map(([r, h]) => [r, h * tw] as [number, number]), ...half.slice(0, -1).reverse().map(([r, h]) => [r, -h * tw] as [number, number])];
  black.lathe(c, "x", tyre, seg, RUBBER);

  // rim lip and hub
  chrome.lathe(c, "x", [[rimR, 0.43 * tw], [rimR * 0.97, 0.47 * tw], [rimR * 0.9, 0.43 * tw]], seg, ALLOY, [1, 0, 0]);
  const spokes = spokeCount(f);
  if (spokes === 0) {
    chrome.lathe(c, "x", [[rimR * 0.9, 0.4 * tw], [0, 0.37 * tw]], seg, STEEL, X);
    chrome.lathe(c, "x", [[hubR * 1.5, 0.37 * tw], [hubR * 1.2, 0.41 * tw], [0, 0.43 * tw]], seg, ALLOY, X);
    return;
  }
  black.lathe(c, "x", [[rimR * 0.97, 0.12 * tw], [0, 0.12 * tw]], seg, DARK, X); // dark barrel behind the spokes
  chrome.lathe(c, "x", [[rimR * 0.84, 0.22 * tw], [rimR * 0.3, 0.22 * tw]], seg, DISC, X); // brake disc
  const a = (-Math.PI / 6) * (axle > 0 ? -1 : 1);
  black.box([cx + 0.27 * tw, R + Math.cos(a) * rimR * 0.6, axle + Math.sin(a) * rimR * 0.6], [0.04, 0.07, 0.1], CALIPER);
  chrome.lathe(c, "x", [[hubR * 1.3, 0.34 * tw], [hubR * 1.15, 0.4 * tw], [hubR * 0.5, 0.42 * tw], [0, 0.42 * tw]], seg, ALLOY, X);
  const hz = 0.37 * tw;
  const t = 0.012;
  const style = f.d.wheel.style;
  const w0 = (0.06 * Math.pow(5 / spokes, 0.7)) * (style === "twin" ? 0.75 : 1);
  const w1 = w0 * 0.65;
  const r0 = hubR * 1.1;
  const r1 = rimR * 0.93;
  const twist = style === "turbine" ? 0.45 : 0; // turbine: the spokes sweep round as they go out
  for (let i = 0; i < spokes; i++) {
    for (const g of style === "twin" ? [-1, 1] : [0]) {
      const th = (2 * Math.PI * i) / spokes + g * 0.15;
      const dir = (r: number) => th + (twist * (r - r0)) / (r1 - r0);
      const at = (r: number, w: number, side: number, hh: number): V3 => {
        const a2 = dir(r);
        return [cx + hh, R + Math.cos(a2) * r - Math.sin(a2) * w * side, axle + Math.sin(a2) * r + Math.cos(a2) * w * side];
      };
      const corner = (r: number, w: number, side: number, up: boolean) => at(r, w / 2, side, up ? hz + t / 2 : hz - t / 2);
      chrome.grid([[corner(r0, w0, -1, true), corner(r0, w0, 1, true)], [corner(r1, w1, -1, true), corner(r1, w1, 1, true)]], X, { color: ALLOY });
      for (const s of [-1, 1]) {
        const a1 = dir(r1);
        chrome.grid([[corner(r0, w0, s, false), corner(r0, w0, s, true)], [corner(r1, w1, s, false), corner(r1, w1, s, true)]], [0, -Math.sin(a1) * s, Math.cos(a1) * s], { color: ALLOY });
      }
    }
  }
}

/** Black liner of one wheel arch: a back plate on the inner wall and a curved roof, a few millimetres inside the paint lip. */
export function archLiner(f: Frame, q: 0 | 1, black: Mesh, axle: number) {
  const { R, Ra } = f;
  const s0 = f.sec(axle);
  const ra = Ra - 0.008;
  const xi = s0.wb - 0.1 > f.xiFull ? f.xiFull : s0.wb - 0.1;
  const phiMax = Math.acos(clamp((f.gc - R) / ra, -1, 1));
  const n = q ? 6 : 11;
  const arc: [number, number][] = [];
  for (let i = 0; i <= n; i++) {
    const phi = -phiMax + (2 * phiMax * i) / n;
    arc.push([axle + ra * Math.sin(phi), R + ra * Math.cos(phi)]);
  }
  const centre: V3 = [xi + 0.003, R, axle];
  black.grid([arc.map(() => centre), arc.map(([z, y]) => [xi + 0.003, y, z] as V3)], X, { color: DARK });
  // the triangle between the centre and the chord at the underbody line
  const ends = [arc[0], arc[n]];
  const v0 = black.vert(centre, DARK);
  const v1 = black.vert([xi + 0.003, ends[0][1], ends[0][0]], DARK);
  const v2 = black.vert([xi + 0.003, ends[1][1], ends[1][0]], DARK);
  black.tri(v0, v2, v1);
  const roof = [xi + 0.003, s0.wb - 0.0].map((x) => arc.map(([z, y]) => [x, y, z] as V3));
  black.grid(roof, (p) => [0, R - p[1], axle - p[2]], { color: DARK });
}
