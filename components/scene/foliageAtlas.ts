import { DataTexture, LinearFilter, LinearMipmapLinearFilter, RGBAFormat, SRGBColorSpace, UnsignedByteType } from "three";
import { TILE } from "@/lib/vegBuilder";
import { atlasH, atlasW, blob, grey, leaf, setTilePx, tile, type G } from "./foliageAtlasKit";
import { paintPlantTiles } from "./foliageAtlasPlants";
import { paintTreeTiles } from "./foliageAtlasTrees";

/**
 * The leaf atlas: 8x8 tiles of neutral grey leaf clusters on transparent ground (see foliageAtlasKit.ts). The foliage shader multiplies them by the
 * season colour, so they only carry shape, vein and light/dark variation. Tile 0 is solid white (bark, cores, rocks).
 * Tiles 0..15 are the original clusters painted here, 16..31 the species sprigs (foliageAtlasTrees.ts), 32..63 houseplants (foliageAtlasPlants.ts).
 */

/** n leaves radiating from the tile centre: a clump of foliage seen from outside. */
function rosette(g: G, r: () => number, n: number, len: number, wid: number, spread: number) {
  for (let k = 0; k < n; k++) {
    const a = (k / n) * Math.PI * 2 + r() * 0.6;
    const d = spread * (0.1 + 0.9 * r());
    leaf(g, 64 + Math.cos(a) * d * 0.5, 64 + Math.sin(a) * d * 0.5, a + (r() - 0.5) * 0.6, len * (0.75 + 0.5 * r()), wid * (0.8 + 0.4 * r()), 0.72 + 0.28 * r());
  }
  // a few small leaves in the middle so the clump has no hole
  for (let k = 0; k < 5; k++) leaf(g, 64, 64, r() * 6.3, len * 0.7, wid * 0.9, 0.7 + 0.2 * r());
}

function paintNeedles(g: G, r: () => number) {
  // a feathery sprig: stem from the bottom, needles fanning to both sides
  g.strokeStyle = grey(0.6);
  g.lineWidth = 2.2;
  g.beginPath();
  g.moveTo(64, 128);
  g.lineTo(64, 10);
  g.stroke();
  for (let y = 120; y > 8; y -= 3.1) {
    const reach = 34 * Math.pow(Math.min(1, (y - 6) / 90), 0.7) + 4;
    for (const s of [-1, 1]) {
      const lum = 0.72 + 0.28 * r();
      g.strokeStyle = grey(lum);
      g.lineWidth = 1.7;
      g.beginPath();
      g.moveTo(64, y);
      g.quadraticCurveTo(64 + s * reach * 0.5, y - 5, 64 + s * reach * (0.85 + 0.2 * r()), y - 9 - 4 * r());
      g.stroke();
    }
  }
}

function paintMaple(g: G, r: () => number) {
  const lobed = (x: number, y: number, size: number, rot: number, lum: number) => {
    g.save();
    g.translate(x, y);
    g.rotate(rot);
    g.fillStyle = grey(lum);
    g.beginPath();
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
      const rr = (i % 2 ? 0.42 : 1) * size;
      g.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
    }
    g.closePath();
    g.fill();
    g.strokeStyle = grey(lum * 0.55, 0.8);
    g.lineWidth = 1;
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2 - Math.PI / 2;
      g.beginPath();
      g.moveTo(0, 0);
      g.lineTo(Math.cos(a) * size * 0.85, Math.sin(a) * size * 0.85);
      g.stroke();
    }
    g.restore();
  };
  for (let k = 0; k < 7; k++) lobed(64 + (r() - 0.5) * 58, 64 + (r() - 0.5) * 58, 19 + 8 * r(), r() * 6.3, 0.72 + 0.28 * r());
  lobed(64, 64, 22, r() * 6, 0.85);
}

function paintBlossom(g: G, r: () => number) {
  for (let k = 0; k < 16; k++) {
    const x = 64 + (r() - 0.5) * 92, y = 64 + (r() - 0.5) * 92, s = 10 + 6 * r();
    const lum = 0.85 + 0.15 * r();
    for (let p = 0; p < 5; p++) {
      const a = (p / 5) * Math.PI * 2 + r();
      blob(g, x + Math.cos(a) * s * 0.5, y + Math.sin(a) * s * 0.5, s * 0.46, lum);
    }
    blob(g, x, y, s * 0.2, lum * 0.55);
  }
}

