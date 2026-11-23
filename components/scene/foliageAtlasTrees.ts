import { TILE } from "@/lib/vegBuilder";
import { grey, tile, type G, type Rand } from "./foliageAtlasKit";

/**
 * Species sprig tiles 16..31 of the leaf atlas, used by the denser foliage tiers (levels 1..3, see lib/vegBuilder.ts LEVEL_MULT): each card shows a small
 * leafy twig with real, individually drawn leaves (outline of the species, midrib, side veins, a fold shade along the midrib, base-to-tip light).
 * Greys only: the foliage shader multiplies them by the season colour.
 */
type Shape = {
  /** half width (0..1 of `wid`) at t = 0 (base) .. 1 (tip) */
  prof: (t: number) => number;
  teeth?: number;
  toothAmp?: number;
  lobes?: number;
  lobeAmp?: number;
  veins: number;
};
const PI = Math.PI;
const sm = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
/** normalise a profile so its maximum is 1 */
const norm1 = (f: (t: number) => number): ((t: number) => number) => {
  let m = 1e-6;
  for (let i = 0; i <= 40; i++) m = Math.max(m, f(i / 40));
  return (t) => f(t) / m;
};
const SHAPES: Record<string, Shape> = {
  oak: { prof: norm1((t) => Math.pow(Math.sin(PI * Math.pow(t, 0.8)), 0.9) * (1 - 0.25 * t)), lobes: 3.5, lobeAmp: 0.42, veins: 6 },
  birch: { prof: norm1((t) => Math.pow(1 - t, 0.85) * Math.pow(t, 0.4) * Math.min(1, 0.4 + t * 4)), teeth: 9, toothAmp: 0.16, veins: 6 },
  linden: { prof: norm1((t) => Math.pow(Math.sin(PI * Math.pow(t, 0.72)), 0.8) * (0.55 + 0.45 * (1 - t))), teeth: 12, toothAmp: 0.08, veins: 6 },
  aspen: { prof: norm1((t) => Math.pow(Math.sin(PI * Math.pow(t, 0.8)), 0.6)), teeth: 14, toothAmp: 0.05, veins: 5 },
  cherry: { prof: norm1((t) => Math.pow(Math.sin(PI * Math.pow(t, 0.8)), 0.85) * (1 - 0.15 * t)), teeth: 16, toothAmp: 0.07, veins: 7 },
  willow: { prof: norm1((t) => Math.pow(Math.sin(PI * Math.pow(t, 0.9)), 0.95)), teeth: 18, toothAmp: 0.04, veins: 0 },
  olive: { prof: norm1((t) => Math.pow(Math.sin(PI * Math.pow(t, 0.85)), 0.9)), veins: 0 },
  holly: { prof: norm1((t) => Math.pow(Math.sin(PI * t), 0.8)), teeth: 5, toothAmp: 0.34, veins: 5 },
  box: { prof: norm1((t) => Math.pow(Math.sin(PI * Math.pow(t, 0.7)), 0.7)), veins: 0 },
};

type LeafOpts = { shape: Shape; len: number; wid: number; lum: number; fold?: number };

