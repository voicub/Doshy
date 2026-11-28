"use client";
import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import { BufferAttribute, BufferGeometry, DoubleSide, MathUtils, type Group } from "three";
import { WALL_H } from "@/lib/geometry";
import { roofBuffers, roofForPlan, roofOf } from "@/lib/roof";
import { useStore } from "@/lib/store";
import { tiledTexture } from "@/lib/textures";
import { keepAlive } from "@/lib/framePacer";
import { useKnobs } from "@/lib/quality";
import type { Surface } from "@/lib/shellLook";
import { surfaceProps } from "./shellMaterials";
import { useLevel } from "./levelState";
import { isolationOf } from "@/lib/roomIsolate";
import { useWalking } from "@/lib/walkStore";

const FADE_RATE = 5; // the roof lifts off / settles onto the wall tops, like the storeys do
const HIDE_BELOW = 0.02;
const TILE = "#4d4039"; // warm dark slate over the brick texture
const TILES: Surface = { kind: "tile", tile: 0.9, opts: { cols: 3, rows: 6, stagger: true } }; // overlapping courses of roof tiles, 30 x 15 cm
const SLAB: Surface = { kind: "concrete", tile: 2, opts: { formwork: false }, bump: 0.8 }; // a flat roof and its parapet: weathered concrete
const SLAB_TINT = "#6f6c67";

/**
 * The house's roof, drawn inside the top level's group (so it is also gone when that level is hidden by the level view).
 * It lifts off whenever its storey is the one being looked into: Cut-away, in either state (all walls low, or the automatic cut by view direction), exists to see the
 * rooms, and a roof over them would hide exactly that. It also hides in the editing views and in Room mode; hidden means not drawn and not casting any shadow.
 */
export default function Roof() {
  const { walls, rooms, levels, building } = useStore((s) => s.plan);
  const live = useStore((s) => s.view === "live");
  const { active } = useLevel();
  const iso = useStore((s) => !!isolationOf(s)); // Room mode lifts the roof off
  const roof = useMemo(() => roofForPlan({ walls, rooms, levels, building, openings: [], items: [] }), [walls, rooms, levels, building]);
  const kn = useKnobs();
  const flat = roofOf({ building })?.type === "flat";
  const surface = flat ? SLAB : TILES;
  const geometry = useMemo(() => {
    if (!roof) return null;
    const b = roofBuffers(roof.faces);
    if (kn.textures > 0) for (let i = 0; i < b.uvs.length; i++) b.uvs[i] /= surface.tile; // uvs are metres: one texture tile per tile size
    const g = new BufferGeometry();
    g.setAttribute("position", new BufferAttribute(b.positions, 3));
    g.setAttribute("normal", new BufferAttribute(b.normals, 3));
    g.setAttribute("uv", new BufferAttribute(b.uvs, 2));
    g.setIndex(new BufferAttribute(b.indices, 1));
    return g;
  }, [roof, kn.textures, surface]);
  const pbr = useMemo(() => (kn.textures > 0 ? surfaceProps(surface, kn, 0.9) : null), [kn, surface]);
  const map = useMemo(() => (pbr ? null : tiledTexture("brick", 1, 1)), [pbr]); // uvs are metres: one brick tile per 0.6 m
  useEffect(() => () => geometry?.dispose(), [geometry]);
  useEffect(() => () => map?.dispose(), [map]);

  const walking = useWalking();
  const shown = live && (walking || (!active && !iso)); // a walker has the roof overhead: it is their ceiling
  const g = useRef<Group>(null);
  const k = useRef(shown ? 1 : 0);
  useFrame((_, dt) => {
    const grp = g.current;
    if (!grp) return;
    const t = shown ? 1 : 0;
    k.current = Math.abs(k.current - t) < 0.002 ? t : (keepAlive(), MathUtils.damp(k.current, t, FADE_RATE, Math.min(dt, 0.1)));
    grp.scale.y = Math.max(0.001, k.current);
    grp.visible = k.current > HIDE_BELOW;
  });
  if (!geometry) return null;
  return (
    <group ref={g} position={[0, WALL_H, 0]} visible={shown}>
      <mesh geometry={geometry} castShadow receiveShadow raycast={() => null}>
        <meshStandardMaterial {...(pbr ?? { map, roughness: 0.9 })} color={pbr && flat ? SLAB_TINT : TILE} metalness={0} side={DoubleSide} />
      </mesh>
    </group>
  );
}