function paintBlades(g: G, r: () => number) {
  for (let k = 0; k < 9; k++) {
    const x0 = 20 + (k / 8) * 88 + (r() - 0.5) * 8;
    const h = 70 + 56 * r(), lean = (r() - 0.5) * 36, w = 6 + 3 * r();
    const lum = 0.75 + 0.25 * r();
    const grad = g.createLinearGradient(0, 128, 0, 128 - h);
    grad.addColorStop(0, grey(lum * 0.7));
    grad.addColorStop(1, grey(Math.min(1, lum * 1.1)));
    g.fillStyle = grad;
    g.beginPath();
    g.moveTo(x0 - w / 2, 128);
    g.quadraticCurveTo(x0 - w * 0.3 + lean * 0.3, 128 - h * 0.55, x0 + lean, 128 - h);
    g.quadraticCurveTo(x0 + w * 0.3 + lean * 0.3, 128 - h * 0.55, x0 + w / 2, 128);
    g.fill();
  }
}

function paintFlower(g: G, r: () => number) {
  for (let p = 0; p < 14; p++) leaf(g, 64, 64, (p / 14) * Math.PI * 2, 48, 13, 0.88 + 0.12 * r(), false);
  blob(g, 64, 64, 12, 0.62);
  blob(g, 64, 64, 6.5, 0.45);
}

function paintFrond(g: G, r: () => number, fine: boolean) {
  g.strokeStyle = grey(0.55);
  g.lineWidth = 2;
  g.beginPath();
  g.moveTo(64, 128);
  g.lineTo(64, 6);
  g.stroke();
  const step = fine ? 4.5 : 7.5;
  for (let y = 122; y > 12; y -= step) {
    const reach = (fine ? 38 : 56) * Math.pow(Math.min(1, (y - 4) / 100), 0.55);
    for (const s of [-1, 1]) {
      leaf(g, 64, y, (s < 0 ? Math.PI : 0) - s * 0.0 + (s < 0 ? 0.55 : -0.55), reach, fine ? 9 : 11, 0.74 + 0.26 * r());
    }
  }
}

function paintStrand(g: G, r: () => number) {
  // attached at the top, leaves hang downward
  g.strokeStyle = grey(0.6);
  g.lineWidth = 1.8;
  g.beginPath();
  g.moveTo(64, 0);
  g.lineTo(64, 126);
  g.stroke();
  for (let y = 6; y < 122; y += 5.2) {
    for (const s of [-1, 1]) leaf(g, 64, y, Math.PI / 2 - s * 0.55, 30 + 14 * r(), 7, 0.75 + 0.25 * r(), false);
  }
}

function paintClover(g: G, r: () => number) {
  for (let k = 0; k < 6; k++) {
    const x = 28 + r() * 72, y = 28 + r() * 72, s = 15 + 4 * r(), rot = r() * 6.3;
    const lum = 0.75 + 0.25 * r();
    for (let p = 0; p < 3; p++) blob(g, x + Math.cos(rot + p * 2.094) * s * 0.55, y + Math.sin(rot + p * 2.094) * s * 0.55, s * 0.55, lum);
  }
}

function paintSpike(g: G, r: () => number) {
  for (let y = 124; y > 4; y -= 4.2) {
    const f = (y - 4) / 120;
    const reach = 9 * (0.35 + 0.65 * Math.pow(f, 0.6));
    for (const s of [-1, 1]) blob(g, 64 + s * reach * (0.4 + 0.5 * r()), y, 4.6 * (0.7 + 0.5 * r()), 0.65 + 0.35 * r());
    blob(g, 64, y, 4.3, 0.8);
  }
}

function paintTulip(g: G, r: () => number) {
  const petal = (a: number, lum: number) => {
    g.save();
    g.translate(64, 104);
    g.rotate(a);
    g.fillStyle = grey(lum);
    g.beginPath();
    g.moveTo(0, 0);
    g.bezierCurveTo(-26, -20, -22, -62, 0, -86);
    g.bezierCurveTo(22, -62, 26, -20, 0, 0);
    g.fill();
    g.restore();
  };
  petal(-0.5, 0.78 + 0.1 * r());
  petal(0.5, 0.78 + 0.1 * r());
  petal(0, 1);
  g.strokeStyle = grey(0.55);
  g.lineWidth = 3;
  g.beginPath();
  g.moveTo(64, 104);
  g.lineTo(64, 128);
  g.stroke();
}

