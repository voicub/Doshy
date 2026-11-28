import { CanvasTexture, LinearMipmapLinearFilter, NearestFilter, RepeatWrapping, SRGBColorSpace, type Texture } from "three";
import { FLOORS, WALLS } from "./materials";
import { rngOf } from "./mathUtil.ts";
import type { FloorKind, WallStyle } from "./types";

// Procedural low-res "voxel" textures. Drawn in light neutral tones so they can be tinted per room/wall.
// A floor and a wall style that share a name (brick, concrete) share one texture.
type TexKind = FloorKind | WallStyle;

/** Metres of world space covered by one texture tile. */
export const tileM = (kind: TexKind): number => (kind in FLOORS ? FLOORS[kind as FloorKind].tileM : WALLS[kind as WallStyle].tileM);
const SIZE = 64;
const TAU = Math.PI * 2;

type Painter = (g: CanvasRenderingContext2D, r: () => number) => void;
const grey = (v: number) => `rgb(${v | 0},${v | 0},${v | 0})`;
const rect = (g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, v: number) => {
  g.fillStyle = grey(v);
  g.fillRect(x | 0, y | 0, Math.max(1, w | 0), Math.max(1, h | 0));
};
/** Like `rect`, but a part that leaves the tile comes back in on the opposite side, so the texture still tiles. */
const wrap = (g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, v: number) => {
  for (const dx of [0, -SIZE]) for (const dy of [0, -SIZE]) rect(g, x + dx, y + dy, w, h, v);
};
const pixels = (g: CanvasRenderingContext2D, f: (x: number, y: number) => number) => {
  for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) rect(g, x, y, 1, 1, f(x, y));
};

/** Rows of planks `h` px tall with a dark seam under each, one staggered end joint per row and a little grain. */
const planks = (rows: number, lo: number, span: number, seam: number): Painter => (g, r) => {
  for (let row = 0; row < rows; row++) {
    const y0 = Math.round((row * SIZE) / rows);
    const h = Math.round(((row + 1) * SIZE) / rows) - y0;
    rect(g, 0, y0, SIZE, h - 1, lo + r() * span);
    rect(g, 0, y0 + h - 1, SIZE, 1, seam);
    rect(g, Math.floor(r() * SIZE), y0, 1, h - 1, seam + 10);
    for (let i = 0; i < 6; i++) rect(g, Math.floor(r() * SIZE), y0 + Math.floor(r() * (h - 2)), 6 + r() * 6, 1, lo - 12);
  }
};

/** Running-bond bricks in mortar. */
const bricks = (mortar: number, lo: number, span: number): Painter => (g, r) => {
  rect(g, 0, 0, SIZE, SIZE, mortar);
  for (let row = 0; row < 4; row++) {
    const off = row % 2 ? 16 : 0;
    for (let col = -1; col < 3; col++) rect(g, col * 32 + off + 1, row * 16 + 1, 30, 14, lo + r() * span);
  }
};

/** Zig-zag columns of slanted planks (herringbone seen from above): `cw` px wide columns, planks `ph` px long. */
const chevron = (cw: number, ph: number, lo: number, span: number, seam: number): Painter => (g, r) => {
  const shade = Array.from({ length: SIZE / cw }, () => Array.from({ length: SIZE / ph }, () => lo + r() * span));
  pixels(g, (x, y) => {
    const col = Math.floor(x / cw);
    const lx = x % cw;
    const s = col % 2 ? cw - 1 - lx : lx;
    const along = y + s;
    return lx === 0 || along % ph === 0 ? seam : shade[col][Math.floor(along / ph) % (SIZE / ph)];
  });
};

/** Irregular rectangular stones in rows of the given heights; each row is cut into `pieces` random widths that wrap around the tile. */
const stones = (rowH: number[], pieces: [number, number], lo: number, span: number, mortar: number): Painter => (g, r) => {
  rect(g, 0, 0, SIZE, SIZE, mortar);
  let y = 0;
  for (const h of rowH) {
    const n = pieces[0] + Math.floor(r() * (pieces[1] - pieces[0] + 1));
    const cuts = Array.from({ length: n }, () => Math.floor(r() * SIZE)).sort((a, b) => a - b);
    cuts.forEach((x0, i) => {
      const x1 = i + 1 < n ? cuts[i + 1] : cuts[0] + SIZE;
      if (x1 - x0 < 5) return;
      wrap(g, x0 + 1, y + 1, x1 - x0 - 2, h - 2, lo + r() * span);
      for (let k = 0; k < 3; k++) wrap(g, x0 + 2 + r() * (x1 - x0 - 5), y + 2 + r() * (h - 5), 2, 1, lo - 14);
    });
    y += h;
  }
};

