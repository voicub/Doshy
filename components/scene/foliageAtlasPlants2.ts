import { PLANT_TILE as P } from "@/lib/vegPlantTiles";
import { grey, tile, type G, type Rand } from "./foliageAtlasKit";
import { PI, bump, drawLeaf, norm1 } from "./foliageAtlasLeaf";

/**
 * Houseplant tiles 32..63, part 2: pinnate fronds, sprigs, flower sprays, tiny-leaf clusters, moss, spines (see foliageAtlasPlants.ts for the broad leaves).
 * Long cards (fronds, sprigs, stems) are stretched to about 1 : A when they are drawn in 3D, so `strip` paints them in true proportions: the drawing is made
 * in a strip 128 / A wide and widened by A afterwards. The A of each tile is the typical length-to-width ratio the builders in lib/vegPlants*.ts use.
 */

/** Paint `draw` in a strip 128 / a wide (centred), stretched to the full tile width. */
function strip(g: G, a: number, draw: () => void) {
  g.save();
  g.translate(64, 0);
  g.scale(a, 1);
  g.translate(-64, 0);
  draw();
  g.restore();
}

const needle = (g: G, x: number, y: number, ang: number, len: number, lum: number, w = 2) => {
  g.strokeStyle = grey(lum);
  g.lineWidth = w;
  g.lineCap = "round";
  g.beginPath();
  g.moveTo(x, y);
  g.lineTo(x + Math.sin(ang) * len, y - Math.cos(ang) * len);
  g.stroke();
};

/** pinnate frond: rachis up the strip, pairs of pinnae angled forward */
function pinnate(g: G, r: Rand, a: number, o: { pairs: number; len: number; wid: number; ang: number; lum: [number, number]; from: number }) {
  strip(g, a, () => {
    g.strokeStyle = grey(0.9);
    g.lineWidth = 1.6;
    g.lineCap = "round";
    g.beginPath();
    g.moveTo(64, 127);
    g.lineTo(64, 4);
    g.stroke();
    for (let i = 0; i < o.pairs; i++) {
      const t = o.from + ((1 - o.from) * i) / o.pairs;
      const y = 124 - t * 116;
      const l = o.len * Math.pow(Math.sin(Math.PI * Math.min(0.98, 0.14 + 0.82 * t)), 0.7) * (1 - 0.2 * t);
      for (const side of [-1, 1]) {
        drawLeaf(g, { x: 64, y, len: l, wid: o.wid, ang: side * (o.ang + (r() - 0.5) * 0.25), prof: norm1(bump(0.85, 0.8)), lum: [o.lum[0] + r() * 0.1, o.lum[1] + r() * 0.1], rib: [0.95, 0.8], fold: 0.06 });
      }
    }
    drawLeaf(g, { x: 64, y: 10, len: 18, wid: o.wid, prof: norm1(bump(0.85, 0.8)), lum: o.lum, rib: [0.95, 0.8] });
  });
}

function zz(g: G, r: Rand) {
  strip(g, 2.3, () => {
    g.strokeStyle = grey(0.85);
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(64, 127);
    g.lineTo(64, 6);
    g.stroke();
    for (let i = 0; i < 8; i++) {
      const y = 112 - i * 13.5, l = 22 - i * 0.8;
      for (const side of [-1, 1]) {
        drawLeaf(g, { x: 64, y: y - (side > 0 ? 3 : 0), len: l, wid: 13, ang: side * (0.95 + r() * 0.15), prof: norm1(bump(0.8, 0.6)), lum: [0.62 + r() * 0.1, 0.95], rib: [0.98, 1], edge: [0.5, 0.8], fold: 0.08 });
      }
    }
    drawLeaf(g, { x: 64, y: 22, len: 20, wid: 12, prof: norm1(bump(0.8, 0.6)), lum: [0.75, 1], rib: [0.98, 1], edge: [0.5, 0.8] });
  });
}

function fan(g: G, r: Rand) {
  g.fillStyle = grey(0.62);
  g.beginPath();
  g.moveTo(64, 127);
  g.arc(64, 127, 52, -PI * 0.5 - 1.1, -PI * 0.5 + 1.1);
  g.closePath();
  g.fill();
  for (let k = 0; k < 11; k++) {
    const t = k / 10 - 0.5;
    drawLeaf(g, { x: 64, y: 127, len: 118 - Math.abs(t) * 40 + r() * 6, wid: 17, ang: t * 2.3, prof: norm1(bump(0.55, 0.8)), lum: [0.5 + r() * 0.1, 0.8 + r() * 0.15], rib: [0.35, 1], fold: 0.12 });
  }
}

