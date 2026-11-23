"use client";
import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { keepAlive } from "@/lib/framePacer";
import { MathUtils, type Group } from "three";
import { WALL_CUT_H, WALL_H, WALL_T, roomAtLevel, wallBoxes, wallLen, type Box } from "@/lib/geometry";
import { WALLS, faceTint, isGlassWall, isOutdoorFloor, wallFaces, type Face } from "@/lib/materials";
import { tiledTexture } from "@/lib/textures";
import { isFence, wallHeight } from "@/lib/fences";
import { useStore } from "@/lib/store";
import { isOn } from "@/lib/light";
import { useKnobs, type Knobs } from "@/lib/quality";
import { WALL_SURFACE, type Surface } from "@/lib/shellLook";
import { buttEnds, trimFaces } from "@/lib/shellDetail";
import { levelIdOf } from "@/lib/levels";
import type { Room, Wall } from "@/lib/types";
import OpeningMesh from "./OpeningMesh";
import WallTrims from "./WallTrims";
import { WALL_EDGE, wallBox } from "./shellGeometry";
import { flatMaterial, surfaceMaterial } from "./shellMaterials";
import FenceMesh from "./FenceMesh";
import { useCutaway, useLevel } from "./levelState";
import { useIsoSink, useIsoWall } from "./isoState";
import { NO_SHADOW } from "./pointShadow";

const { damp } = MathUtils;
const PLINTH = "#5c534b";
const CAP = "#23262e"; // dark wall top, like the cut-away reference
const FRAME = "#2a2d33"; // thin aluminium frame of a glass wall
const FRAME_T = 0.05;
const MULLION_EVERY = 1.6; // metres between the vertical bars of a glass wall
const GLASS_T = 0.03;

/** A glass wall: one thin transparent pane with a slim frame round it and a bar every so often. It casts no shadow, so light passes. */
function GlassBox({ s0, s1, y0, y1, tint }: { s0: number; s1: number; y0: number; y1: number; tint: string }) {
  const w = s1 - s0;
  const h = y1 - y0;
  const bars = Math.max(0, Math.round(w / MULLION_EVERY) - 1);
  const frame = <meshStandardMaterial color={FRAME} roughness={0.5} metalness={0.6} />;
  return (
    <group position={[(s0 + s1) / 2, (y0 + y1) / 2, 0]}>
      <mesh>
        <boxGeometry args={[w, h, GLASS_T]} />
        <meshStandardMaterial color={tint} transparent opacity={0.22} roughness={0.05} metalness={0.1} depthWrite={false} />
      </mesh>
      {[-1, 1].map((k) => (
        <mesh key={`r${k}`} position={[0, (k * (h - FRAME_T)) / 2, 0]} castShadow>
          <boxGeometry args={[w, FRAME_T, FRAME_T]} />
          {frame}
        </mesh>
      ))}
      {[-1, 1].map((k) => (
        <mesh key={`p${k}`} position={[(k * (w - FRAME_T)) / 2, 0, 0]} castShadow>
          <boxGeometry args={[FRAME_T, h, FRAME_T]} />
          {frame}
        </mesh>
      ))}
      {Array.from({ length: bars }, (_, i) => (
        <mesh key={`m${i}`} position={[-w / 2 + (w * (i + 1)) / (bars + 1), 0, 0]} castShadow>
          <boxGeometry args={[FRAME_T * 0.6, h, FRAME_T * 0.6]} />
          {frame}
        </mesh>
      ))}
    </group>
  );
}

/** A wall segment at the lowest tier: the flat voxel look it always had. */
function FlatWallBox({ box, len, wall }: { box: Box; len: number; wall: Wall }) {
  const t = wall.thickness ?? WALL_T;
  // extend wall ends by half a thickness so corners close
  const s0 = box.s0 === 0 ? -t / 2 : box.s0;
  const s1 = box.s1 === len ? len + t / 2 : box.s1;
  const h = box.y1 - box.y0;
  // face A is the +z side, face B the -z side; a wall saved before faces existed has two identical ones
  const [fa, fb] = wallFaces(wall);
  const same = fa.style === fb.style;
  const plinthH = (fa.style === "brick" || fb.style === "brick") && box.y0 === 0 ? Math.min(0.25, h) : 0;
  const texA = useMemo(() => (WALLS[fa.style].plain ? null : tiledTexture(fa.style, s1 - s0, h, s0, box.y0)), [fa.style, s0, s1, h, box.y0]);
  const texB = useMemo(() => (same || WALLS[fb.style].plain ? null : tiledTexture(fb.style, s1 - s0, h, s0, box.y0)), [same, fb.style, s0, s1, h, box.y0]);
  useEffect(() => () => texA?.dispose(), [texA]);
  useEffect(() => () => texB?.dispose(), [texB]);
  if (fa.style === "glass") return <GlassBox s0={s0 - len / 2} s1={s1 - len / 2} y0={box.y0} y1={box.y1} tint={faceTint(fa)} />;
  const face = (i: number, f: typeof fa, map: typeof texA) => <meshStandardMaterial key={i} attach={`material-${i}`} map={map} color={faceTint(f)} roughness={WALLS[f.style].rough} />;
  return (
    <mesh position={[(s0 + s1) / 2 - len / 2, (box.y0 + box.y1) / 2, 0]} castShadow receiveShadow>
      <boxGeometry args={[s1 - s0, h, t]} />
      {[0, 1, 3, 4].map((i) => face(i, fa, texA))}
      {face(5, fb, same ? texA : texB)}
      <meshStandardMaterial attach="material-2" color={isFence(wall.style) ? faceTint(fa) : CAP} roughness={0.7} />
      {plinthH > 0 && (
        <mesh position={[0, plinthH / 2 - h / 2, 0]} castShadow receiveShadow>
          <boxGeometry args={[s1 - s0 + 0.02, plinthH, t + 0.04]} />
          <meshStandardMaterial color={PLINTH} roughness={0.95} />
        </mesh>
      )}
    </mesh>
  );
}