/** One leaf from its base at (x, y) pointing along angle `a`. */
function drawLeaf(g: G, x: number, y: number, a: number, o: LeafOpts) {
  const { shape, len, wid, lum } = o;
  g.save();
  g.translate(x, y);
  g.rotate(a);
  const outline = (side: 1 | -1 | 0) => {
    const N = 36;
    const pts: [number, number][] = [];
    for (let i = 0; i <= N; i++) {
      const t = i / N;
      let w = wid * shape.prof(t);
      if (shape.teeth) w *= 1 + (shape.toothAmp ?? 0.1) * ((((t * shape.teeth) % 1) - 0.5) * 2 - 0.4) * sm(0.05, 0.25, t) * (1 - sm(0.9, 1, t));
      if (shape.lobes) w *= 1 - (shape.lobeAmp ?? 0.3) * (0.5 - 0.5 * Math.cos(2 * PI * shape.lobes * t)) * sm(0.08, 0.3, t) * (1 - sm(0.85, 1, t));
      pts.push([t * len, w]);
    }
    return side === 0 ? pts : pts.map(([px, py]) => [px, py * side] as [number, number]);
  };
  const upper = outline(-1), lower = outline(1);
  const path = (pts: [number, number][]) => {
    g.beginPath();
    pts.forEach(([px, py], i) => (i ? g.lineTo(px, py) : g.moveTo(px, py)));
  };
  const grad = g.createLinearGradient(0, 0, len, 0);
  grad.addColorStop(0, grey(lum * 0.74));
  grad.addColorStop(0.55, grey(lum));
  grad.addColorStop(1, grey(Math.min(1, lum * 1.1)));
  g.fillStyle = grad;
  path([...upper, ...lower.slice().reverse()]);
  g.fill();
  // fold: the leaf bends along its midrib, one half catches less light
  g.fillStyle = `rgba(0,0,0,${o.fold ?? 0.13})`;
  path([[0, 0], ...lower, [len, 0]]);
  g.fill();
  // veins
  g.strokeStyle = grey(lum * 0.62, 0.7);
  g.lineCap = "round";
  g.lineWidth = Math.max(0.5, wid * 0.07);
  g.beginPath();
  g.moveTo(-len * 0.12, 0);
  g.lineTo(len * 0.94, 0);
  g.stroke();
  g.lineWidth = Math.max(0.3, wid * 0.035);
  for (let k = 1; k <= shape.veins; k++) {
    const t0 = (k / (shape.veins + 1)) * 0.82 + 0.05, t1 = Math.min(0.97, t0 + 0.2);
    const w1 = wid * shape.prof(t1) * 0.88;
    g.beginPath();
    for (const s of [-1, 1]) {
      g.moveTo(t0 * len, 0);
      g.quadraticCurveTo((t0 + 0.08) * len, s * w1 * 0.3, t1 * len, s * w1);
    }
    g.stroke();
  }
  // a darker edge gives each leaf its own outline against its neighbours
  g.strokeStyle = grey(lum * 0.5, 0.5);
  g.lineWidth = 0.55;
  path(upper);
  g.stroke();
  path(lower);
  g.stroke();
  g.restore();
}

/** A twig from the bottom centre curving up, with leaves alternating along it: a sprig seen from the side. */
function sprig(g: G, r: Rand, shape: Shape, o: { n: number; len: number; wid: number; spread: number; lum?: number; stem?: number; tipScale?: number }) {
  const lum = o.lum ?? 0.88;
  const bend = (r() - 0.5) * 22;
  const at = (t: number): [number, number] => [64 + bend * Math.sin(t * 2.4) + (r() - 0.5) * 0, 126 - t * 108];
  // twig
  g.strokeStyle = grey(0.42);
  g.lineCap = "round";
  g.lineWidth = o.stem ?? 2.2;
  g.beginPath();
  for (let i = 0; i <= 12; i++) {
    const [px, py] = at(i / 12);
    if (i) g.lineTo(px, py);
    else g.moveTo(px, py);
  }
  g.stroke();
  const leaves: { x: number; y: number; a: number; s: number; l: number }[] = [];
  for (let i = 0; i < o.n; i++) {
    const t = 0.16 + (0.84 * (i + 0.5)) / o.n;
    const [px, py] = at(t);
    const side = i % 2 ? 1 : -1;
    const s = (0.72 + 0.4 * Math.sin(PI * Math.min(1, t * 1.15))) * (1 - 0.3 * t * (o.tipScale ?? 1)) * (0.88 + 0.24 * r());
    leaves.push({ x: px, y: py, a: -PI / 2 + side * (o.spread + (r() - 0.5) * 0.5), s, l: lum * (0.82 + 0.3 * r()) });
  }
  leaves.push({ x: at(1)[0], y: at(1)[1], a: -PI / 2 + (r() - 0.5) * 0.3, s: 0.8, l: lum });
  // far leaves first, so the near ones overlap them
  for (const lf of leaves.sort((a, b) => a.y - b.y)) drawLeaf(g, lf.x, lf.y, lf.a, { shape, len: o.len * lf.s, wid: o.wid * lf.s, lum: lf.l });
}