/** Small concrete pavers laid in running bond (one texture for the three paver colours: the tint does the rest). */
const pavers: Painter = (g, r) => {
  rect(g, 0, 0, SIZE, SIZE, 120);
  for (let row = 0; row < 8; row++) {
    const off = row % 2 ? 8 : 0;
    for (let col = -1; col < 4; col++) rect(g, col * 16 + off + 1, row * 8 + 1, 14, 6, 205 + r() * 30);
  }
};

/** Loose speckle: `n` chips of `size` px in the given grey range, wrapped. */
const chips = (g: CanvasRenderingContext2D, r: () => number, n: number, size: number, lo: number, span: number) => {
  for (let i = 0; i < n; i++) wrap(g, r() * SIZE, r() * SIZE, 1 + r() * size, 1 + r() * size, lo + r() * span);
};

const PAINTERS: Record<TexKind, Painter> = {
  brick: bricks(150, 205, 45),
  redbrick: bricks(172, 188, 67),
  whitebrick: bricks(214, 226, 28),
  wood(g, r) {
    // the original floor, drawn in exactly its original order so saved homes look the same
    for (let row = 0; row < 8; row++) {
      rect(g, 0, row * 8, SIZE, 7, 200 + r() * 40);
      rect(g, 0, row * 8 + 7, SIZE, 1, 120);
      rect(g, Math.floor(r() * SIZE), row * 8, 1, 7, 120);
      for (let i = 0; i < 6; i++) {
        const x = Math.floor(r() * SIZE);
        rect(g, x, row * 8 + 1 + Math.floor(r() * 5), 8, 1, 185);
      }
    }
  },
  oak: planks(6, 205, 35, 130),
  darkwood: planks(8, 190, 35, 70),
  laminate(g, r) {
    for (let row = 0; row < 8; row++) {
      const off = (row * 13) % 32;
      for (let seg = -1; seg < 3; seg++) {
        const x = seg * 32 + off;
        rect(g, x + 1, row * 8, 31, 7, 215 + r() * 20);
        rect(g, x, row * 8, 1, 7, 175);
      }
      rect(g, 0, row * 8 + 7, SIZE, 1, 175);
    }
  },
  herringbone: chevron(8, 16, 200, 40, 90),
  paving: chevron(4, 8, 200, 50, 105),
  tile(g, r) {
    rect(g, 0, 0, SIZE, SIZE, 120);
    for (let y = 0; y < 2; y++) for (let x = 0; x < 2; x++) rect(g, x * 32 + 1, y * 32 + 1, 30, 30, 225 + r() * 22);
  },
  tilelarge(g, r) {
    rect(g, 0, 0, SIZE, SIZE, 150);
    for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) rect(g, Math.max(1, x * 8), Math.max(1, y * 8), x === 0 || x === 7 ? 7 : 8, y === 0 || y === 7 ? 7 : 8, 228 + r() * 12);
  },
  mosaic(g, r) {
    rect(g, 0, 0, SIZE, SIZE, 150);
    for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) rect(g, x * 8 + 1, y * 8 + 1, 7, 7, 205 + Math.floor(r() * 3) * 16 + r() * 6);
  },
  marble(g, r) {
    const T = TAU / SIZE;
    pixels(g, (x, y) => {
      const f1 = Math.sin(T * (x + 2 * y) + 1.8 * Math.sin(T * (3 * y + x)));
      const f2 = Math.sin(T * (3 * x - y) + 2.2 * Math.sin(T * (x + 2 * y)));
      return 240 - 65 * Math.exp(-f1 * f1 * 60) - 40 * Math.exp(-f2 * f2 * 140) * 0.5 + (r() - 0.5) * 6;
    });
    rect(g, 0, 0, SIZE, 1, 195);
    rect(g, 0, 0, 1, SIZE, 195);
    rect(g, 0, 32, SIZE, 1, 210);
    rect(g, 32, 0, 1, SIZE, 210);
  },
  terrazzo(g, r) {
    pixels(g, () => 228 + r() * 8);
    for (const [n, lo, span] of [[46, 150, 100], [26, 90, 60], [20, 235, 20]] as const) chips(g, r, n, 3, lo, span);
  },
  concrete(g, r) {
    const T = TAU / SIZE;
    pixels(g, (x, y) => 208 + 9 * Math.sin(T * (x + 2 * y)) + 6 * Math.sin(T * (2 * x - y)) + (r() - 0.5) * 12);
    for (let i = 0; i < 14; i++) rect(g, r() * SIZE, r() * SIZE, 1, 1, 150);
  },
  polished(g, r) {
    const T = TAU / SIZE;
    pixels(g, (x, y) => 232 + 6 * Math.sin(T * (x + y)) + (r() - 0.5) * 4);
    rect(g, 0, 0, SIZE, 1, 205);
    rect(g, 0, 0, 1, SIZE, 205);
  },
  slabs: stones([24, 20, 20], [2, 3], 190, 45, 105),
  slate: stones([16, 16, 16, 16], [3, 4], 135, 60, 80),
  stone: stones([12, 20, 14, 18], [3, 4], 170, 70, 120),
  vinyl(g, r) {
    for (let row = 0; row < 4; row++) {
      rect(g, 0, row * 16, SIZE, 15, 226 + r() * 10);
      rect(g, 0, row * 16 + 15, SIZE, 1, 204);
      rect(g, row % 2 ? 32 : 0, row * 16, 1, 15, 204);
    }
  },
  grass(g, r) {
    for (let y = 0; y < SIZE; y += 2)
      for (let x = 0; x < SIZE; x += 2) rect(g, x, y, 2, 2, 150 + r() * 95);
  },
  carpet(g, r) {
    pixels(g, () => 212 + r() * 36);
  },
  gravel(g, r) {
    for (let y = 0; y < SIZE; y += 2) for (let x = 0; x < SIZE; x += 2) rect(g, x, y, 2, 2, 130 + r() * 105);
    chips(g, r, 50, 2, 170, 80);
  },
  sand(g, r) {
    const T = TAU / SIZE;
    pixels(g, () => 218 + r() * 26);
    for (let y = 4; y < SIZE; y += 8) for (let x = 0; x < SIZE; x++) rect(g, x, y + Math.round(2 * Math.sin(T * x * 2)), 1, 1, 196);
  },
  deck(g, r) {
    for (let row = 0; row < 8; row++) {
      rect(g, 0, row * 8, SIZE, 7, 205 + r() * 30);
      rect(g, 0, row * 8 + 7, SIZE, 1, 60);
      rect(g, (row * 21) % SIZE, row * 8, 1, 7, 100);
      for (let i = 0; i < 4; i++) rect(g, Math.floor(r() * SIZE), row * 8 + 1 + Math.floor(r() * 5), 7, 1, 188);
    }
  },
  asphalt(g, r) {
    pixels(g, () => 196 + r() * 40);
    chips(g, r, 36, 2, 235, 20);
  },
  water(g) {
    const T = TAU / SIZE;
    pixels(g, (x, y) => 222 + 28 * Math.sin(T * 2 * x + 1.5 * Math.sin(T * 3 * y)) * Math.sin(T * 2 * y + 1.2 * Math.sin(T * 2 * x)));
  },
  cobble: stones([10, 11, 10, 11, 11, 11], [4, 5], 150, 70, 85),
  flagstone: stones([22, 18, 24], [2, 3], 170, 60, 100),
  pavers_grey: pavers,
  pavers_sand: pavers,
  pavers_red: pavers,
  mulch(g, r) {
    pixels(g, () => 120 + r() * 50);
    chips(g, r, 70, 4, 60, 110);
    chips(g, r, 30, 3, 200, 40);
  },
  soil(g, r) {
    pixels(g, () => 170 + r() * 45);
    chips(g, r, 50, 3, 110, 60);
    chips(g, r, 20, 2, 225, 25);
  },
  turf(g, r) {
    pixels(g, (_x, y) => 190 + r() * 55 - (y % 4 === 0 ? 22 : 0));
  },
  rubber(g, r) {
    pixels(g, () => 200 + r() * 30);
    chips(g, r, 60, 2, 150, 100);
  },
  plaster(g, r) {
    rect(g, 0, 0, SIZE, SIZE, 240);
    for (let i = 0; i < 90; i++) {
      const v = 224 + r() * 20; // same draw order as ever: saved homes keep their exact wall speckle
      rect(g, Math.floor(r() * SIZE), Math.floor(r() * SIZE), 2, 2, v);
    }
  },
  woodv(g, r) {
    for (let col = 0; col < 8; col++) {
      rect(g, col * 8, 0, 7, SIZE, 200 + r() * 40);
      rect(g, col * 8 + 7, 0, 1, SIZE, 120);
      rect(g, col * 8, Math.floor(r() * SIZE), 7, 1, 140);
      for (let i = 0; i < 6; i++) rect(g, col * 8 + 1 + Math.floor(r() * 5), Math.floor(r() * SIZE), 1, 6 + r() * 8, 185);
    }
  },
  woodh(g, r) {
    for (let row = 0; row < 8; row++) {
      rect(g, 0, row * 8, SIZE, 7, 205 + r() * 35);
      rect(g, 0, row * 8, SIZE, 1, 245);
      rect(g, 0, row * 8 + 7, SIZE, 1, 110);
      for (let i = 0; i < 4; i++) rect(g, Math.floor(r() * SIZE), row * 8 + 2 + Math.floor(r() * 4), 8 + r() * 10, 1, 188);
    }
  },
  metro(g, r) {
    rect(g, 0, 0, SIZE, SIZE, 190);
    for (let row = 0; row < 8; row++) {
      const off = row % 2 ? 8 : 0;
      for (let col = -1; col < 4; col++) rect(g, col * 16 + off + 1, row * 8 + 1, 15, 7, 236 + r() * 14);
    }
  },
  stripes(g, r) {
    for (let s = 0; s < 4; s++) {
      rect(g, s * 16, 0, 16, SIZE, s % 2 ? 226 : 248);
      rect(g, s * 16, 0, 1, SIZE, 212);
    }
    chips(g, r, 40, 1, 215, 30);
  },
  batten(g, r) {
    rect(g, 0, 0, SIZE, SIZE, 232);
    for (let col = 0; col < 4; col++) {
      rect(g, col * 16 + 2, 0, 12, SIZE, 232 + r() * 8);
      wrap(g, col * 16 + 14, 0, 4, SIZE, 248);
      wrap(g, col * 16 + 18, 0, 1, SIZE, 180);
    }
  },
  glass(g) {
    rect(g, 0, 0, SIZE, SIZE, 235);
  },
  paint(g) {
    rect(g, 0, 0, SIZE, SIZE, 245);
  },
  // garden boundaries: the 3D scene builds these from geometry, so the textures mainly give the swatches and the plan their look
  fence_picket(g) {
    rect(g, 0, 0, SIZE, SIZE, 120);
    for (let col = 0; col < 8; col++) rect(g, col * 8 + 1, 0, 6, SIZE, 235);
  },
  fence_wire(g) {
    rect(g, 0, 0, SIZE, SIZE, 250);
    for (let i = 0; i < SIZE; i += 8) {
      rect(g, i, 0, 1, SIZE, 120);
      rect(g, 0, i, SIZE, 1, 120);
    }
  },
  fence_panel: planks(8, 205, 30, 110),
  fence_slat: planks(6, 215, 25, 120),
  fence_bar(g) {
    rect(g, 0, 0, SIZE, SIZE, 235);
    for (let col = 0; col < 8; col++) rect(g, col * 8 + 3, 0, 2, SIZE, 90);
    rect(g, 0, 4, SIZE, 4, 90);
    rect(g, 0, SIZE - 8, SIZE, 4, 90);
  },
  fence_iron(g) {
    rect(g, 0, 0, SIZE, SIZE, 235);
    for (let col = 0; col < 8; col++) {
      rect(g, col * 8 + 3, 8, 2, SIZE - 8, 90);
      rect(g, col * 8 + 2, 2, 4, 6, 90); // spear tip
    }
    rect(g, 0, 20, SIZE, 3, 90);
    rect(g, 0, SIZE - 14, SIZE, 3, 90);
  },
  fence_glass(g) {
    rect(g, 0, 0, SIZE, SIZE, 240);
    rect(g, 2, 2, SIZE - 4, SIZE - 4, 252);
    for (let i = 0; i < 6; i++) rect(g, 10 + i * 6, 6 + i * 6, 14, 2, 255); // a glint
  },
  wall_stone: stones([16, 22, 18], [2, 3], 150, 80, 70),
  wall_brick_low: bricks(165, 195, 55),
  wall_block(g, r) {
    rect(g, 0, 0, SIZE, SIZE, 150);
    for (let row = 0; row < 3; row++) {
      const off = row % 2 ? 22 : 0;
      for (let col = -1; col < 2; col++) rect(g, col * 43 + off + 1, row * 21 + 1, 41, 19, 205 + r() * 25);
    }
  },
  fence_rail(g) {
    rect(g, 0, 0, SIZE, SIZE, 120);
    for (const y of [6, 26, 46]) rect(g, 0, y, SIZE, 10, 225);
  },
  fence_electric(g) {
    rect(g, 0, 0, SIZE, SIZE, 235);
    for (const y of [10, 30, 50]) rect(g, 0, y, SIZE, 2, 110);
  },
  fence_bamboo(g, r) {
    rect(g, 0, 0, SIZE, SIZE, 120);
    for (let col = 0; col < 8; col++) {
      rect(g, col * 8 + 1, 0, 6, SIZE, 205 + r() * 30);
      rect(g, col * 8 + 1, 12 + r() * 40, 6, 2, 150); // a node
    }
  },
  hedge(g, r) {
    pixels(g, () => 110 + r() * 90);
    chips(g, r, 110, 3, 40, 60);
    chips(g, r, 60, 2, 205, 40);
  },
};

