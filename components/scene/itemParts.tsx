import { Fragment, useMemo } from "react";
import type { BufferGeometry, Material } from "three";
import type { Def } from "@/lib/catalog";
import { placementOf } from "@/lib/partBake";
import type { Knobs } from "@/lib/quality";
import type { Item } from "@/lib/types";
import FoliagePart from "./FoliagePart";
import type { Fx } from "./itemMotion";
import { partGeometry } from "./partGeometry";
import { AWAY_OPACITY, GLASS_OPACITY, partMaterial } from "./partMaterials";
import { canBake, planBake, type BakePlan } from "./partMerge";
import { NO_SHADOW } from "./pointShadow";
import type { ItemFrame } from "./useItemFrame";

const NO_BAKE: BakePlan = { baked: [], covered: [] };

type PartDraw = { geos: (BufferGeometry | null)[]; mats: (Material | null)[]; drawsParts: boolean; baked: BakePlan["baked"]; covered: BakePlan["covered"] };

/** The geometry, material and bake plan of an item's parts: one cached geometry and one shared material per distinct look (partGeometry.ts, partMaterials.ts); glow parts keep their own material, driven per piece. */
export function usePartDraw(def: Def, item: Item, knobs: Knobs, away: boolean, fx: Fx[], hasModel: boolean): PartDraw {
  const geos = useMemo(() => def.parts.map((p, i) => (p.veg ? null : partGeometry(p, knobs.bevelSegments, knobs.textures > 0 && !p.glow && !p.glass, i))), [def, knobs.bevelSegments, knobs.textures]);
  const mats = useMemo(() => def.parts.map((p) => (p.veg || p.glow ? null : partMaterial(p, p.m && item.color ? item.color : p.c, away, knobs))), [def, item.color, away, knobs]);
  // still parts that share a material are drawn as one mesh (lib/partBake.ts): a piece costs a draw call per material, not one per part
  const drawsParts = !hasModel && !def.car && !def.critter;
  const bake = useMemo(
    () => (drawsParts ? planBake(def.parts, def.parts.map(placementOf), geos, def.parts.map((p, i) => (p.detail && p.detail > knobs.detail ? null : canBake(mats[i], !fx[i]) ? mats[i] : null)), `${knobs.bevelSegments}|${knobs.textures > 0}`) : NO_BAKE),
    [drawsParts, def, geos, mats, fx, knobs.detail, knobs.bevelSegments, knobs.textures],
  );
  return { geos, mats, drawsParts, baked: bake.baked, covered: bake.covered };
}

type PartsProps = {
  item: Item;
  def: Def;
  knobs: Knobs;
  away: boolean;
  emits: boolean;
  fx: Fx[];
  frame: ItemFrame;
  draw: PartDraw;
};

/** Every part of an item as meshes: the baked merges first, then each remaining part (plants, glow parts with their own material, animated parts hung from a pivot group). */
export function ItemParts({ item, def, knobs, away, emits, fx, frame, draw }: PartsProps) {
  const { baked, covered, geos, mats } = draw;
  const distanceMaterial = emits ? NO_SHADOW : undefined;
  return (
    <>
      {baked.map((b, i) => (
        <mesh key={`baked${i}`} geometry={b.geometry} material={b.material} castShadow receiveShadow customDistanceMaterial={distanceMaterial} />
      ))}
      {draw.drawsParts &&
        def.parts.map((p, i) => {
          if (covered[i]) return null;
          if (p.veg) return <FoliagePart key={i} species={p.veg.species} seed={(p.veg.seed ?? 0) + item.id.length + item.id.charCodeAt(item.id.length - 1)} size={p.s} position={[p.p[0], p.p[1] - p.s[1] / 2, p.p[2]]} tint={p.m && item.color ? item.color : undefined} castShadow={!away} />;
          if (p.detail && p.detail > knobs.detail) return null; // trims and small details only at the tiers that ask for them
          const f = fx[i];
          const mesh = (
            <mesh geometry={geos[i] ?? undefined} material={mats[i] ?? undefined} position={f ? (f.kind === "sway" ? [0, -p.s[1] / 2, 0] : f.pivot !== undefined ? [0, p.p[1] - f.pivot, 0] : [0, 0, 0]) : p.p} rotation={p.r} scale={p.shape === "sph" ? [1, p.s[1] / p.s[0], p.s[2] / p.s[0]] : undefined} castShadow={!away && !p.glass} receiveShadow customDistanceMaterial={distanceMaterial}>
              {p.glow && (
                <meshStandardMaterial
                  ref={(m) => void (frame.glowMats.current[i] = m)}
                  color={p.m && item.color ? item.color : p.c}
                  emissive="#000000"
                  toneMapped={false}
                  roughness={0.8}
                  metalness={0}
                  transparent={away || !!p.glass}
                  opacity={away ? AWAY_OPACITY : p.glass ? GLASS_OPACITY : 1}
                  depthWrite={!away && !p.glass}
                />
              )}
            </mesh>
          );
          if (!f) return <Fragment key={i}>{mesh}</Fragment>;
          // animated parts hang from a pivot group: a spinner turns about its centre, a curtain pleat swings from its top edge
          const pivot: [number, number, number] = f.kind === "sway" ? [p.p[0], p.p[1] + p.s[1] / 2, p.p[2]] : f.pivot !== undefined ? [p.p[0], f.pivot, p.p[2]] : p.p;
          return (
            <group key={i} ref={(g) => void (frame.partRefs.current[i] = g)} position={pivot}>
              {mesh}
            </group>
          );
        })}
    </>
  );
}