/** Maple: a few big palmate five-lobed leaves on petioles, radiating from the tile base. */
function paintMapleSprig(g: G, r: Rand) {
  const leafAt = (x: number, y: number, a: number, size: number, lum: number) => {
    g.save();
    g.translate(x, y);
    g.rotate(a);
    // outline: tips at five directions, notches between them, small teeth on the lobes
    const tips: [number, number][] = [[-1.28, 0.62], [-0.64, 0.92], [0, 1], [0.64, 0.92], [1.28, 0.62]];
    const pts: [number, number][] = [[0, 0]];
    for (let k = 0; k < tips.length; k++) {
      const [ang, rr] = tips[k];
      if (k) {
        const [pa, pr] = tips[k - 1];
        pts.push([Math.cos((pa + ang) / 2) * size * 0.36 * (pr + rr), Math.sin((pa + ang) / 2) * size * 0.36 * (pr + rr)]);
      } else pts.push([Math.cos(ang - 0.45) * size * 0.3, Math.sin(ang - 0.45) * size * 0.3]);
      const side = ang < 0 ? -1 : 1;
      pts.push([Math.cos(ang - side * 0.12) * size * rr * 0.72, Math.sin(ang - side * 0.12) * size * rr * 0.72]);
      pts.push([Math.cos(ang) * size * rr, Math.sin(ang) * size * rr]);
      pts.push([Math.cos(ang + side * 0.12) * size * rr * 0.72, Math.sin(ang + side * 0.12) * size * rr * 0.72]);
    }
    pts.push([Math.cos(1.28 + 0.45) * size * 0.3, Math.sin(1.28 + 0.45) * size * 0.3]);
    const grad = g.createRadialGradient(0, 0, 0, 0, 0, size);
    grad.addColorStop(0, grey(lum * 0.7));
    grad.addColorStop(1, grey(Math.min(1, lum * 1.08)));
    g.fillStyle = grad;
    g.beginPath();
    pts.forEach(([px, py], i) => (i ? g.lineTo(px, py) : g.moveTo(px, py)));
    g.closePath();
    g.fill();
    g.strokeStyle = grey(lum * 0.58, 0.8);
    g.lineCap = "round";
    for (const [ang, rr] of tips) {
      g.lineWidth = ang === 0 ? 1.3 : 0.9;
      g.beginPath();
      g.moveTo(0, 0);
      g.lineTo(Math.cos(ang) * size * rr * 0.92, Math.sin(ang) * size * rr * 0.92);
      g.stroke();
    }
    g.lineWidth = 1.1;
    g.beginPath();
    g.moveTo(-size * 0.28, 0);
    g.lineTo(0, 0);
    g.stroke();
    g.restore();
  };
  const items = [
    { x: 64, y: 118, a: -PI / 2 + (r() - 0.5) * 0.3, s: 34 },
    { x: 60, y: 96, a: -PI / 2 - 0.95, s: 29 },
    { x: 68, y: 92, a: -PI / 2 + 0.95, s: 29 },
    { x: 62, y: 62, a: -PI / 2 - 0.7, s: 24 },
    { x: 66, y: 58, a: -PI / 2 + 0.75, s: 24 },
  ];
  g.strokeStyle = grey(0.42);
  g.lineWidth = 2.2;
  g.beginPath();
  g.moveTo(64, 126);
  g.lineTo(64, 40);
  g.stroke();
  for (const it of items.reverse()) leafAt(it.x, it.y, it.a, it.s, 0.74 + 0.26 * r());
}