const canvases = new Map<TexKind, HTMLCanvasElement>();
const base = new Map<TexKind, CanvasTexture>();

function context2d(c: HTMLCanvasElement) {
  const g = c.getContext("2d");
  if (!g) throw new Error("This browser cannot draw textures.");
  return g;
}

/** The drawn grey texture of a material (one per kind, kept: there are only a few dozen of them). */
function canvasOf(kind: TexKind) {
  let c = canvases.get(kind);
  if (!c) {
    c = document.createElement("canvas");
    c.width = c.height = SIZE;
    PAINTERS[kind](context2d(c), rngOf(kind.length * 7919));
    canvases.set(kind, c);
  }
  return c;
}

function baseTexture(kind: TexKind) {
  let t = base.get(kind);
  if (!t) {
    t = new CanvasTexture(canvasOf(kind));
    t.wrapS = t.wrapT = RepeatWrapping;
    t.magFilter = NearestFilter;
    t.minFilter = LinearMipmapLinearFilter;
    t.colorSpace = SRGBColorSpace;
    t.anisotropy = 4;
    base.set(kind, t);
  }
  return t;
}

/**
 * A texture that tiles `kind` over a surface of wMetres x hMetres, starting at (offX, offY) metres. Caller disposes.
 * It is a clone of the one shared base texture of the kind, so disposing it frees only its own GPU copy and nothing piles up
 * however often a surface changes material.
 */
