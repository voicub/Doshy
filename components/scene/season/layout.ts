import { keepPlantable } from "@/lib/ground";
import type { Plan } from "@/lib/types";
import { speciesDef, type Placement, type Species } from "@/lib/vegetation";
import { decorZone, findAnchors, type Anchors } from "./anchors";
import { rngOf } from "@/lib/mathUtil";

/**
 * Where the garden vegetation stands, as species placements (what to plant, which variant, where, how big). Pure and deterministic
 * (seeded from the building's footprint, so editing furniture never reshuffles the garden). Everything stays outside the building's
 * bounds, which already include the balcony slab, and trees keep clear of the default isometric view of the flat.
 */
const SEED = 7919;
const TREES = 22;
const PINES = 10;
const BUSHES = 36;
const BEDS = 9;
const TUFT_CLUMPS = 16;
const FERNS = 12;
const ROCKS = 8;
const COVERS = 8;
const CLOVERS = 12;
const MUSHROOMS = 16;
const PATCHES = 12;
const RING = 17; // metres around the building that get planted
const TREE_GAP = 3;
const RAY_STEPS = 3; // samples per half-height when keeping trees out of the view of the flat
const FLAT_TOP = 2.8; // metres: nothing of the flat is taller
const FAR = 10; // metres from the building beyond which trees use the cheaper geometry

/** [species, weight] */
const BROADLEAF: [Species, number][] = [["oak", 4], ["birch", 4], ["maple", 3], ["linden", 3], ["cherry", 2], ["apple", 2], ["poplar", 2], ["willow", 1]];
const CONIFER: [Species, number][] = [["spruce", 4], ["pine", 3], ["fir", 2], ["cypress", 1]];
const SHRUBS: [Species, number][] = [["shrub", 4], ["hydrangea", 2], ["rose", 2], ["lavender", 2]];
const BEDS_OF: Species[] = ["flower_bed", "flower_bed_b", "flower_bed_c"];
const HEDGE_LEN = 2.85; // natural length of "hedge_row" is 2.9 m: a little overlap hides the joints

type Bounds = Anchors["bounds"];
type Spot = [number, number] | null;

/** The seeded dice and the placing helpers of one layout run: every plant goes through `plant`, in the order the phases below draw. */
type Garden = {
  b: Bounds;
  cx: number;
  cz: number;
  out: Placement[];
  hedges: { x: number; z: number; along: "x" | "z" }[];
  rr: (lo: number, hi: number) => number;
  weighted: (list: [Species, number][]) => Species;
  plant: (species: Species, x: number, z: number, o?: Partial<Placement>) => void;
  nearBuilding: (x: number, z: number, m: number) => boolean;
  inZone: (x: number, z: number) => boolean;
  /** A random spot outside the building's bounds grown by `margin`, optionally within `reach` of them. */
  spot: (margin: number, reach?: number) => Spot;
  /** Is (x, z) within d metres of a hedge segment? */
  nearHedge: (x: number, z: number, d: number) => boolean;
};