/** Spruce: a dense flat spray, side shoots on both sides of a main axis, each shoot finely needled. */
function paintSpruceSpray(g: G, r: Rand) {
  g.lineCap = "round";
  g.strokeStyle = grey(0.4);
  g.lineWidth = 2.4;
  g.beginPath();
  g.moveTo(64, 128);
  g.lineTo(64, 6);
  g.stroke();
  const needles = (x: number, y: number, dir: number, L: number) => {
    // shoot axis with needles on both flanks, pointing forward
    for (let d = 0; d < L; d += 2.3) {
      const px = x + Math.cos(dir) * d, py = y + Math.sin(dir) * d;
      const nl = 9 + 5 * Math.sin((PI * d) / L) + 3 * r();
      for (const s of [-1, 1]) {
        const na = dir + s * (0.8 + 0.25 * r());
        g.strokeStyle = grey(0.62 + 0.38 * r());
        g.lineWidth = 1.5;
        g.beginPath();
        g.moveTo(px, py);
        g.lineTo(px + Math.cos(na) * nl, py + Math.sin(na) * nl);
        g.stroke();
      }
    }
  };
  for (let y = 122; y > 14; y -= 6.2) {
    const f = (y - 10) / 118;
    for (const s of [-1, 1]) {
      const L = 8 + 44 * Math.pow(f, 0.8) * (0.85 + 0.3 * r());
      const dir = -PI / 2 + s * (1.0 - 0.45 * (1 - f));
      g.strokeStyle = grey(0.42);
      g.lineWidth = 1.1;
      g.beginPath();
      g.moveTo(64, y);
      g.lineTo(64 + Math.cos(dir) * L, y + Math.sin(dir) * L);
      g.stroke();
      needles(64, y, dir, L);
    }
  }
  needles(64, 14, -PI / 2, 12);
}

/** Pine: long needle pairs bundled along a twig. */
function paintPineSprig(g: G, r: Rand) {
  g.lineCap = "round";
  g.strokeStyle = grey(0.4);
  g.lineWidth = 3;
  g.beginPath();
  g.moveTo(64, 128);
  g.quadraticCurveTo(58, 70, 66, 20);
  g.stroke();
  for (let y = 120; y > 20; y -= 5.5) {
    const px = 64 + (y - 120) * -0.08 + (y < 70 ? 4 : 0);
    for (let k = 0; k < 7; k++) {
      const a = -PI / 2 + (k - 3) * 0.34 + (r() - 0.5) * 0.2 + (y % 11 < 5.5 ? 0.15 : -0.15);
      const nl = 46 + 18 * r();
      g.strokeStyle = grey(0.62 + 0.38 * r());
      g.lineWidth = 1.5;
      g.beginPath();
      g.moveTo(px, y);
      g.quadraticCurveTo(px + Math.cos(a) * nl * 0.5, y + Math.sin(a) * nl * 0.5 - 2, px + Math.cos(a) * nl, y + Math.sin(a) * nl);
      g.stroke();
    }
  }
}

/** A tile packed with small leaves of one shape, covering most of the tile (hedges, boxwood, ivy). */
function paintPacked(g: G, r: Rand, shape: Shape, n: number, len: number, wid: number) {
  g.fillStyle = grey(0.55);
  g.fillRect(0, 0, 0, 0);
  for (let k = 0; k < n; k++) {
    const x = 6 + 116 * r(), y = 6 + 116 * r();
    drawLeaf(g, x, y, r() * PI * 2, { shape, len: len * (0.8 + 0.4 * r()), wid: wid * (0.85 + 0.3 * r()), lum: 0.6 + 0.4 * r(), fold: 0.1 });
  }
}

/** A fan of fine bare twigs: winter crowns and the fine wood inside a summer one. */
function paintTwigs(g: G, r: Rand) {
  g.lineCap = "round";
  const grow = (x: number, y: number, a: number, L: number, w: number, depth: number) => {
    const x1 = x + Math.cos(a) * L, y1 = y + Math.sin(a) * L;
    g.strokeStyle = grey(0.4 + 0.35 * r());
    g.lineWidth = w;
    g.beginPath();
    g.moveTo(x, y);
    g.quadraticCurveTo((x + x1) / 2 + (r() - 0.5) * 6, (y + y1) / 2 + (r() - 0.5) * 6, x1, y1);
    g.stroke();
    if (depth > 3 || L < 7) return;
    const kids = depth < 2 ? 3 : 2;
    for (let k = 0; k < kids; k++) grow(x1, y1, a + (r() - 0.5) * 1.5, L * (0.55 + 0.2 * r()), Math.max(0.5, w * 0.62), depth + 1);
    grow(x1, y1, a + (r() - 0.5) * 0.3, L * 0.7, Math.max(0.5, w * 0.7), depth + 1);
  };
  grow(64, 126, -PI / 2, 34, 3.2, 0);
  grow(64, 126, -PI / 2 - 0.5, 30, 2.4, 1);
  grow(64, 126, -PI / 2 + 0.5, 30, 2.4, 1);
}