function rosemary(g: G, r: Rand) {
  strip(g, 3.6, () => {
    g.strokeStyle = grey(0.7);
    g.lineWidth = 1.8;
    g.beginPath();
    g.moveTo(64, 127);
    g.lineTo(64, 6);
    g.stroke();
    for (let y = 120; y > 8; y -= 3.1) {
      const t = 1 - y / 128, l = 16 * (1 - 0.35 * t) * (0.8 + r() * 0.4);
      needle(g, 64, y, -0.85 - r() * 0.2, l, 0.55 + r() * 0.4, 2.2);
      needle(g, 64, y - 1.5, 0.85 + r() * 0.2, l, 0.55 + r() * 0.4, 2.2);
    }
    needle(g, 64, 8, 0, 14, 0.9, 2.2);
  });
}

function coin(g: G, x: number, y: number, rad: number, lum: number) {
  const rg = g.createRadialGradient(x - rad * 0.25, y - rad * 0.25, 0, x, y, rad);
  rg.addColorStop(0, grey(Math.min(1, lum + 0.25)));
  rg.addColorStop(1, grey(lum * 0.7));
  g.fillStyle = rg;
  g.beginPath();
  g.ellipse(x, y, rad, rad * 0.94, 0, 0, PI * 2);
  g.fill();
  g.strokeStyle = grey(lum * 0.55, 0.7);
  g.lineWidth = 0.8;
  g.beginPath();
  g.moveTo(x, y + rad * 0.9);
  g.lineTo(x, y - rad * 0.7);
  g.stroke();
}

function eucalyptus(g: G, r: Rand) {
  strip(g, 3.2, () => {
    g.strokeStyle = grey(0.8);
    g.lineWidth = 1.8;
    g.beginPath();
    g.moveTo(64, 127);
    g.quadraticCurveTo(66, 70, 64, 8);
    g.stroke();
    for (let i = 0; i < 5; i++) {
      const y = 108 - i * 22, rad = 15 - i * 1.4;
      coin(g, 64 - rad * 0.95, y, rad, 0.6 + r() * 0.2);
      coin(g, 64 + rad * 0.95, y - 4, rad, 0.6 + r() * 0.2);
    }
    coin(g, 64, 12, 9, 0.8);
  });
}

function pampas(g: G, r: Rand) {
  strip(g, 2.2, () => {
    g.strokeStyle = grey(0.8);
    g.lineWidth = 1.4;
    g.beginPath();
    g.moveTo(64, 127);
    g.lineTo(64, 40);
    g.stroke();
    g.lineCap = "round";
    for (let k = 0; k < 330; k++) {
      const t = r(), y0 = 106 - t * 92;
      const spread = 24 * Math.sin(PI * Math.pow(Math.min(0.999, (106 - y0) / 100), 0.75)) + 2;
      const side = r() - 0.5, x1 = 64 + side * 2 * spread;
      g.strokeStyle = grey(0.55 + r() * 0.45, 0.85);
      g.lineWidth = 0.9 + r() * 0.6;
      g.beginPath();
      g.moveTo(64 + side * 3, y0 + 14);
      g.quadraticCurveTo(64 + side * spread, y0 + 4, x1, y0 - 9 - r() * 10);
      g.stroke();
    }
  });
}

function leafy(g: G, r: Rand, n: number, rx: number, ry: number, inside: (x: number, y: number) => boolean, lum: [number, number], back: () => void) {
  back();
  for (let k = 0; k < n; k++) {
    let x = 0, y = 0;
    for (let tries = 0; tries < 20; tries++) {
      x = 6 + r() * 116;
      y = 6 + r() * 116;
      if (inside(x, y)) break;
    }
    const a = r() * PI, lm = lum[0] + (lum[1] - lum[0]) * r();
    g.save();
    g.translate(x, y);
    g.rotate(a);
    g.fillStyle = grey(lm);
    g.beginPath();
    g.ellipse(0, 0, rx, ry, 0, 0, PI * 2);
    g.fill();
    g.fillStyle = grey(Math.min(1, lm + 0.3), 0.6);
    g.beginPath();
    g.ellipse(-rx * 0.2, -ry * 0.25, rx * 0.45, ry * 0.3, 0, 0, PI * 2);
    g.fill();
    g.restore();
  }
}

