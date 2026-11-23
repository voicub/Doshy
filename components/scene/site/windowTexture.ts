import { CanvasTexture, RepeatWrapping, SRGBColorSpace } from "three";
import { WINDOW_CELLS, rng } from "@/lib/siteMesh";

/**
 * The neighbours' facade: WINDOW_CELLS x WINDOW_CELLS cells (one bay wide, one storey high each) of plaster with a window, a few with the blinds half down.
 * `lit` is the same layout as an emissive map: about a third of the windows glow warm (switched on by the walls' emissive intensity at night).
 * The canvas's top-right cell (texture u, v near 1) is plaster only: sheds and blank walls sample it. Built once, shared by every neighbour.
 */
const CELL = 64;
let cached: { wall: CanvasTexture; lit: CanvasTexture } | null = null;

function makeCanvas() {
  const c = document.createElement("canvas");
  c.width = c.height = CELL * WINDOW_CELLS;
  return { c, g: c.getContext("2d")! };
}

function finish(c: HTMLCanvasElement): CanvasTexture {
  const t = new CanvasTexture(c); // flipY (the default) puts the canvas's top row at v = 1: storeys count upwards
  t.wrapS = t.wrapT = RepeatWrapping;
  t.colorSpace = SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

export function windowTextures(): { wall: CanvasTexture; lit: CanvasTexture } {
  if (cached) return cached;
  const wall = makeCanvas();
  const lit = makeCanvas();
  const rnd = rng(20240611);
  wall.g.fillStyle = "#f2f0ea";
  wall.g.fillRect(0, 0, wall.c.width, wall.c.height);
  lit.g.fillStyle = "#000";
  lit.g.fillRect(0, 0, lit.c.width, lit.c.height);
  for (let row = 0; row < WINDOW_CELLS; row++) {
    for (let col = 0; col < WINDOW_CELLS; col++) {
      if (row === 0 && col === WINDOW_CELLS - 1) continue; // the plain cell
      const x = col * CELL;
      const y = row * CELL;
      wall.g.fillStyle = `rgba(0,0,0,${0.02 + rnd() * 0.04})`; // a faint plaster stain per cell
      wall.g.fillRect(x, y, CELL, CELL);
      const wx = x + 15, wy = y + 12, ww = CELL - 30, wh = CELL - 28;
      wall.g.fillStyle = "#e9e7e1"; // frame
      wall.g.fillRect(wx - 2, wy - 2, ww + 4, wh + 4);
      const glass = wall.g.createLinearGradient(wx, wy, wx, wy + wh);
      const sky = rnd() < 0.5;
      glass.addColorStop(0, sky ? "#5f7387" : "#2c3946");
      glass.addColorStop(1, sky ? "#34444f" : "#1d2630");
      wall.g.fillStyle = glass;
      wall.g.fillRect(wx, wy, ww, wh);
      const blinds = rnd();
      if (blinds < 0.22) {
        wall.g.fillStyle = "#b9b2a4";
        wall.g.fillRect(wx, wy, ww, wh * (0.35 + rnd() * 0.4));
      } else if (blinds < 0.34) {
        wall.g.fillStyle = "#c9b894";
        wall.g.fillRect(wx, wy, ww * 0.45, wh);
      }
      wall.g.fillStyle = "#e9e7e1"; // mullion and sill
      wall.g.fillRect(wx + ww / 2 - 1, wy, 2, wh);
      wall.g.fillStyle = "#b9b6ae";
      wall.g.fillRect(wx - 4, wy + wh + 2, ww + 8, 3);
      if (rnd() < 0.34) {
        const glow = lit.g.createLinearGradient(wx, wy, wx, wy + wh);
        glow.addColorStop(0, rnd() < 0.7 ? "#ffd69a" : "#cfe2ff");
        glow.addColorStop(1, "#ffb86b");
        lit.g.fillStyle = glow;
        lit.g.fillRect(wx, wy, ww, wh);
      }
    }
  }
  cached = { wall: finish(wall.c), lit: finish(lit.c) };
  return cached;
}
