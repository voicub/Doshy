// Pure geometry for the surroundings ("Site"): ground height, ground grid, neighbour buildings (walls with window rows, roofs by shape), roads, water, trees.
// Everything here works in PLAN axes (x east, z south = plan y, y up, metres): the caller moves site data there with lib/geo.ts `siteToPlan` first.
// No DOM and no rendering: arrays in, arrays out, so the node tests cover it. This is the one entry module; the code lives in the siteMesh* modules beside it.
// The node test runner loads these files directly: imports carry a .ts extension or are type-only.
export { hashStr, rngOf as rng } from "./mathUtil.ts";
export { parseCssColor, type RGB } from "./siteMeshBase.ts";
export { HOME_BLEND_M, HOME_FLAT_M, demAt, groundFn, homeRect, insideAny, rectDistance, terrainBlend, terrainGrid, type GroundFn } from "./siteMeshGround.ts";
export { newBuf, triangulate, type Buf } from "./siteMeshBuf.ts";
export { eaves, isHostBuilding, planBuilding, planFootprint, selectBuildings, type PlanBuilding } from "./siteMeshPlan.ts";
export { orientedBox, roofOf } from "./siteMeshRoof.ts";
export { CUT_FAR_M, CUT_NEAR_M, CUT_STRIDE, cutFactor, cutKeep, ringRectDistance } from "./siteMeshCut.ts";
export { WINDOW_CELLS, buildBuildings, buildingStyle } from "./siteMeshBuildings.ts";
export { addRibbon, buildRoads, buildWater, carveWater } from "./siteMeshWorld.ts";
export { areaTrees, pickSpecies, planTrees, scatterIn, thinTrees, type PlanTree } from "./siteMeshTrees.ts";
