import { PLANT_TILE as P } from "@/lib/vegPlantTiles";
import { grey, tile, type G, type Rand } from "./foliageAtlasKit";
import { PI, bump, drawLeaf, norm1, sm, type Prof } from "./foliageAtlasLeaf";
import { paintFineTiles } from "./foliageAtlasPlants2";

/**
 * Houseplant and artificial-plant leaf tiles 32..63 (names in lib/vegPlantTiles.ts), painted once into the shared leaf atlas. Greys only: the vertex colour
 * of the plant gives the green. This file paints the broad single leaves (fiddle, monstera, rubber plant, snake plant, pothos, calathea, aloe, jade,
 * rosettes, pads, herbs, artificial leaves, yucca, spider plant); the fronds, sprigs, flowers and moss are in foliageAtlasPlants2.ts.
 */

const violin = norm1((t) => Math.pow(Math.sin(PI * Math.pow(t, 0.85)), 0.7) * (1 - 0.3 * Math.exp(-(((t - 0.36) / 0.12) ** 2))) * (0.78 + 0.22 * sm(0.15, 0.7, t)));
const heart = norm1((t) => Math.max(Math.pow(Math.sin(PI * Math.pow(t, 0.7)), 0.7) * (1 - 0.1 * t), 0.55 * Math.sqrt(Math.max(0, 1 - ((t - 0.12) / 0.14) ** 2))));
const pointedOval: Prof = norm1((t) => Math.pow(Math.sin(PI * Math.pow(t, 0.8)), 0.85) * (1 - 0.15 * t));

/** a soft pale blotch, clipped by the caller */
function blotch(g: G, x: number, y: number, r: number, lum: number, a: number) {
  const rg = g.createRadialGradient(x, y, 0, x, y, r);
  rg.addColorStop(0, grey(lum, a));
  rg.addColorStop(1, grey(lum, 0));
  g.fillStyle = rg;
  g.fillRect(x - r, y - r, r * 2, r * 2);
}

function monstera(g: G) {
  drawLeaf(g, {
    prof: heart, notch: 0.11, lum: [0.52, 0.78], fold: 0.1, rib: [0.95, 2.8], edge: [0.42, 1],
    veins: { n: 9, lum: 0.92, w: 1.1, from: 0.12, to: 0.85, sweep: 0.16 },
    after: (g, len, half) => {
      g.globalCompositeOperation = "destination-out";
      g.fillStyle = "#000";
      for (const side of [-1, 1]) {
        for (let i = 0; i < 5; i++) {
          const t = 0.26 + i * 0.125;
          const ex = side * (half + 6), ey = -t * len;
          const ix = side * half * (0.2 + 0.05 * i), iy = -(t - 0.03) * len;
          g.beginPath();
          g.moveTo(ex, ey - 4.5);
          g.lineTo(ex, ey + 4.5);
          g.lineTo(ix, iy);
          g.closePath();
          g.fill();
        }
        for (const t of [0.34, 0.5, 0.66]) {
          g.beginPath();
          g.ellipse(side * half * 0.3, -t * len, 3.2, 6, 0, 0, PI * 2);
          g.fill();
        }
      }
      g.globalCompositeOperation = "source-over";
    },
  });
}

function snake(g: G, r: Rand) {
  drawLeaf(g, {
    prof: (t) => Math.min(1, 0.55 + t * 2.2) * (1 - Math.pow(sm(0.72, 1, t), 1.2) * 0.98), lum: [0.55, 0.78], edge: [1, 2.6], rib: [0.4, 1.4],
    after: (g, len, half) => {
      g.lineCap = "round";
      for (let k = 0; k < 11; k++) {
        const t = 0.05 + k * 0.085 + r() * 0.02;
        g.strokeStyle = grey(0.3, 0.55);
        g.lineWidth = 3 + r() * 2;
        g.beginPath();
        for (let i = 0; i <= 12; i++) {
          const x = -half + (i / 12) * half * 2;
          const y = -t * len - Math.sin(i * 1.7 + k) * 2.4 - Math.abs(x) * 0.05;
          if (i) g.lineTo(x, y);
          else g.moveTo(x, y);
        }
        g.stroke();
      }
      g.strokeStyle = grey(0.95, 0.4);
      g.lineWidth = 6;
      g.beginPath();
      g.moveTo(-half * 0.45, 0);
      g.lineTo(-half * 0.45, -len * 0.8);
      g.stroke();
    },
  });
}

function ficus(g: G) {
  drawLeaf(g, {
    prof: norm1((t) => Math.pow(Math.sin(PI * Math.pow(t, 0.82)), 0.82) * (1 - 0.1 * t)), lum: [0.55, 0.82], fold: 0.08, rib: [0.95, 2.6], edge: [0.45, 1],
    veins: { n: 16, lum: 0.7, w: 0.9, from: 0.05, to: 0.95, sweep: 0.08 },
    after: (g, len, half) => {
      g.strokeStyle = grey(1, 0.3);
      g.lineWidth = half * 0.5;
      g.beginPath();
      g.moveTo(half * 0.4, -len * 0.15);
      g.quadraticCurveTo(half * 0.6, -len * 0.45, half * 0.35, -len * 0.75);
      g.stroke();
    },
  });
}