export function tiledTexture(kind: TexKind, wMetres: number, hMetres: number, offX = 0, offY = 0): Texture {
  const t = baseTexture(kind).clone();
  const m = tileM(kind);
  t.needsUpdate = true;
  t.repeat.set(wMetres / m, hMetres / m);
  t.offset.set(offX / m, offY / m);
  return t;
}

const swatches = new Map<TexKind, string>();
/** The material's grey texture as a data URL for a swatch (multiply it with the tint in CSS). Browser only. */
export function swatchUrl(kind: TexKind): string {
  let u = swatches.get(kind);
  if (!u) {
    u = canvasOf(kind).toDataURL();
    swatches.set(kind, u);
  }
  return u;
}

let glow: CanvasTexture | undefined;
/** Soft radial falloff used for the light pools on the floor. */
export function glowTexture() {
  if (!glow) {
    const c = document.createElement("canvas");
    c.width = c.height = 128;
    const g = context2d(c);
    const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    grad.addColorStop(0, "rgba(255,255,255,1)");
    grad.addColorStop(0.35, "rgba(255,255,255,0.45)");
    grad.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = grad;
    g.fillRect(0, 0, 128, 128);
    glow = new CanvasTexture(c);
    glow.colorSpace = SRGBColorSpace;
  }
  return glow;
}

