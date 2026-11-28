"use client";
import type { MaterialRef } from "@/lib/materialRef";
import { useTexture } from "@/lib/materialApply";
import { materialDetail } from "@/lib/planMaterials";
import PolyHavenBrowser from "./PolyHavenBrowser";

/** What the texture is for: decides the chip that starts selected and the button's words. */
export type MaterialUse = "floor" | "wall" | "ground";

const TITLES: Record<MaterialUse, string> = { floor: "Poly Haven textures for floors", wall: "Poly Haven textures for walls", ground: "Poly Haven textures for the garden" };
const BUTTONS: Record<MaterialUse, string> = { floor: "Use this floor", wall: "Use this wall", ground: "Use this ground" };

/**
 * "Material from Poly Haven...": the browse dialog for PBR textures. Choosing one downloads it through this server, keeps it and hands the plan reference to `onUse`, which lays it
 * on the selected floor, wall face or ground (one undo step: the caller calls `editPlan` once). The dialog closes when that is done.
 */
export default function MaterialBrowse({ use, onUse, onClose }: { use: MaterialUse; onUse: (ref: MaterialRef) => void; onClose: () => void }) {
  return (
    <PolyHavenBrowser
      type="textures"
      title={TITLES[use]}
      initialFilter={use}
      pickLabel={BUTTONS[use]}
      detail={materialDetail}
      onClose={onClose}
      onPick={async (item) => {
        onUse(await useTexture(item));
        onClose();
      }}
    />
  );
}
