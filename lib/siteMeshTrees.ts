// Trees in plan axes: species choice, thinning, and scattering trees inside woods and scrub that have none mapped.
import { hashStr, rngOf } from "./mathUtil.ts";
import { pointInShape, polygonBounds } from "./siteGeom.ts";
import { clean } from "./siteMeshBuf.ts";
import type { SiteArea, SiteTree, XY } from "./siteTypes.ts";
import type { Species } from "./vegetation.ts";

export type PlanTree = { x: number; z: number; height: number; crown: number; leaf: "broad" | "needle"; species?: Species; source: "osm" | "photo" | "area" };

const BROAD: [Species, number][] = [["oak", 3], ["linden", 3], ["maple", 2], ["birch", 2], ["poplar", 1]];
const NEEDLE: [Species, number][] = [["spruce", 4], ["pine", 3], ["fir", 2]];
const TREES: Record<string, true> = { oak: true, birch: true, maple: true, linden: true, willow: true, poplar: true, cypress: true, cherry: true, apple: true, pine: true, spruce: true, fir: true, palm: true, olive: true, shrub: true };

/** The species to draw: the mapped one when it is a tree we have, else a stable mix by leaf type. `r` in [0, 1). */
export function pickSpecies(leaf: "broad" | "needle", species: string | undefined, r: number): Species {
  if (species && TREES[species]) return species as Species;
  const list = leaf === "needle" ? NEEDLE : BROAD;
  let t = r * list.reduce((s, [, w]) => s + w, 0);
  for (const [s, w] of list) if ((t -= w) < 0) return s;
  return list[0][0];
}

/** At most `cap` trees, the nearest to `at` first: the nearest `nearShare` of the budget are all kept, the rest of the budget is spread evenly over the farther ones. */
export function thinTrees<T extends { x: number; z: number }>(trees: readonly T[], at: XY, cap: number, nearShare = 0.6): T[] {
  const sorted = trees.map((t) => ({ t, d: Math.hypot(t.x - at[0], t.z - at[1]) })).sort((a, b) => a.d - b.d).map((k) => k.t);
  if (sorted.length <= cap) return sorted;
  const near = Math.floor(cap * nearShare);
  const rest = sorted.slice(near);
  const want = cap - near;
  const out = sorted.slice(0, near);
  for (let i = 0; i < want; i++) out.push(rest[Math.floor(((i + 0.5) * rest.length) / want)]);
  return out;
}

/** Deterministic points inside a polygon on a jittered grid `spacing` metres apart (at most `max`): where a wood without mapped trees gets its trees. */
export function scatterIn(ring: readonly XY[], holes: readonly (readonly XY[])[], spacing: number, seed: string, max: number): XY[] {
  const bb = polygonBounds(ring);
  const rnd = rngOf(hashStr(seed));
  const out: XY[] = [];
  for (let y = bb.y0 + spacing / 2; y < bb.y1 && out.length < max; y += spacing) {
    for (let x = bb.x0 + spacing / 2; x < bb.x1 && out.length < max; x += spacing) {
      const p: XY = [x + (rnd() - 0.5) * spacing * 0.8, y + (rnd() - 0.5) * spacing * 0.8];
      if (pointInShape(p, ring, holes)) out.push(p);
    }
  }
  return out;
}

/** Trees from the data in plan axes. */
export const planTrees = (trees: readonly SiteTree[], toPlan: (p: XY) => XY): PlanTree[] =>
  trees.map((t) => {
    const p = toPlan([t.x, t.y]);
    return { x: p[0], z: p[1], height: t.height, crown: t.crown, leaf: t.leaf, species: t.species, source: t.source };
  });

const SPACING: Partial<Record<SiteArea["kind"], number>> = { wood: 6.5, scrub: 4.5 };

/** The trees (and bushes, as short broadleaf entries) a wood or scrub polygon gets when no tree is mapped inside it. */
export function areaTrees(areas: readonly SiteArea[], toPlan: (p: XY) => XY, mapped: readonly { x: number; z: number }[], max: number): PlanTree[] {
  const out: PlanTree[] = [];
  for (const a of areas) {
    const spacing = SPACING[a.kind];
    if (!spacing || out.length >= max) continue;
    const ring = clean(a.ring.map(toPlan));
    if (!ring) continue;
    const holes = (a.holes ?? []).map((h) => h.map(toPlan));
    if (mapped.some((t) => pointInShape([t.x, t.z], ring, holes))) continue;
    const rnd = rngOf(hashStr(a.id) ^ 0x51ed);
    for (const [x, z] of scatterIn(ring, holes, spacing, a.id, max - out.length)) {
      const needle = a.leaf === "needle" || (a.leaf === "mixed" && rnd() < 0.5);
      const scrub = a.kind === "scrub";
      const h = scrub ? 1.5 + rnd() * 1.5 : 8 + rnd() * 9;
      out.push({ x, z, height: h, crown: scrub ? h * 1.1 : h * (needle ? 0.4 : 0.6), leaf: needle ? "needle" : "broad", species: scrub ? "shrub" : undefined, source: "area" });
    }
  }
  return out;
}