/** Paints the atlas at `tilePx` pixels per tile; returns the pixels, rows flipped for upload. */
function paintAtlas(tilePx: number): { data: Uint8Array; w: number; h: number } {
  setTilePx(tilePx);
  const SIZE_W = atlasW();
  const SIZE_H = atlasH();
  const c = document.createElement("canvas");
  c.width = SIZE_W;
  c.height = SIZE_H;
  const g = c.getContext("2d")!;
  g.clearRect(0, 0, SIZE_W, SIZE_H);
  tile(g, TILE.white, (g) => {
    g.fillStyle = "#fff";
    g.fillRect(0, 0, 128, 128);
  });
  tile(g, TILE.broad, (g, r) => rosette(g, r, 11, 54, 30, 70));
  tile(g, TILE.small, (g, r) => {
    for (let k = 0; k < 30; k++) {
      const a = r() * 6.3, d = 46 * Math.sqrt(r());
      leaf(g, 64 + Math.cos(a) * d, 64 + Math.sin(a) * d, r() * 6.3, 21 + 8 * r(), 13 + 4 * r(), 0.7 + 0.3 * r());
    }
  });
  tile(g, TILE.narrow, (g, r) => {
    for (let k = 0; k < 26; k++) {
      const a = r() * 6.3, d = 30 * Math.sqrt(r());
      leaf(g, 64 + Math.cos(a) * d, 64 + Math.sin(a) * d, a + (r() - 0.5) * 1.2, 34 + 12 * r(), 7, 0.72 + 0.28 * r(), false);
    }
  });
  tile(g, TILE.needle, paintNeedles);
  tile(g, TILE.maple, paintMaple);
  tile(g, TILE.blossom, paintBlossom);
  tile(g, TILE.blade, paintBlades);
  tile(g, TILE.flower, paintFlower);
  tile(g, TILE.frond, (g, r) => paintFrond(g, r, false));
  tile(g, TILE.strand, paintStrand);
  tile(g, TILE.clover, paintClover);
  tile(g, TILE.leaf, (g) => leaf(g, 20, 64, -0.1, 90, 44, 0.9));
  tile(g, TILE.spike, paintSpike);
  tile(g, TILE.tulip, paintTulip);
  tile(g, TILE.fern, (g, r) => paintFrond(g, r, true));
  paintTreeTiles(g);
  paintPlantTiles(g);
  // Upload as raw pixels: a canvas texture would bleed black from the transparent texels into the mipmaps (dark fringes on far leaves).
  const src = g.getImageData(0, 0, SIZE_W, SIZE_H).data;
  const px = new Uint8Array(src.length);
  const row = SIZE_W * 4;
  for (let y = 0; y < SIZE_H; y++) {
    const from = y * row, to = (SIZE_H - 1 - y) * row; // canvas row 0 is the top (v = 1)
    for (let x = 0; x < row; x += 4) {
      const clear = src[from + x + 3] < 255;
      px[to + x] = clear ? Math.max(src[from + x], 190) : src[from + x];
      px[to + x + 1] = clear ? Math.max(src[from + x + 1], 190) : src[from + x + 1];
      px[to + x + 2] = clear ? Math.max(src[from + x + 2], 190) : src[from + x + 2];
      px[to + x + 3] = src[from + x + 3];
    }
  }
  return { data: px, w: SIZE_W, h: SIZE_H };
}

/** The leaf atlas texture, painted at `tilePx` pixels per tile (256 normally, 128 on the Eco tier). */
export function foliageAtlas(tilePx = 256): DataTexture {
  const { data, w, h } = paintAtlas(tilePx);
  const tex = new DataTexture(data, w, h, RGBAFormat, UnsignedByteType);
  tex.colorSpace = SRGBColorSpace;
  tex.anisotropy = 4;
  tex.magFilter = LinearFilter;
  tex.minFilter = LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.needsUpdate = true;
  return tex;
}

/** Paint the same texture again at another tile size (the tier changed): every material that holds it follows, the UVs are fractions of the atlas. */
export function repaintAtlas(tex: DataTexture, tilePx: number): void {
  const { data, w, h } = paintAtlas(tilePx);
  tex.image = { data, width: w, height: h };
  tex.dispose();
  tex.needsUpdate = true;
}
