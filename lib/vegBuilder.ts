import { BufferAttribute, BufferGeometry } from "three";
import { type Rng, type V3 } from "./mathUtil.ts";

/** uv of solid-colour surfaces (bark, cores, rocks): the centre of atlas tile 0 (top-left of the 8 x 8 atlas), which is opaque white. Builders pass [0.5, 0.5] for it. */
const SOLID_UV: [number, number] = [0.0625, 0.9375]; // = [0.5 / ATLAS_COLS, 1 - 0.5 / ATLAS_ROWS]
/** Bark textures are painted dark; this lifts them so trunks read in the sun. */
const BARK_GAIN = 1.9;

/**
 * Mesh construction kit for the procedural vegetation (lib/vegetation.ts). Pure: no DOM, so it runs under `node --test`.
 * Everything ends up in ONE indexed geometry per species variant with these attributes:
 *   position, normal, uv (atlas tile), color (tone: AO and hue variation, linear),
 *   aPart   (kind, rand 0..1 for seasonal thinning, wind sway weight, colour slot / bark style),
 *   aCenter (card centre the leaf shrinks toward when it drops; bark: u,v of the bark pattern).
 */
export const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const mul = (a: V3, k: number): V3 => [a[0] * k, a[1] * k, a[2] * k];
export const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
export const len = (a: V3) => Math.hypot(a[0], a[1], a[2]);
export const norm = (a: V3): V3 => {
  const l = len(a) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};