/** A round head of tiny four-petal florets (hydrangea, viburnum, lilac). */
function paintBloomHead(g: G, r: Rand) {
  for (let k = 0; k < 70; k++) {
    const a = r() * PI * 2, d = 50 * Math.sqrt(r());
    const x = 64 + Math.cos(a) * d, y = 64 + Math.sin(a) * d, s = 6 + 3 * r(), lum = 0.78 + 0.22 * r();
    for (let p = 0; p < 4; p++) {
      const pa = (p / 4) * PI * 2 + r();
      g.fillStyle = grey(lum * (0.85 + 0.15 * (p % 2)));
      g.beginPath();
      g.ellipse(x + Math.cos(pa) * s * 0.5, y + Math.sin(pa) * s * 0.5, s * 0.52, s * 0.34, pa, 0, PI * 2);
      g.fill();
    }
    g.fillStyle = grey(0.55);
    g.beginPath();
    g.arc(x, y, 1.2, 0, PI * 2);
    g.fill();
  }
}

/** A hanging strand (willow, birch tips): the root is at the TOP of the tile, narrow leaves point down along a drooping twig. */
function paintLeafyStrand(g: G, r: Rand) {
  g.lineCap = "round";
  g.strokeStyle = grey(0.42);
  g.lineWidth = 1.8;
  g.beginPath();
  g.moveTo(64, 0);
  g.quadraticCurveTo(70, 60, 62, 126);
  g.stroke();
  const leaves: { x: number; y: number; a: number; l: number }[] = [];
  for (let y = 6; y < 122; y += 5.2) {
    const x = 64 + 3 * Math.sin(y * 0.05) - y / 126;
    for (const s of [-1, 1]) leaves.push({ x, y, a: PI / 2 + s * (0.55 + 0.35 * r()) + (r() - 0.5) * 0.2, l: 0.62 + 0.38 * r() });
  }
  for (const lf of leaves) drawLeaf(g, lf.x, lf.y, lf.a, { shape: SHAPES.willow, len: 20 + 8 * r(), wid: 4.6, lum: lf.l });
}

export function paintTreeTiles(g: G) {
  const S = SHAPES;
  tile(g, TILE.oak, (g, r) => sprig(g, r, S.oak, { n: 6, len: 46, wid: 21, spread: 0.95 }));
  tile(g, TILE.maple2, paintMapleSprig);
  tile(g, TILE.birch, (g, r) => sprig(g, r, S.birch, { n: 9, len: 33, wid: 17, spread: 0.85 }));
  tile(g, TILE.linden, (g, r) => sprig(g, r, S.linden, { n: 6, len: 42, wid: 26, spread: 0.95 }));
  tile(g, TILE.aspen, (g, r) => sprig(g, r, S.aspen, { n: 8, len: 31, wid: 17, spread: 1.0 }));
  tile(g, TILE.cherry, (g, r) => sprig(g, r, S.cherry, { n: 7, len: 40, wid: 17, spread: 0.8 }));
  tile(g, TILE.spruce, paintSpruceSpray);
  tile(g, TILE.pine, paintPineSprig);
  tile(g, TILE.willow, (g, r) => sprig(g, r, S.willow, { n: 14, len: 36, wid: 6.5, spread: 0.6, tipScale: 0.5 }));
  tile(g, TILE.ivy, (g, r) => paintPacked(g, r, S.holly, 22, 34, 17));
  tile(g, TILE.boxwood, (g, r) => paintPacked(g, r, S.box, 56, 22, 12));
  tile(g, TILE.bloomHead, paintBloomHead);
  tile(g, TILE.twigs, paintTwigs);
  tile(g, TILE.strand2, paintLeafyStrand);
}