const CAP_ROUGH = 0.7;
const surfaceOf = (f: Face) => WALL_SURFACE[f.style];

/** A wall segment with real surface: rounded edges, metric uvs so brick courses, boards and plaster keep their size on any length, shared PBR materials. */
function ShellWallBox({ box, len, wall, k, butt }: { box: Box; len: number; wall: Wall; k: Knobs; butt: readonly [boolean, boolean] }) {
  const t = wall.thickness ?? WALL_T;
  const s0 = box.s0 === 0 ? (butt[0] ? 0 : -t / 2) : box.s0; // extend wall ends by half a thickness so corners close (not into a wall running straight on: that would overlap)
  const s1 = box.s1 === len ? (butt[1] ? len : len + t / 2) : box.s1;
  const h = box.y1 - box.y0;
  const [fa, fb] = wallFaces(wall);
  const cx = (s0 + s1) / 2;
  const cy = (box.y0 + box.y1) / 2;
  const sa = surfaceOf(fa);
  const sb = surfaceOf(fb);
  const geo = useMemo(
    () =>
      wallBox(s1 - s0, h, t, k.bevelSegments, WALL_EDGE, [cx, cy, 0], (_x, _y, nz) => {
        const f: Surface | undefined = nz < -0.5 ? sb : sa; // face B is -z; everything else (ends, underside) reads as face A
        return { tile: f?.tile ?? 1, swap: f?.swap };
      }),
    [s0, s1, h, t, cx, cy, k.bevelSegments, sa, sb],
  );
  useEffect(() => () => geo.dispose(), [geo]);
  const fence = isFence(wall.style);
  const side = (f: Face, surf: Surface | undefined, end = false) => (surf ? surfaceMaterial(surf, faceTint(f), WALLS[f.style].rough, k, end) : flatMaterial(faceTint(f), WALLS[f.style].rough, end));
  const mats = useMemo(
    () => [side(fa, sa, true), side(fa, sa, true), flatMaterial(fence ? faceTint(fa) : CAP, CAP_ROUGH), side(fa, sa, true), side(fa, sa), side(fb, sb)],
    [fa.style, fa.color, fb.style, fb.color, sa, sb, fence, k], // keyed by the face values, not the face objects
  );
  if (fa.style === "glass") return <GlassBox s0={s0 - len / 2} s1={s1 - len / 2} y0={box.y0} y1={box.y1} tint={faceTint(fa)} />;
  return <mesh position={[cx - len / 2, cy, 0]} geometry={geo} material={mats} castShadow receiveShadow />;
}

/** Invisible, full-height stand-in for a cut-away wall: blocks lamp light (point-light shadows) but not the sun, and draws nothing. */
function ShadowWall({ box, len, wall }: { box: Box; len: number; wall: Wall }) {
  const t = wall.thickness ?? WALL_T;
  const s0 = box.s0 === 0 ? -t / 2 : box.s0;
  const s1 = box.s1 === len ? len + t / 2 : box.s1;
  return (
    <mesh position={[(s0 + s1) / 2 - len / 2, (box.y0 + box.y1) / 2, 0]} castShadow customDepthMaterial={NO_SHADOW} raycast={() => null}>
      <boxGeometry args={[s1 - s0, box.y1 - box.y0, t]} />
      <meshBasicMaterial colorWrite={false} depthWrite={false} />
    </mesh>
  );
}

