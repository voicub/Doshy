import { rngOf } from "@/lib/mathUtil";
import { ATLAS_COLS, ATLAS_ROWS } from "@/lib/vegBuilder";

/**
 * Drawing helpers shared by the leaf atlas painters (foliageAtlas.ts, foliageAtlasTrees.ts, foliageAtlasPlants.ts).
 * The atlas is ATLAS_COLS x ATLAS_ROWS tiles of neutral grey leaf shapes on transparent ground; the foliage shader multiplies them by the
 * season colour (trees) or the vertex colour (houseplants), so they only carry shape, veins and light / dark variation.
 * In every tile the base of a card is at the bottom of the tile (strands hang from the top). Painters draw in 0..128 units.
 */
/** Side of one tile in pixels while painting: 256 normally, 128 for the Eco tier (a quarter of the memory and paint time; set before painting with `setTilePx`). Painters never see it. */
let T = 256;
export const setTilePx = (px: number): void => void (T = px);
export const atlasW = (): number => T * ATLAS_COLS;
export const atlasH = (): number => T * ATLAS_ROWS;
export type G = CanvasRenderingContext2D;
export type Rand = () => number;

export const grey = (v: number, a = 1) => `rgba(${(v * 255) | 0},${(v * 255) | 0},${(v * 255) | 0},${a})`;

/** Draw into tile `i` with the origin at its top-left corner, in 0..128 units, clipped to the tile. */
export function tile(g: G, i: number, draw: (g: G, r: Rand) => void) {
  g.save();
  g.translate((i % ATLAS_COLS) * T, Math.floor(i / ATLAS_COLS) * T);
  g.beginPath();
  g.rect(0, 0, T, T);
  g.clip();
  g.scale(T / 128, T / 128);
  draw(g, rngOf(i * 97 + 5));
  g.restore();
}

/** A pointed oval leaf from (x, y) pointing along `a`, with a midrib. */
export function leaf(g: G, x: number, y: number, a: number, len: number, wid: number, lum: number, ribs = true) {
  g.save();
  g.translate(x, y);
  g.rotate(a);
  const grad = g.createLinearGradient(0, 0, len, 0);
  grad.addColorStop(0, grey(lum * 0.72));
  grad.addColorStop(1, grey(Math.min(1, lum * 1.08)));
  g.fillStyle = grad;
  g.beginPath();
  g.moveTo(0, 0);
  g.bezierCurveTo(len * 0.25, -wid * 0.75, len * 0.7, -wid * 0.6, len, 0);
  g.bezierCurveTo(len * 0.7, wid * 0.6, len * 0.25, wid * 0.75, 0, 0);
  g.fill();
  if (ribs) {
    g.strokeStyle = grey(lum * 0.55, 0.85);
    g.lineWidth = Math.max(0.6, wid * 0.07);
    g.beginPath();
    g.moveTo(0, 0);
    g.lineTo(len * 0.92, 0);
    g.stroke();
  }
  g.restore();
}

export const blob = (g: G, x: number, y: number, r: number, lum: number) => {
  g.fillStyle = grey(lum);
  g.beginPath();
  g.arc(x, y, r, 0, Math.PI * 2);
  g.fill();
};
