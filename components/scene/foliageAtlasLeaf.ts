import { grey, type G } from "./foliageAtlasKit";

/**
 * One drawn leaf for the houseplant tiles (foliageAtlasPlants*.ts): an outline from a width profile (with optional saw teeth), a base-to-tip light
 * gradient, a fold shade along the midrib, midrib, side veins and a rim, all in grey. Local frame: the leaf starts at (x, y) and points along -y
 * (up the tile), turned by `ang`. The card of a leaf is stretched to the real leaf, so a leaf fills its tile: len and wid default to almost the whole tile.
 */
export const PI = Math.PI;
export type Prof = (t: number) => number;
type LeafSpec = {
  /** depth (share of the length) of the cleft at the base of a heart-shaped leaf: the lobes then start at the very bottom of the leaf */
  notch?: number;
  x?: number;
  y?: number;
  len?: number;
  wid?: number;
  ang?: number;
  /** half-width factor 0..1 along the leaf, t = 0 at the base .. 1 at the tip */
  prof: Prof;
  /** grey at the base and at the tip */
  lum?: [number, number];
  /** darkening of the left half (the fold along the midrib), 0..1 */
  fold?: number;
  /** [count, depth as a share of the half width]: saw teeth along the edge */
  teeth?: [number, number];
  /** [grey, width] of the midrib */
  rib?: [number, number];
  veins?: { n: number; lum: number; w?: number; from?: number; to?: number; sweep?: number };
  /** [grey, width] of a rim along the edge */
  edge?: [number, number];
  /** extra painting in leaf coordinates, clipped to the outline */
  after?: (g: G, len: number, half: number) => void;
};
/** scale a profile so its widest point is exactly 1 (the leaf then fills the tile) */
export const norm1 = (f: Prof): Prof => {
  let m = 1e-6;
  for (let i = 0; i <= 50; i++) m = Math.max(m, f(i / 50));
  return (t) => f(t) / m;
};

export const sm = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
/** sin bump: 0 at both ends, 1 in the middle; a < 1 pushes the widest point towards the tip */
export const bump = (a = 1, b = 1): Prof => (t) => Math.pow(Math.sin(PI * Math.pow(t, a)), b);

export function drawLeaf(g: G, s: LeafSpec) {
  const { x = 64, y = 126, len = 122, wid = 122, ang = 0 } = s;
  const half = wid / 2;
  const [l0, l1] = s.lum ?? [0.62, 0.9];
  const n = 60 + (s.teeth ? s.teeth[0] * 4 : 0);
  const w = (t: number) => {
    const tooth = s.teeth ? s.teeth[1] * (((t * s.teeth[0]) % 1) - 0.5) * 2 : 0;
    return half * s.prof(t) * (1 + tooth * Math.min(1, s.prof(t) * 3));
  };
  g.save();
  g.translate(x, y);
  g.rotate(ang);
  g.beginPath();
  for (let i = 0; i <= n; i++) g.lineTo(w(i / n), -(i / n) * len);
  for (let i = n; i >= 0; i--) g.lineTo(-w(i / n), -(i / n) * len);
  if (s.notch) g.lineTo(0, -s.notch * len);
  g.closePath();
  const grad = g.createLinearGradient(0, 0, 0, -len);
  grad.addColorStop(0, grey(l0));
  grad.addColorStop(1, grey(l1));
  g.fillStyle = grad;
  g.fill();
  if (s.edge) {
    g.strokeStyle = grey(s.edge[0]);
    g.lineWidth = s.edge[1] * 2;
    g.lineJoin = "round";
    g.stroke();
  }
  g.clip();
  if (s.fold) {
    g.fillStyle = `rgba(0,0,0,${s.fold})`;
    g.fillRect(-half - 2, -len - 2, half + 2, len + 4);
  }
  if (s.veins) {
    const { n: vn, lum, w: vw = 1, from = 0.08, to = 0.9, sweep = 0.14 } = s.veins;
    g.strokeStyle = grey(lum, 0.92);
    g.lineWidth = vw;
    g.lineCap = "round";
    for (let i = 0; i < vn; i++) {
      const t0 = from + ((to - from) * (i + 0.5)) / vn;
      const t1 = Math.min(0.97, t0 + sweep);
      for (const side of [-1, 1]) {
        g.beginPath();
        g.moveTo(0, -t0 * len);
        g.quadraticCurveTo(side * w(t1) * 0.55, -(t0 + sweep * 0.2) * len, side * w(t1) * 0.96, -t1 * len);
        g.stroke();
      }
    }
  }
  s.after?.(g, len, half);
  if (s.rib) {
    g.strokeStyle = grey(s.rib[0]);
    g.lineWidth = s.rib[1];
    g.lineCap = "round";
    g.beginPath();
    g.moveTo(0, -(s.notch ?? 0) * len);
    g.lineTo(0, -len * 0.94);
    g.stroke();
  }
  g.restore();
}