const inCloud = (x: number, y: number) => ((x - 64) / 58) ** 2 + ((y - 62) / 44) ** 2 < 1 && y < 104 + Math.sin(x * 0.2) * 4;

function lavender(g: G, r: Rand) {
  strip(g, 3.8, () => {
    g.strokeStyle = grey(0.7);
    g.lineWidth = 1.6;
    g.beginPath();
    g.moveTo(64, 127);
    g.lineTo(64, 14);
    g.stroke();
    for (let y = 80; y > 8; y -= 4.6) {
      const t = (80 - y) / 72;
      for (let k = 0; k < 4; k++) {
        const a = k * PI * 0.5 + y * 0.9;
        const x = 64 + Math.cos(a) * 3.2 * (1 - t * 0.4);
        g.fillStyle = grey(0.62 + 0.38 * t * r() + 0.15 * r());
        g.beginPath();
        g.ellipse(x, y - k * 1.2, 4.4 * (1 - t * 0.4), 3.2, 0.3 * Math.cos(a), 0, PI * 2);
        g.fill();
      }
    }
  });
}

function vine(g: G, r: Rand) {
  strip(g, 3.6, () => {
    g.strokeStyle = grey(0.85);
    g.lineWidth = 1.6;
    g.beginPath();
    g.moveTo(64, 127);
    for (let y = 127; y > 4; y -= 6) g.lineTo(64 + Math.sin(y * 0.09) * 3, y);
    g.stroke();
    for (let i = 0; i < 6; i++) {
      const y = 112 - i * 20, side = i % 2 ? 1 : -1, l = 24 - i * 1.5;
      drawLeaf(g, { x: 64, y, len: l, wid: l * 0.95, ang: side * (1.15 + r() * 0.3), prof: norm1((t) => Math.pow(Math.sin(PI * Math.pow(t, 0.68)), 0.7) * (0.45 + 0.55 * Math.min(1, t * 10))), lum: [0.5 + r() * 0.15, 0.85], rib: [0.92, 1], fold: 0.06 });
    }
    drawLeaf(g, { x: 64, y: 22, len: 20, wid: 19, prof: norm1((t) => Math.pow(Math.sin(PI * Math.pow(t, 0.68)), 0.7) * (0.45 + 0.55 * Math.min(1, t * 10))), lum: [0.7, 1], rib: [0.92, 1] });
  });
}

function dry(g: G, r: Rand) {
  strip(g, 4.5, () => {
    g.lineCap = "round";
    g.strokeStyle = grey(0.7);
    g.lineWidth = 1.5;
    g.beginPath();
    g.moveTo(64, 127);
    g.lineTo(64, 40);
    g.stroke();
    for (let i = 0; i < 12; i++) {
      const y = 46 - i * 3.4;
      for (const side of [-1, 1]) {
        g.fillStyle = grey(0.7 + r() * 0.3);
        g.beginPath();
        g.ellipse(64 + side * 3, y, 2.2, 3.4, side * 0.3, 0, PI * 2);
        g.fill();
        needle(g, 64 + side * 3, y, side * 0.2, 12 + r() * 4, 0.9, 0.7);
      }
    }
  });
}

function bloom(g: G, x: number, y: number, rad: number, rot: number, petals = 5) {
  for (let k = 0; k < petals; k++) {
    const a = rot + (k / petals) * PI * 2;
    const px = x + Math.cos(a) * rad * 0.55, py = y + Math.sin(a) * rad * 0.55;
    const rg = g.createRadialGradient(x, y, 0, px, py, rad * 0.7);
    rg.addColorStop(0, grey(0.7));
    rg.addColorStop(1, grey(1));
    g.fillStyle = rg;
    g.beginPath();
    g.ellipse(px, py, rad * 0.55, rad * 0.38, a, 0, PI * 2);
    g.fill();
  }
  g.fillStyle = grey(0.4);
  g.beginPath();
  g.arc(x, y, rad * 0.2, 0, PI * 2);
  g.fill();
}