export default function WallMesh({ wall }: { wall: Wall }) {
  const k = useKnobs();
  const openings = useStore((s) => s.plan.openings);
  const iso = useIsoWall(wall.id); // Room mode: far walls of the isolated room stand, near ones are cut, the rest sink away
  const cutGlobal = useCutaway();
  const cutaway = iso === "tall" ? false : iso === "cut" ? true : cutGlobal;
  const { id: levelId, elevation } = useLevel();
  const lit = useStore((s) => s.plan.items.some((it) => it.entity?.startsWith("light.") && isOn(s.states[it.entity])));
  const glow = useRef(0);
  useFrame((_, dt) => {
    glow.current = damp(glow.current, lit ? 1 : 0, 3, dt);
    if (Math.abs(glow.current - (lit ? 1 : 0)) > 0.002) keepAlive(false);
  });
  const len = wallLen(wall);
  const mine = useMemo(() => openings.filter((o) => o.wallId === wall.id), [openings, wall.id]);
  const H = wallHeight(wall, WALL_H);
  const top = cutaway ? Math.min(H, WALL_CUT_H) : H;
  const ref = useRef<Group>(null);
  const sink = useIsoSink(ref, iso === "hide");
  const was = useRef({ iso, top });
  useLayoutEffect(() => {
    // a wall that is raised or cut by Room mode grows or shrinks from where it stood instead of jumping
    if ((iso !== undefined || was.current.iso !== undefined) && was.current.top !== top) sink.current = Math.min(20, Math.max(0.001, (sink.current * was.current.top) / top));
    was.current = { iso, top };
  }, [iso, top, sink]);
  const fence = isFence(wall.style);
  const open = fence && wall.style !== "wall_stone" && wall.style !== "wall_brick_low"; // posts, pickets, wire, boards and hedges are built by FenceMesh; low walls are plain slabs
  const boxes = useMemo(() => wallBoxes(len, mine, cutaway ? Math.min(H, WALL_CUT_H) : H), [len, mine, cutaway, H]);
  const plan = useStore((s) => s.plan);
  const butt = useMemo(() => buttEnds(wall, plan.walls.filter((w) => levelIdOf(plan, w) === levelIdOf(plan, wall))), [plan.walls, plan.levels, wall]); // the slices the ends depend on, not the whole plan
  const faces = useMemo(() => trimFaces(plan, wall), [plan.rooms, plan.levels, wall]);
  // cut-away walls are low, but lamplight must still stop at the full wall: invisible full-height boxes that only shadow point lights (tiers without point-light shadows draw none)
  const tall = useMemo(() => (k.pointShadows && cutaway && H > WALL_CUT_H ? wallBoxes(len, mine, H) : []), [k.pointShadows, len, mine, cutaway, H]);
  const [faceA] = wallFaces(wall);
  const glass = isGlassWall(wall);
  const angle = Math.atan2(wall.b.y - wall.a.y, wall.b.x - wall.a.x);
  const inward = useStore((s) => {
    // local +z points to world (-sin a, cos a); shafts, draughts and swinging sashes go into whichever side is a room, preferring indoors over a balcony or lawn
    const mx = (wall.a.x + wall.b.x) / 2;
    const my = (wall.a.y + wall.b.y) / 2;
    const side = (k: number) => roomAtLevel(s.plan, levelId, mx - Math.sin(angle) * 0.4 * k, my + Math.cos(angle) * 0.4 * k);
    const a = side(1);
    const b = side(-1);
    const outdoor = (r?: Room) => !!r && isOutdoorFloor(r.floor);
    if (a && b) return outdoor(a) && !outdoor(b) ? -1 : 1;
    return b && !a ? -1 : 1;
  });
  return (
    <group ref={ref} position={[(wall.a.x + wall.b.x) / 2, 0, (wall.a.y + wall.b.y) / 2]} rotation={[0, -angle, 0]}>
      {open
        ? <FenceMesh style={wall.style} boxes={boxes} len={len} t={wall.thickness ?? WALL_T} color={faceTint(faceA)} />
        : boxes.map((b, i) => (
            k.textures > 0 ? <ShellWallBox key={i} box={b} len={len} wall={wall} k={k} butt={butt} /> : <FlatWallBox key={i} box={b} len={len} wall={wall} />
          ))}
      {!glass && !fence && tall.map((b, i) => (
        <ShadowWall key={`s${i}`} box={b} len={len} wall={wall} />
      ))}
      {k.detail >= 1 && !glass && !open && (
        <WallTrims openings={mine} len={len} t={wall.thickness ?? WALL_T} height={H} top={top} faces={faces} ground={elevation < 0.01} detail={k.detail} outsideTint={faceTint(wallFaces(wall)[faces.outside === 1 ? 0 : 1])} />
      )}
      {mine.map((o) => (
        <OpeningMesh key={o.id} opening={o} wallLen={len} cutaway={cutaway} glow={glow} inward={inward} thickness={wall.thickness ?? WALL_T} wallTint={faceTint(faceA)} />
      ))}
    </group>
  );
}