function makeGarden(b: Bounds): Garden {
  const rand = rngOf(SEED + Math.round(b.x0 * 10) + Math.round(b.y1 * 100));
  const rr = (lo: number, hi: number) => lo + rand() * (hi - lo);
  const pickN = (n: number) => (rand() * n) | 0;
  const weighted = (list: [Species, number][]) => {
    let t = rand() * list.reduce((s, [, w]) => s + w, 0);
    for (const [s, w] of list) if ((t -= w) < 0) return s;
    return list[0][0];
  };
  const cx = (b.x0 + b.x1) / 2, cz = (b.y0 + b.y1) / 2;
  const zone = decorZone(b);
  const out: Placement[] = [];
  const hedges: Garden["hedges"] = [];
  const plant: Garden["plant"] = (species, x, z, o = {}) => {
    const k = o.sx ?? rr(0.88, 1.14);
    out.push({ species, variant: pickN(4), x, y: 0, z, yaw: rr(0, Math.PI * 2), sx: k, sy: o.sy ?? k, sz: o.sz ?? k, rand: [rand(), rand(), rand(), rand()], tone: rr(0.9, 1.1), ...o });
  };
  const nearBuilding = (x: number, z: number, m: number) => x > b.x0 - m && x < b.x1 + m && z > b.y0 - m && z < b.y1 + m;
  const inZone = (x: number, z: number) => x > zone.x0 && x < zone.x1 && z > zone.y0 && z < zone.y1;
  const spot = (margin: number, reach = Infinity): Spot => {
    for (let k = 0; k < 80; k++) {
      const x = rr(b.x0 - RING, b.x1 + RING), z = rr(b.y0 - RING, b.y1 + RING);
      if (Math.hypot(x - cx, z - cz) > RING + 6 || nearBuilding(x, z, margin) || inZone(x, z) || (reach < Infinity && !nearBuilding(x, z, reach))) continue;
      return [x, z];
    }
    return null;
  };
  const nearHedge = (x: number, z: number, d: number) =>
    hedges.some((h) => {
      const [u, w] = h.along === "x" ? [x - h.x, z - h.z] : [z - h.z, x - h.x];
      return Math.hypot(Math.max(0, Math.abs(u) - HEDGE_LEN / 2), w) < d;
    });
  return { b, cx, cz, out, hedges, rr, weighted, plant, nearBuilding, inZone, spot, nearHedge };
}

/** True when a tree of this height standing at (x, z) would hide part of the flat in the default isometric view (camera at +x +z). */
function blocksView(b: Bounds, x: number, z: number, h: number, r: number) {
  for (let t = Math.max(0, h - FLAT_TOP); t <= h; t += h / RAY_STEPS / 2) {
    for (const s of [-r, 0, r]) {
      const px = x - t + s, pz = z - t - s;
      if (px > b.x0 - 0.4 && px < b.x1 + 0.4 && pz > b.y0 - 0.4 && pz < b.y1 + 0.4) return true;
    }
  }
  return false;
}

/** Hedges: a broken square around the building, west and north sides continuous, south and east in two stretches. */
function plantHedges(g: Garden) {
  const { b, rr, plant, hedges } = g;
  const hedgeOff = 6.2;
  const HX0 = b.x0 - hedgeOff, HX1 = b.x1 + hedgeOff, HZ0 = b.y0 - hedgeOff, HZ1 = b.y1 + hedgeOff;
  const hedgeSeg = (x: number, z: number, along: "x" | "z") => {
    if (g.inZone(x, z)) return;
    plant("hedge_row", x, z, { yaw: along === "x" ? 0 : Math.PI / 2, sx: 1, sy: rr(0.9, 1.1), sz: 1, tone: rr(0.92, 1.06) });
    hedges.push({ x, z, along });
  };
  for (let x = HX0; x <= HX1; x += HEDGE_LEN) {
    hedgeSeg(x, HZ0, "x");
    if ((x - HX0) % 13.2 < 5.5 || x > HX1 - 3) hedgeSeg(x, HZ1, "x");
  }
  for (let z = HZ0 + HEDGE_LEN; z < HZ1; z += HEDGE_LEN) {
    hedgeSeg(HX0, z, "z");
    if ((z - HZ0) % 13.2 < 5.5) hedgeSeg(HX1, z, "z");
  }
}

function plantTrees(g: Garden) {
  const { b, cx, cz, rr } = g;
  const trees: [number, number][] = [];
  const planted = (x: number, z: number) => trees.some(([tx, tz]) => Math.hypot(tx - x, tz - z) < TREE_GAP);
  const tree = (list: [Species, number][]) => {
    for (let k = 0; k < 30; k++) {
      const p = g.spot(3.6);
      if (!p) return;
      const [x, z] = p;
      const species = g.weighted(list);
      const def = speciesDef(species);
      const s = rr(0.95, 1.3);
      // in front of the flat (toward the camera) trees stand beyond the default frame; behind it they form the backdrop
      const front = x - cx + (z - cz) > 0;
      if (planted(x, z) || g.nearHedge(x, z, 1.4) || (front && g.nearBuilding(x, z, 9)) || blocksView(b, x, z, def.size[1] * s, def.size[0] * s * 0.4)) continue;
      trees.push([x, z]);
      g.plant(species, x, z, { sx: s, sy: s * rr(0.95, 1.1), sz: s, lod: g.nearBuilding(x, z, FAR) ? 0 : 1 });
      return;
    }
  };
  for (let i = 0; i < TREES; i++) tree(BROADLEAF);
  for (let i = 0; i < PINES; i++) tree(CONIFER);
}