export const mix3 = (a: V3, b: V3, t: number): V3 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
export const clamp = (x: number, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, x));
export const smooth = (a: number, b: number, x: number) => {
  const t = clamp((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};
/** sRGB #rrggbb to linear rgb (vertex colours are linear). */
export const lin = (hex: string): V3 => [1, 3, 5].map((i) => Math.pow(parseInt(hex.slice(i, i + 2), 16) / 255, 2.2)) as V3;

const h3 = (x: number, y: number, z: number) => {
  let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(z, 2147483647);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};
/** Smooth value noise 0..1 (3D lattice, hash based). */
export function noise3(x: number, y: number, z: number, seed = 0): number {
  x += seed * 17.13;
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  const fx = x - xi, fy = y - yi, fz = z - zi;
  const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy), w = fz * fz * (3 - 2 * fz);
  const c = (dx: number, dy: number, dz: number) => h3(xi + dx, yi + dy, zi + dz);
  const l = (a: number, b: number, t: number) => a + (b - a) * t;
  return l(
    l(l(c(0, 0, 0), c(1, 0, 0), u), l(c(0, 1, 0), c(1, 1, 0), u), v),
    l(l(c(0, 0, 1), c(1, 0, 1), u), l(c(0, 1, 1), c(1, 1, 1), u), v),
    w,
  );
}

// ---------------------------------------------------------------- atlas

/**
 * Tiles of the leaf atlas (drawn by components/scene/foliageAtlas*.ts): 8 x 8 tiles of 256 px, index = row * 8 + column from the top left. Tile 0 is solid white.
 * 0..15 the original clusters (the Light tier uses only these), 16..31 the per-species sprigs of the denser tiers (foliageAtlasTrees.ts),
 * 32..63 houseplant and artificial plant leaves (foliageAtlasPlants.ts, names in lib/vegPlantTiles.ts).
 */
export const TILE = { white: 0, broad: 1, small: 2, narrow: 3, needle: 4, maple: 5, blossom: 6, blade: 7, flower: 8, frond: 9, strand: 10, clover: 11, leaf: 12, spike: 13, tulip: 14, fern: 15, oak: 16, maple2: 17, birch: 18, linden: 19, aspen: 20, cherry: 21, spruce: 22, pine: 23, willow: 24, ivy: 25, grass: 26, boxwood: 27, bloomHead: 28, twigs: 29, strand2: 30, litter2: 31 } as const;
export const ATLAS_COLS = 8;
export const ATLAS_ROWS = 8;
/** u0, v0, u1, v1 of a tile (v up). A little inset keeps neighbours from bleeding in. */
export const tileRect = (t: number): [number, number, number, number] => {
  const c = t % ATLAS_COLS, r = Math.floor(t / ATLAS_COLS), pad = 0.003;
  return [c / ATLAS_COLS + pad, 1 - (r + 1) / ATLAS_ROWS + pad, (c + 1) / ATLAS_COLS - pad, 1 - r / ATLAS_ROWS - pad];
};

/** What a vertex is: decides its colour source and how the season treats it (see components/scene/foliageMaterial.ts). */
export const KIND = { bark: 0, broad: 1, conifer: 2, blossom: 3, fruit: 4, grass: 5, bush: 6, flower: 7, rock: 8, litter: 9, hedge: 10, stem: 11, mushroom: 12, patch: 13, bloom: 14, house: 15 } as const;

/** The foliage density levels of the quality tiers (lib/quality.ts `foliage` knob): 0 = the original look (Light), 1..3 = denser, finer leaves (Balanced, Detailed, Ultra). */
export type Level = 0 | 1 | 2 | 3;
export const LEVELS: readonly Level[] = [0, 1, 2, 3];
/** Leaf-card count multiplier per level, relative to the original card counts. */
export const LEVEL_MULT: Record<Level, number> = { 0: 1, 1: 2, 2: 4, 3: 7 };
export const levelOfFoliage = (foliage: number): Level => (foliage < 0.8 ? 0 : foliage < 1.5 ? 1 : foliage < 2.2 ? 2 : 3);

// ---------------------------------------------------------------- mesh

export class Mesh {
  pos: number[] = [];
  nor: number[] = [];
  uv: number[] = [];
  col: number[] = [];
  part: number[] = [];
  cen: number[] = [];
  idx: number[] = [];
  /** foliage density level of this build (0 = the original look) and the species' own leaf tile for the denser levels (set by buildVegetation) */
  level: Level = 0;
  sprig?: number;
  /** reference height / radius / stiffness of the wind sway (see sway()) */
  H = 1;
  R = 1;
  flex = 1;
  get count() {
    return this.pos.length / 3;
  }

  /** metres a full-strength gust moves the top of a plant this tall: small plants move proportionally less (capped at a 4.5 m tree) */
  get reach() {
    return Math.min(1, this.H * 0.22);
  }
  /** 0 at the ground, up to ~flex (times reach) at the outermost top: how far the wind moves this point. */
  sway(p: V3): number {
    return this.flex * this.reach * Math.pow(clamp(p[1] / this.H), 1.8) * (0.45 + 0.55 * clamp(Math.hypot(p[0], p[2]) / this.R));
  }

  vert(p: V3, n: V3, uv: [number, number], tone: V3, kind: number, r: number, slot: number, c: V3, sw = this.sway(p)): number {
    this.pos.push(p[0], p[1], p[2]);
    this.nor.push(n[0], n[1], n[2]);
    this.uv.push(...(uv[0] === 0.5 && uv[1] === 0.5 ? SOLID_UV : uv));
    this.col.push(tone[0], tone[1], tone[2]);
    this.part.push(kind, r, sw, slot);
    this.cen.push(c[0], c[1], c[2]);
    return this.count - 1;
  }
  tri(a: number, b: number, c: number) {
    this.idx.push(a, b, c);
  }

  toGeometry(): BufferGeometry {
    const g = new BufferGeometry();
    g.setAttribute("position", new BufferAttribute(new Float32Array(this.pos), 3));
    g.setAttribute("normal", new BufferAttribute(new Float32Array(this.nor), 3));
    g.setAttribute("uv", new BufferAttribute(new Float32Array(this.uv), 2));
    g.setAttribute("color", new BufferAttribute(new Float32Array(this.col), 3));
    g.setAttribute("aPart", new BufferAttribute(new Float32Array(this.part), 4));
    g.setAttribute("aCenter", new BufferAttribute(new Float32Array(this.cen), 3));
    g.setIndex(new BufferAttribute(new Uint32Array(this.idx), 1));
    g.computeBoundingBox();
    g.computeBoundingSphere();
    return g;
  }
}

type CardOpts = {
  tile: number;
  tone: V3;
  kind: number;
  r: number;
  slot: number;
  /** darken the bottom edge by this much (0..1) so every card has a little inner depth */
  base?: number;
  /** vertical flip of the uv (cards hanging down) */
  flip?: boolean;
  sw?: number;
  /** sway weight along a ribbon, t = 0 at its root .. 1 at its tip */
  swT?: (t: number) => number;
};

/** A quad: centre, half-extent vectors, one shading normal for all four corners. */
export function card(m: Mesh, c: V3, right: V3, up: V3, n: V3, o: CardOpts) {
  const [u0, v0, u1, v1] = tileRect(o.tile);
  const base = o.base ?? 0.18;
  const corners: [number, number][] = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
  const ids = corners.map(([sx, sy]) => {
    const p = add(add(c, mul(right, sx)), mul(up, sy));
    const k = 1 - base * (sy < 0 ? 1 : 0);
    const tone: V3 = [o.tone[0] * k, o.tone[1] * k, o.tone[2] * k];
    const v = o.flip ? (sy < 0 ? v1 : v0) : sy < 0 ? v0 : v1;
    return m.vert(p, n, [sx < 0 ? u0 : u1, v], tone, o.kind, o.r, o.slot, c, o.sw);
  });
  m.tri(ids[0], ids[1], ids[2]);
  m.tri(ids[0], ids[2], ids[3]);
}

/** A tangent frame for normal n: two orthogonal unit vectors, turned by `roll`. */
export function frame(n: V3, roll: number): [V3, V3] {
  const a: V3 = Math.abs(n[1]) < 0.95 ? [0, 1, 0] : [1, 0, 0];
  const t1 = norm(cross(a, n));
  const t2 = cross(n, t1);
  const c = Math.cos(roll), s = Math.sin(roll);
  return [add(mul(t1, c), mul(t2, s)), add(mul(t1, -s), mul(t2, c))];
}

/** A card facing outward along n with a random roll. `size` is the full width. */
export function leafCard(m: Mesh, c: V3, n: V3, size: number, roll: number, o: CardOpts, aspect = 1) {
  const [a, b] = frame(n, roll);
  card(m, c, mul(a, size / 2), mul(b, (size * aspect) / 2), n, o);
}

/** A strip of `pts.length - 1` quads along a curve (fronds, blades, strands). widths are full widths per point. */
export function ribbon(m: Mesh, pts: V3[], widths: number[], side: V3, normal: V3, o: CardOpts) {
  const [u0, v0, u1, v1] = tileRect(o.tile);
  const base = o.base ?? 0.25;
  const rows: [number, number][] = pts.map((p, i) => {
    const t = i / (pts.length - 1);
    const w = mul(side, widths[i] / 2);
    const k = 1 - base * (1 - t);
    const tone: V3 = [o.tone[0] * k, o.tone[1] * k, o.tone[2] * k];
    const v = v0 + (v1 - v0) * (o.flip ? 1 - t : t);
    const c: V3 = pts[Math.floor(pts.length / 2)];
    const sw = o.swT ? o.swT(t) * m.reach : o.sw;
    return [m.vert(sub(p, w), normal, [u0, v], tone, o.kind, o.r, o.slot, c, sw), m.vert(add(p, w), normal, [u1, v], tone, o.kind, o.r, o.slot, c, sw)];
  });
  for (let i = 0; i < rows.length - 1; i++) {
    const [a, b] = rows[i], [c, d] = rows[i + 1];
    m.tri(a, b, d);
    m.tri(a, d, c);
  }
}

/** Catmull-Rom subdivision of a path (`sub` points per segment), radii interpolated linearly: round, bending trunks and limbs instead of faceted ones. */
function smoothPath(pts: V3[], radii: number[], sub: number): { pts: V3[]; radii: number[] } {
  const n = pts.length;
  const op: V3[] = [], or: number[] = [];
  for (let i = 0; i < n - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(n - 1, i + 2)];
    for (let s = 0; s < sub; s++) {
      const t = s / sub, t2 = t * t, t3 = t2 * t;
      op.push([0, 1, 2].map((k) => 0.5 * (2 * p1[k] + (p2[k] - p0[k]) * t + (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * t2 + (3 * p1[k] - p0[k] - 3 * p2[k] + p3[k]) * t3)) as V3);
      or.push(radii[i] + (radii[i + 1] - radii[i]) * t);
    }
  }
  op.push(pts[n - 1]);
  or.push(radii[n - 1]);
  return { pts: op, radii: or };
}

/** Walk a tube along `pts` with per-point radii; no end caps (leaves and tapering hide them). Returns nothing, bark vertices only. `sub` > 1 smooths the path first. */
export function tube(m: Mesh, pts: V3[], radii: number[], sides: number, tone: V3, style: number, o: { vScale?: number; rough?: number; rng?: Rng; r?: number; sub?: number; /** KIND of the vertices: bark (default, procedural bark pattern, seasonal snow) or house (plain colour, never seasonal: indoor stems) */ kind?: number } = {}) {
  if (o.sub && o.sub > 1 && pts.length > 2) ({ pts, radii } = smoothPath(pts, radii, o.sub));
  const rng = o.rng ?? (() => 0.5);
  const kind = o.kind ?? KIND.bark;
  const gain = kind === KIND.bark ? BARK_GAIN : 1;
  const rings: number[][] = [];
  let prev: V3 = norm(sub(pts[1], pts[0]));
  let side: V3 = Math.abs(prev[1]) < 0.95 ? norm(cross([0, 1, 0], prev)) : [1, 0, 0];
  let dist = 0;
  const rough = o.rough ?? 0.1;
  for (let i = 0; i < pts.length; i++) {
    const dir = i === pts.length - 1 ? prev : norm(sub(pts[i + 1], pts[Math.max(0, i - 1)]));
    // parallel transport: keep the side vector perpendicular to the new direction
    side = norm(sub(side, mul(dir, dot(side, dir))));
    const up2 = cross(dir, side);
    if (i) dist += len(sub(pts[i], pts[i - 1]));
    const ring: number[] = [];
    for (let s = 0; s <= sides; s++) {
      const a = (s / sides) * Math.PI * 2;
      const nrm = add(mul(side, Math.cos(a)), mul(up2, Math.sin(a)));
      const rr = radii[i] * (1 + rough * (rng() - 0.5));
      const p = add(pts[i], mul(nrm, rr));
      const shade = (0.82 + 0.18 * Math.min(1, s === 0 || s === sides ? 0.5 : 0.5 + 0.5 * Math.cos(a * 2))) * gain;
      const t: V3 = [tone[0] * shade, tone[1] * shade, tone[2] * shade];
      ring.push(m.vert(p, nrm, [0.5, 0.5], t, kind, o.r ?? 0, style, kind === KIND.bark ? [s / sides, dist * (o.vScale ?? 1), 0] : pts[i]));
    }
    rings.push(ring);
    prev = dir;
  }
  for (let i = 0; i < rings.length - 1; i++) {
    for (let s = 0; s < sides; s++) {
      const a = rings[i][s], b = rings[i][s + 1], c = rings[i + 1][s + 1], d = rings[i + 1][s];
      m.tri(a, d, c);
      m.tri(a, c, b);
    }
  }
}

// ---------------------------------------------------------------- blobs

/** Unit icosphere at subdivision 0 (12 vertices, 20 faces) or 1 (42, 80). */
function icosphere(detail: 0 | 1): { v: V3[]; f: [number, number, number][] } {
  const t = (1 + Math.sqrt(5)) / 2;
  const v: V3[] = [[-1, t, 0], [1, t, 0], [-1, -t, 0], [1, -t, 0], [0, -1, t], [0, 1, t], [0, -1, -t], [0, 1, -t], [t, 0, -1], [t, 0, 1], [-t, 0, -1], [-t, 0, 1]].map((p) => norm(p as V3));
  let f: [number, number, number][] = [
    [0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11], [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8],
    [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9], [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1],
  ];
  if (detail === 1) {
    const cache = new Map<string, number>();
    const mid = (a: number, b: number) => {
      const k = a < b ? `${a}_${b}` : `${b}_${a}`;
      let i = cache.get(k);
      if (i === undefined) {
        i = v.length;
        v.push(norm(mix3(v[a], v[b], 0.5)));
        cache.set(k, i);
      }
      return i;
    };
    const nf: [number, number, number][] = [];
    for (const [a, b, c] of f) {
      const ab = mid(a, b), bc = mid(b, c), ca = mid(c, a);
      nf.push([a, ab, ca], [b, bc, ab], [c, ca, bc], [ab, bc, ca]);
    }
    f = nf;
  }
  return { v, f };
}
const ICO = [icosphere(0), icosphere(1)];

type BlobOpts = {
  detail: 0 | 1;
  /** radius jitter from noise (0 = perfect ellipsoid) */
  bump: number;
  tone: V3;
  kind: number;
  r: number;
  slot: number;
  seed: number;
  /** lower the tone toward the bottom by this much */
  base?: number;
};

/** A noise-displaced ellipsoid with smooth outward normals: the dark mass inside a clump of leaf cards (or a rock, a shrub core). */
export function blob(m: Mesh, c: V3, radii: V3, o: BlobOpts, toneAt?: (p: V3) => V3) {
  const { v, f } = ICO[o.detail];
  const ids = v.map((d) => {
    const k = 1 + o.bump * (noise3(d[0] * 1.7 + c[0], d[1] * 1.7 + c[1], d[2] * 1.7 + c[2], o.seed) - 0.5) * 2;
    const p: V3 = [c[0] + d[0] * radii[0] * k, c[1] + d[1] * radii[1] * k, c[2] + d[2] * radii[2] * k];
    const n = norm([d[0] / radii[0], d[1] / radii[1], d[2] / radii[2]]);
    const dark = 1 - (o.base ?? 0.25) * (1 - d[1]) * 0.5;
    const tone = toneAt ? toneAt(p) : ([o.tone[0] * dark, o.tone[1] * dark, o.tone[2] * dark] as V3);
    return m.vert(p, n, [0.5, 0.5], tone, o.kind, o.r, o.slot, c);
  });
  for (const [a, b, d] of f) m.tri(ids[a], ids[b], ids[d]);
}

/** n well spread unit directions (Fibonacci sphere), rotated by a random angle so neighbours never line up. */
export function sphereDirs(n: number, rng: Rng): V3[] {
  const off = rng() * Math.PI * 2;
  const out: V3[] = [];
  for (let i = 0; i < n; i++) {
    const y = 1 - ((i + 0.5) / n) * 2;
    const r = Math.sqrt(1 - y * y);
    const a = i * 2.399963 + off;
    out.push([Math.cos(a) * r, y, Math.sin(a) * r]);
  }
  return out;
}

/** Scale and recentre a built geometry so its footprint and height match `size` exactly: [w, h, d]. */
export function fit(g: BufferGeometry, size: V3) {
  const p = g.getAttribute("position") as BufferAttribute;
  let mx = 0, mz = 0, my = 0;
  for (let i = 0; i < p.count; i++) {
    mx = Math.max(mx, Math.abs(p.getX(i)));
    mz = Math.max(mz, Math.abs(p.getZ(i)));
    my = Math.max(my, p.getY(i));
  }
  const kx = size[0] / 2 / (mx || 1), kz = size[2] / 2 / (mz || 1), ky = size[1] / (my || 1);
  const c = g.getAttribute("aCenter") as BufferAttribute;
  const barkRows = g.getAttribute("aPart") as BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    p.setXYZ(i, p.getX(i) * kx, p.getY(i) * ky, p.getZ(i) * kz);
    if (barkRows.getX(i) !== KIND.bark) c.setXYZ(i, c.getX(i) * kx, c.getY(i) * ky, c.getZ(i) * kz);
  }
  p.needsUpdate = true;
  c.needsUpdate = true;
  g.computeBoundingBox();
  g.computeBoundingSphere();
}

/**
 * One plant species: its natural size (the built geometry is fitted to it exactly), a triangle `budget` at level 0 (the tests scale it by LEVEL_MULT for the denser levels)
 * and its builder. `q` is the distance detail factor (1 near, 0.55 far), `level` the foliage density level (0 = the original look).
 */
export type SpeciesDef = {
  label: string;
  /** natural footprint x, height, footprint z (m) */
  size: V3;
  tree?: true;
  evergreen?: true;
  /** a houseplant / artificial plant: colours are baked into the vertices (KIND.house), no seasonal change, never snowed on */
  indoor?: true;
  budget: number;
  build: (m: Mesh, rng: Rng, q: number, level: Level) => void;
};