function heartLeaf(g: G, r: Rand) {
  drawLeaf(g, {
    prof: heart, notch: 0.09, lum: [0.56, 0.78], fold: 0.07, rib: [0.88, 2.2], veins: { n: 7, lum: 0.42, w: 1.2, from: 0.12, to: 0.85, sweep: 0.16 },
    after: (g, len, half) => {
      for (let k = 0; k < 9; k++) blotch(g, (r() - 0.5) * half * 1.5, -(0.15 + r() * 0.7) * len, 10 + r() * 18, 1, 0.72);
    },
  });
}

function calathea(g: G) {
  drawLeaf(g, {
    prof: norm1((t) => Math.pow(Math.sin(PI * Math.pow(t, 0.9)), 0.85)), lum: [0.78, 0.95], rib: [1, 3.4], edge: [0.55, 1.5],
    after: (g, len, half) => {
      g.lineCap = "round";
      for (const side of [-1, 1]) {
        for (let i = 0; i < 9; i++) {
          const t = 0.06 + i * 0.1;
          g.strokeStyle = grey(0.32, 0.7);
          g.lineWidth = 5.5;
          g.beginPath();
          g.moveTo(0, -t * len);
          g.quadraticCurveTo(side * half * 0.5, -(t + 0.03) * len, side * half * 0.92, -(t + 0.17) * len);
          g.stroke();
          g.strokeStyle = grey(1, 0.5);
          g.lineWidth = 2;
          g.beginPath();
          g.moveTo(0, -(t + 0.05) * len);
          g.quadraticCurveTo(side * half * 0.5, -(t + 0.08) * len, side * half * 0.9, -(t + 0.22) * len);
          g.stroke();
        }
      }
    },
  });
}

function aloe(g: G, r: Rand) {
  drawLeaf(g, {
    prof: (t) => Math.min(1, 0.55 + t * 5) * Math.pow(1 - Math.pow(t, 1.25), 0.85), lum: [0.58, 0.8], teeth: [9, 0.11], edge: [0.98, 1.4], fold: 0.08,
    after: (g, len, half) => {
      for (let k = 0; k < 26; k++) {
        g.fillStyle = grey(0.98, 0.45);
        g.beginPath();
        g.ellipse((r() - 0.5) * half * 1.3, -(0.1 + r() * 0.7) * len, 2.4, 1.1, r() * 3, 0, PI * 2);
        g.fill();
      }
      g.strokeStyle = grey(0.4, 0.5);
      g.lineWidth = 3;
      g.beginPath();
      g.moveTo(0, 0);
      g.lineTo(0, -len * 0.85);
      g.stroke();
    },
  });
}

function fat(g: G) {
  drawLeaf(g, {
    prof: norm1((t) => Math.pow(Math.sin(PI * Math.pow(t, 0.95)), 0.55)), lum: [0.7, 0.96], edge: [0.52, 1.6],
    after: (g, len, half) => {
      blotch(g, -half * 0.25, -len * 0.62, half * 0.7, 1, 0.5);
    },
  });
}

function rosette(g: G) {
  const ring = (n: number, len: number, wid: number, lum: [number, number], off: number) => {
    for (let k = 0; k < n; k++) {
      drawLeaf(g, { x: 64, y: 64, len, wid, ang: off + (k / n) * PI * 2, prof: norm1(bump(0.62, 0.7)), lum, fold: 0.12, edge: [0.5, 0.8] });
    }
  };
  ring(11, 60, 30, [0.55, 0.74], 0);
  ring(9, 46, 26, [0.65, 0.84], 0.3);
  ring(7, 32, 20, [0.76, 0.92], 0.15);
  ring(5, 18, 12, [0.88, 1], 0.5);
}

function pad(g: G) {
  drawLeaf(g, {
    prof: norm1((t) => Math.pow(Math.sin(PI * Math.pow(t, 0.9)), 0.62) * (0.35 + 0.65 * sm(0, 0.14, t))), lum: [0.6, 0.78], edge: [0.48, 1.6],
    after: (g, len, half) => {
      blotch(g, -half * 0.3, -len * 0.6, half * 0.8, 1, 0.3);
      for (let row = 0; row < 6; row++) {
        for (let col = -3; col <= 3; col++) {
          const x = (col + (row % 2) * 0.5) * 17, y = -(0.12 + row * 0.15) * len;
          if (Math.abs(x) > half * 0.85 * Math.sin(PI * (0.12 + row * 0.15 + 0.02))) continue;
          g.fillStyle = grey(0.96);
          g.beginPath();
          g.arc(x, y, 2.2, 0, PI * 2);
          g.fill();
          g.strokeStyle = grey(1, 0.9);
          g.lineWidth = 0.7;
          for (let s = 0; s < 6; s++) {
            const a = s * 1.05 + col;
            g.beginPath();
            g.moveTo(x, y);
            g.lineTo(x + Math.cos(a) * 5, y + Math.sin(a) * 5);
            g.stroke();
          }
        }
      }
    },
  });
}

