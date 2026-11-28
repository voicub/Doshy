import type { FoliageLook } from "@/lib/vegetation";
import { FOLIAGE } from "./foliageMaterial";

const setAll = (list: { set: (c: string) => unknown }[], hex: readonly string[]) => list.forEach((c, i) => c.set(hex[i]));

/** Push a season look into the shared foliage uniforms. */
export function applyFoliageLook(look: FoliageLook) {
  setAll(FOLIAGE.uLeaf.value, look.leaf);
  setAll(FOLIAGE.uConifer.value, look.conifer);
  setAll(FOLIAGE.uGrass.value, look.grass);
  setAll(FOLIAGE.uFlower.value, look.flowers);
  setAll(FOLIAGE.uLitter.value, look.litter);
  FOLIAGE.uBush.value.set(look.bush);
  FOLIAGE.uBushAlt.value.set(look.bushAlt);
  FOLIAGE.uHedge.value.set(look.hedge);
  FOLIAGE.uLeafy.value = look.leafy;
  FOLIAGE.uBloom.value = look.bloom;
  FOLIAGE.uBlossom.value = look.blossom;
  FOLIAGE.uFruit.value = look.fruit;
  FOLIAGE.uMush.value = look.mushrooms;
  FOLIAGE.uLitterShare.value = look.litterShare;
  FOLIAGE.uGrow.value = look.growth;
}