let mottle: CanvasTexture | undefined;
/** Large soft grey blobs (white = patch) for lawn variation; tiles every `tileM` metres. Use as an alphaMap. Caller disposes. */
export function mottleTexture(wMetres: number, hMetres: number, tileM = 20): Texture {
  if (!mottle) {
    const S = 256;
    const c = document.createElement("canvas");
    c.width = c.height = S;
    const g = context2d(c);
    g.fillStyle = "#000";
    g.fillRect(0, 0, S, S);
    const r = rngOf(7);
    for (let i = 0; i < 26; i++) {
      const x = r() * S, y = r() * S, rad = 22 + r() * 40, v = 90 + r() * 165;
      // draw wrapped so the tile is seamless
      for (const dx of [-S, 0, S]) for (const dy of [-S, 0, S]) {
        const grad = g.createRadialGradient(x + dx, y + dy, 0, x + dx, y + dy, rad);
        grad.addColorStop(0, `rgba(${v | 0},${v | 0},${v | 0},0.8)`);
        grad.addColorStop(1, "rgba(0,0,0,0)");
        g.fillStyle = grad;
        g.fillRect(x + dx - rad, y + dy - rad, rad * 2, rad * 2);
      }
    }
    mottle = new CanvasTexture(c);
    mottle.wrapS = mottle.wrapT = RepeatWrapping;
  }
  const t = mottle.clone();
  t.needsUpdate = true;
  t.repeat.set(wMetres / tileM, hMetres / tileM);
  return t;
}