/** Shrubs (two thirds hug the building so the default frame has foliage) and flower beds along the building (kept low so they never hide the flat). */
function plantBeds(g: Garden) {
  const { rr, plant } = g;
  for (let i = 0; i < BUSHES; i++) {
    const p = g.spot(1.2, i % 3 ? 6 : Infinity);
    if (!p || g.nearHedge(p[0], p[1], 0.9)) continue;
    plant(g.weighted(SHRUBS), p[0], p[1], { sx: rr(0.85, 1.25) });
  }
  for (let i = 0; i < BEDS; i++) {
    let p: Spot = null;
    for (let k = 0; k < 40 && !p; k++) {
      const q = g.spot(0.9);
      if (q && g.nearBuilding(q[0], q[1], 3)) p = q; // beds hug the building
    }
    if (p) plant(BEDS_OF[i % BEDS_OF.length], p[0], p[1], { sx: rr(0.95, 1.2), sy: 1, sz: rr(0.95, 1.2) });
  }
}

/** Loose flowers, grass, ferns, ground cover, clover, rocks and a clump of bamboo in the lawn. */
function plantLawn(g: Garden) {
  const { rr, plant, spot, nearHedge } = g;
  const loose: Species[] = ["daisy", "tulip", "daisy", "sunflower"];
  for (let i = 0; i < 40; i++) {
    const p = spot(0.6);
    if (!p || nearHedge(p[0], p[1], 0.7)) continue;
    plant(loose[i % loose.length], p[0], p[1], { sx: rr(0.8, 1.2) });
  }
  for (let i = 0; i < TUFT_CLUMPS; i++) {
    const p = spot(0.6, i % 2 ? 8 : Infinity);
    if (p && !nearHedge(p[0], p[1], 0.7)) plant("grass_tall", p[0], p[1], { sx: rr(0.8, 1.3) });
  }
  for (let i = 0; i < FERNS; i++) {
    const p = spot(0.8);
    if (p) plant("fern", p[0], p[1], { sx: rr(0.9, 1.4) });
  }
  for (let i = 0; i < COVERS; i++) {
    const p = spot(0.8);
    if (p) plant("groundcover", p[0], p[1], { sx: rr(0.9, 1.5) });
  }
  for (let i = 0; i < CLOVERS; i++) {
    const p = spot(0.5);
    if (p) plant("clover", p[0], p[1], { sx: rr(1, 2) });
  }
  for (let i = 0; i < ROCKS; i++) {
    const p = spot(1);
    if (p && !nearHedge(p[0], p[1], 0.9)) plant(i % 2 ? "rock_moss" : "rock", p[0], p[1], { sx: rr(0.8, 1.6), sy: rr(0.7, 1.2) });
  }
  const bamboo = spot(4, 9);
  if (bamboo && !nearHedge(bamboo[0], bamboo[1], 1.2)) plant("bamboo", bamboo[0], bamboo[1], { sx: 1 });
}

/** Autumn extras: toadstools and bare patches. */
function plantAutumn(g: Garden) {
  const { rr, plant, spot } = g;
  for (let i = 0; i < MUSHROOMS; i++) {
    const p = spot(0.8);
    if (p) plant("mushroom", p[0], p[1], { sx: rr(0.8, 1.4) });
  }
  for (let i = 0; i < PATCHES; i++) {
    const p = spot(0.8);
    if (p) plant("patch", p[0], p[1], { sx: rr(0.6, 1), sy: 1, sz: rr(0.6, 1) });
  }
}

export function gardenLayout(plan: Plan): Placement[] | null {
  if (!plan.rooms.length && !plan.walls.length) return null;
  const g = makeGarden(findAnchors(plan).bounds);
  plantHedges(g);
  plantTrees(g);
  plantBeds(g);
  plantLawn(g);
  plantAutumn(g);
  return keepPlantable(plan, g.out); // plants never stand in the middle of a patio, a drive, a path or a pond unless the user places them
}
