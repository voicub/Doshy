"use client";
import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import { MathUtils, type Group } from "three";
import { SLAB_T, onLevel, sortedLevels } from "@/lib/levels";
import { isOpenAir, type Rect } from "@/lib/stairs";
import { useStore } from "@/lib/store";
import { keepAlive } from "@/lib/framePacer";
import { useKnobs } from "@/lib/quality";
import type { Surface } from "@/lib/shellLook";
import type { Level, Pt } from "@/lib/types";
import { activeVoids, holesIn, levelBelow } from "@/lib/voids";
import { useHoledSlab } from "./holedSlab";
import { shellBox, useMetricUv } from "./shellGeometry";
import { surfaceMaterial } from "./shellMaterials";
import Dust from "./Dust";
import BoxInstances, { type BoxSpec } from "./BoxInstances";
import BuildingHallway from "./BuildingHallway";
import Foundation, { CONCRETE, SLAB_OUTSET } from "./Foundation";
import ItemMesh from "./ItemMesh";
import ContactShadows from "./ContactShadows";
import LiveLayers from "./LiveLayers";
import RoomFloor from "./RoomFloor";
import Roof from "./Roof";
import WallMesh from "./WallMesh";
import { LevelCtx, useLevelVisibility } from "./levelState";

const FADE_RATE = 5; // storeys collapse onto their floor / rise from it
const HIDE_BELOW = 0.02;
const SLAB_SURFACE: Surface = { kind: "concrete", tile: 2, opts: { formwork: false }, bump: 0.8 };

/** Concrete slab under every room of a raised storey (a balcony gets its own, flush with its edge), with the level's stairwells cut out of it. */
function Slab({ level }: { level: Level }) {
  const plan = useStore((s) => s.plan);
  const parts = useMemo(() => {
    const voids = activeVoids(plan, level.id);
    return onLevel(plan, level.id).rooms.map((r) => {
      const m = isOpenAir(r) ? 0 : SLAB_OUTSET;
      const rect = { x: r.x - m, y: r.y - m, w: r.w + 2 * m, h: r.h + 2 * m };
      return { id: r.id, rect, holes: holesIn(rect, voids) };
    });
  }, [plan.rooms, plan.voids, plan.levels, level.id]); // `plan` itself changes on every edit; only these slices shape the slabs
  const boxes = useMemo<BoxSpec[]>(() => parts.filter((p) => !p.holes.length).map(({ rect: r }) => ({ x: r.x + r.w / 2, y: -SLAB_T / 2, z: r.y + r.h / 2, sx: r.w, sy: SLAB_T, sz: r.h })), [parts]);
  const k = useKnobs();
  const whole = parts.filter((p) => !p.holes.length);
  return (
    <>
      {k.textures > 0 ? whole.map((p) => <ConcreteSlab key={p.id} rect={p.rect} />) : <BoxInstances boxes={boxes} color={CONCRETE} />}
      {parts.filter((p) => p.holes.length).map((p) => <HoledSlab key={p.id} rect={p.rect} holes={p.holes} />)}
    </>
  );
}

/** A slab with real concrete (pores, faint formwork marks) and slightly rounded edges; the uvs are metres so the grain keeps its size. */
function ConcreteSlab({ rect: r }: { rect: Rect }) {
  const k = useKnobs();
  const geo = useMemo(() => shellBox(r.w, SLAB_T, r.h, k.bevelSegments, 0.012, [r.x + r.w / 2, -SLAB_T / 2, r.y + r.h / 2], () => ({ tile: SLAB_SURFACE.tile })), [r.x, r.y, r.w, r.h, k.bevelSegments]);
  useEffect(() => () => geo.dispose(), [geo]);
  return <mesh geometry={geo} material={surfaceMaterial(SLAB_SURFACE, CONCRETE, 0.9, k)} position={[r.x + r.w / 2, -SLAB_T / 2, r.y + r.h / 2]} castShadow receiveShadow raycast={() => null} />;
}

function HoledSlab({ rect, holes }: { rect: Rect; holes: Pt[][] }) {
  const geo = useHoledSlab(rect, holes, SLAB_T);
  const k = useKnobs();
  useMetricUv(geo, k.textures > 0 ? SLAB_SURFACE.tile : undefined);
  return geo && (
    <mesh geometry={geo} material={k.textures > 0 ? surfaceMaterial(SLAB_SURFACE, CONCRETE, 0.9, k) : undefined} position={[0, -SLAB_T, 0]} castShadow receiveShadow raycast={() => null}>
      {k.textures === 0 && <meshStandardMaterial color={CONCRETE} roughness={0.9} />}
    </mesh>
  );
}

function LevelContent({ level, gauge, highest }: { level: Level; gauge: boolean; highest: boolean }) {
  const plan = useStore((s) => s.plan);
  const c = useMemo(() => onLevel(plan, level.id), [plan, level.id]);
  return (
    <>
      {(level.elevation > 0.01 || levelBelow(plan, level.id)) && <Slab level={level} />}
      {c.rooms.map((r) => (
        <RoomFloor key={r.id} room={r} />
      ))}
      {c.walls.map((w) => (
        <WallMesh key={w.id} wall={w} />
      ))}
      {c.items.map((i) => (
        <ItemMesh key={i.id} item={i} />
      ))}
      <ContactShadows levelId={level.id} items={c.items} />
      {sortedLevels(plan)[0].id === level.id && <BuildingHallway />}
      <Dust rooms={c.rooms} />
      <LiveLayers levelId={level.id} gauge={gauge} />
      {highest && <Roof />}
    </>
  );
}

/** One storey, lifted to its elevation. Hidden storeys sink onto their floor (damped) instead of popping out. */
function LevelGroup({ level, active, shown, top, highest }: { level: Level; active: boolean; shown: boolean; top: boolean; highest: boolean }) {
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
  const ctx = useMemo(() => ({ id: level.id, elevation: level.elevation, active }), [level.id, level.elevation, active]);
  return (
    <group ref={g} position={[0, level.elevation, 0]} visible={shown}>
      <LevelCtx.Provider value={ctx}>
        <LevelContent level={level} gauge={top} highest={highest} />
      </LevelCtx.Provider>
    </group>
  );
}

/** The whole building: foundation, then every storey at its elevation. */
export default function Levels() {
  const { levels, activeId, visible } = useLevelVisibility();
  const topVisible = useMemo(() => [...levels].reverse().find((l) => visible[l.id])?.id, [levels, visible]);
  return (
    <>
      <Foundation />
      {levels.map((l) => (
        <LevelGroup key={l.id} level={l} active={l.id === activeId} shown={visible[l.id]} top={l.id === topVisible} highest={l === levels[levels.length - 1]} />
      ))}
    </>
  );
}
