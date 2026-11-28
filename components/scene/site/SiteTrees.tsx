"use client";
import { useMemo } from "react";
import { bearingOf, cutKeep, facingShare, hashStr, pickSpecies, rectCentre, rectDistance, rng, type GroundFn, type PlanTree } from "@/lib/siteMesh";
import type { Rect } from "@/lib/siteGeom";
import type { XY } from "@/lib/siteTypes";
import { useStore } from "@/lib/store";
import { speciesDef, type Placement } from "@/lib/vegetation";
import FoliageInstances from "../FoliageInstances";
import { useAzimuthBucket } from "../facingState";
import { clamp } from "@/lib/mathUtil";

/** Trees closer than this to the plan are drawn in full detail and cast shadows; the rest use the cheaper geometry and cast none (they are beyond the sun's shadow frustum). */
const NEAR_TREE_M = 34;

const SLENDER = 1.9; // tallest a crown may be, as a multiple of its width, once scaled from the species' natural shape

/**
 * A tree of the data as an instance of the garden's organic species: the species' natural shape stretched to the tree's own height and crown.
 * `keep` (1 = as it grows): the share of its height a tree keeps while Cut-away is on, so a tree beside the plan is a low shrub and does not hide the flat (the crown narrows less).
 */
function placement(t: PlanTree, ground: GroundFn, at: XY, keep: number): { near: boolean; p: Placement } {
  const h = hashStr(`${t.x.toFixed(1)},${t.z.toFixed(1)}`);
  const r = rng(h);
  const species = pickSpecies(t.leaf, t.species, r());
  const [w, height] = speciesDef(species).size;
  const sy = clamp(t.height / height, 0.4, 8);
  const sx = clamp(clamp(t.crown / w, 0.4, 8), sy / SLENDER, sy / 0.55);
  const near = Math.hypot(t.x - at[0], t.z - at[1]) < NEAR_TREE_M;
  return {
    near,
    p: { species, variant: near ? h % 2 : 0, lod: near ? 0 : 1, x: t.x, y: ground(t.x, t.z), z: t.z, yaw: r() * Math.PI * 2, sx: sx * Math.sqrt(keep), sy: sy * keep * (0.95 + r() * 0.1), sz: sx * Math.sqrt(keep), rand: [r(), r(), r(), r()], tone: 0.88 + r() * 0.22 },
  };
}

const AZIMUTH_STEP = 10; // degrees: with Cut-away off the trees are re-placed once per this much of a turn

/**
 * The surroundings' trees as instanced organic vegetation: shared foliage shader, so season, snow, leaf fall and wind come for free. Two or three dozen draw calls at most.
 * With Cut-away on, trees near the plan are lowered by the same distance curve as the neighbouring buildings (lib/siteMesh.ts cutKeep); with it off only the ones that stand
 * between the camera and the plan are (facingShare, the buildings' rule), re-placed every AZIMUTH_STEP degrees of turn. They change at once (instances are static), not eased.
 */
export default function SiteTrees({ trees, ground, homeC, footprint }: { trees: PlanTree[]; ground: GroundFn; homeC: XY; footprint: Rect | null }) {
  const cutaway = useStore((s) => s.cutaway);
  const azimuth = useAzimuthBucket(AZIMUTH_STEP);
  const { near, far } = useMemo(() => {
    const near: Placement[] = [];
    const far: Placement[] = [];
    const centre = footprint && rectCentre(footprint);
    for (const t of trees) {
      const full = footprint ? cutKeep(rectDistance(t.x, t.z, footprint), t.height) : 1;
      const share = azimuth !== null && centre ? facingShare(bearingOf(centre, [t.x, t.z]), (azimuth * Math.PI) / 180) : 1;
      const q = placement(t, ground, homeC, 1 - (1 - full) * share);
      (q.near ? near : far).push(q.p);
    }
    return { near, far };
  }, [trees, ground, homeC, footprint, cutaway, azimuth]);
  return (
    <group>
      <FoliageInstances plants={near} />
      <FoliageInstances plants={far} shadows={false} />
    </group>
  );
}