function herb(g: G, round: boolean) {
  drawLeaf(g, round
    ? { prof: norm1((t) => Math.pow(Math.sin(PI * Math.pow(t, 0.85)), 0.62)), lum: [0.6, 0.86], teeth: [14, 0.1], rib: [0.95, 2], fold: 0.06, veins: { n: 8, lum: 0.4, w: 1.6, from: 0.06, to: 0.9, sweep: 0.16 } }
    : { prof: pointedOval, lum: [0.6, 0.9], teeth: [8, 0.03], rib: [0.95, 2], fold: 0.07, veins: { n: 6, lum: 0.48, w: 1.2, from: 0.1, to: 0.85, sweep: 0.2 } });
}

function fake(g: G) {
  drawLeaf(g, {
    prof: norm1(bump(0.88, 0.85)), lum: [0.72, 0.96], rib: [1, 3.6], edge: [0.55, 1.5], fold: 0.05,
    veins: { n: 12, lum: 0.99, w: 0.9, from: 0.06, to: 0.92, sweep: 0.12 },
  });
}

function pilea(g: G) {
  g.strokeStyle = grey(0.9);
  g.lineWidth = 3;
  g.lineCap = "round";
  g.beginPath();
  g.moveTo(64, 127);
  g.quadraticCurveTo(64, 100, 64, 70);
  g.stroke();
  g.beginPath();
  for (let i = 0; i <= 64; i++) {
    const a = (i / 64) * PI * 2;
    const rr = 58 * (1 + 0.03 * Math.sin(a * 11));
    g.lineTo(64 + Math.cos(a) * rr * 0.98, 62 + Math.sin(a) * rr * 0.5 * 1.45);
  }
  g.closePath();
  const grad = g.createRadialGradient(64, 62, 4, 64, 62, 56);
  grad.addColorStop(0, grey(0.95));
  grad.addColorStop(0.6, grey(0.78));
  grad.addColorStop(1, grey(0.55));
  g.fillStyle = grad;
  g.fill();
  g.save();
  g.clip();
  g.strokeStyle = grey(1, 0.9);
  g.lineWidth = 1.5;
  for (let k = 0; k < 9; k++) {
    const a = (k / 9) * PI * 2;
    g.beginPath();
    g.moveTo(64, 62);
    g.lineTo(64 + Math.cos(a) * 60, 62 + Math.sin(a) * 40);
    g.stroke();
  }
  g.restore();
}

function yucca(g: G) {
  drawLeaf(g, {
    prof: (t) => Math.min(1, 0.45 + t * 4) * (1 - Math.pow(sm(0.45, 1, t), 1.5) * 0.99), lum: [0.55, 0.82], edge: [0.98, 1.5], rib: [0.38, 2.2], fold: 0.1,
    after: (g, len, half) => {
      g.strokeStyle = grey(0.95, 0.35);
      g.lineWidth = 2.4;
      for (const x of [-0.45, 0.5]) {
        g.beginPath();
        g.moveTo(x * half, 0);
        g.lineTo(x * half * 0.7, -len * 0.7);
        g.stroke();
      }
    },
  });
}

function spider(g: G) {
  drawLeaf(g, {
    prof: norm1((t) => Math.pow(Math.sin(PI * Math.pow(t, 0.7)), 0.8) * (0.55 + 0.45 * sm(0, 0.3, t))), lum: [0.6, 0.78], fold: 0.08,
    after: (g, len, half) => {
      const gr = g.createLinearGradient(-half, 0, half, 0);
      gr.addColorStop(0, grey(0.6, 0));
      gr.addColorStop(0.28, grey(0.7, 0.5));
      gr.addColorStop(0.5, grey(1, 0.95));
      gr.addColorStop(0.72, grey(0.7, 0.5));
      gr.addColorStop(1, grey(0.6, 0));
      g.fillStyle = gr;
      g.fillRect(-half, -len, half * 2, len);
    },
  });
}

export function paintPlantTiles(g: G) {
  tile(g, P.fiddle, (g) => drawLeaf(g, { prof: violin, lum: [0.58, 0.8], fold: 0.1, rib: [0.97, 2.6], edge: [0.45, 1], veins: { n: 9, lum: 0.97, w: 1.4, from: 0.08, to: 0.88, sweep: 0.12 } }));
  tile(g, P.monstera, monstera);
  tile(g, P.ficus, ficus);
  tile(g, P.snake, snake);
  tile(g, P.heart, heartLeaf);
  tile(g, P.calathea, calathea);
  tile(g, P.aloe, aloe);
  tile(g, P.fat, fat);
  tile(g, P.rosette, rosette);
  tile(g, P.pad, pad);
  tile(g, P.basil, (g) => herb(g, false));
  tile(g, P.mint, (g) => herb(g, true));
  tile(g, P.fake, fake);
  tile(g, P.pilea, pilea);
  tile(g, P.yucca, yucca);
  tile(g, P.spider, spider);
  paintFineTiles(g);
}