function blooms(g: G, r: Rand) {
  g.strokeStyle = grey(0.55);
  g.lineWidth = 1.6;
  const spots: [number, number, number][] = [[28, 38, 13], [80, 24, 14], [100, 64, 12], [50, 70, 14], [74, 54, 9], [20, 84, 9]];
  for (const [x, y] of spots) {
    g.beginPath();
    g.moveTo(64, 127);
    g.quadraticCurveTo(64 + (x - 64) * 0.3, y + 50, x, y);
    g.stroke();
  }
  for (const [x, y, rad] of spots) bloom(g, x, y, rad * 1.4, r() * 6);
}

function moss(g: G, r: Rand) {
  for (let k = 0; k < 420; k++) {
    const a = r() * PI * 2, d = Math.sqrt(r());
    const x = 64 + Math.cos(a) * d * 58, y = 66 + Math.sin(a) * d * 46;
    g.fillStyle = grey(0.4 + r() * 0.6);
    g.beginPath();
    g.arc(x, y, 3 + r() * 5, 0, PI * 2);
    g.fill();
  }
}

function spines(g: G, r: Rand) {
  g.lineCap = "round";
  for (let k = 0; k < 14; k++) {
    const a = (k / 14) * PI * 2 + r() * 0.3, l = 22 + r() * 22;
    g.strokeStyle = grey(0.85 + r() * 0.15);
    g.lineWidth = 1.6;
    g.beginPath();
    g.moveTo(64, 64);
    g.lineTo(64 + Math.cos(a) * l, 64 + Math.sin(a) * l);
    g.stroke();
  }
  g.fillStyle = grey(0.75);
  g.beginPath();
  g.arc(64, 64, 4, 0, PI * 2);
  g.fill();
}

function orchid(g: G, r: Rand) {
  strip(g, 1.5, () => {
    g.strokeStyle = grey(0.7);
    g.lineWidth = 2;
    g.lineCap = "round";
    g.beginPath();
    g.moveTo(40, 127);
    g.quadraticCurveTo(44, 40, 88, 14);
    g.stroke();
    [[41, 96, 17], [46, 74, 16], [58, 52, 14], [74, 34, 12], [90, 20, 9]].forEach(([x, y, rad], i) => bloom(g, x + (i % 2 ? 14 : -10), y, rad, r() * 0.5, 5));
    for (const [x, y] of [[96, 12], [100, 24]]) {
      g.fillStyle = grey(0.85);
      g.beginPath();
      g.arc(x, y, 4, 0, PI * 2);
      g.fill();
    }
  });
}

export function paintFineTiles(g: G) {
  tile(g, P.zz, zz);
  tile(g, P.frond, (g, r) => pinnate(g, r, 2.4, { pairs: 22, len: 34, wid: 5.5, ang: 0.95, lum: [0.55, 0.8], from: 0.04 }));
  tile(g, P.fern, (g, r) => pinnate(g, r, 3, { pairs: 26, len: 24, wid: 6.4, ang: 1.1, lum: [0.5, 0.82], from: 0.03 }));
  tile(g, P.fan, fan);
  tile(g, P.rosemary, rosemary);
  tile(g, P.eucalyptus, eucalyptus);
  tile(g, P.pampas, pampas);
  tile(g, P.boxwood, (g, r) => leafy(g, r, 230, 5.4, 3.6, (x, y) => (x - 64) ** 2 + (y - 64) ** 2 < 58 * 58, [0.45, 0.95], () => {
    g.fillStyle = grey(0.3);
    g.beginPath();
    g.arc(64, 64, 50, 0, PI * 2);
    g.fill();
  }));
  tile(g, P.bonsai, (g, r) => leafy(g, r, 190, 7, 4.4, inCloud, [0.4, 0.95], () => {
    g.fillStyle = grey(0.3);
    g.beginPath();
    g.ellipse(64, 66, 50, 34, 0, 0, PI * 2);
    g.fill();
  }));
  tile(g, P.lavender, lavender);
  tile(g, P.vine, vine);
  tile(g, P.dry, dry);
  tile(g, P.blooms, blooms);
  tile(g, P.moss, moss);
  tile(g, P.spines, spines);
  tile(g, P.orchid, orchid);
}
