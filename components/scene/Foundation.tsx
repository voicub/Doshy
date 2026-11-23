"use client";
import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import { Color, MeshStandardMaterial } from "three";
import { WALL_T } from "@/lib/geometry";
import { shellWalls } from "@/lib/fences";
import { SLAB_T, onLevel, sortedLevels } from "@/lib/levels";
import { buildingRects, exposedEdges, isOpenAir, type Edge, type Rect, type StairSpec } from "@/lib/stairs";
import { entrySteps, hallwayOf, hallwayPlinth } from "@/lib/hallway";
import { useStore } from "@/lib/store";
import { tiledTexture } from "@/lib/textures";
import { isBrickWall, sectionStyle } from "@/lib/materials";
import { useKnobs, type Knobs } from "@/lib/quality";
import { WALL_SURFACE, type Surface } from "@/lib/shellLook";
import BoxInstances, { type BoxSpec } from "./BoxInstances";
import { shellBox } from "./shellGeometry";
import { surfaceMaterial } from "./shellMaterials";
import { live } from "./skyLive";

type PlinthStyle = "brick" | "plaster";
const TINT: Record<PlinthStyle, string> = { brick: "#d9cfc3", plaster: "#f1efea" };
const PLINTH_DARKEN = 0.58;
const PLINTH_INSET = 0.08; // the plinth sits slightly inside the slab so the slab reads as a drip edge
const SLAB_OUTSET = 0.12;
const CONCRETE = "#8d8a84";
const STEP_SURFACE: Surface = { kind: "concrete", tile: 1, opts: { formwork: false }, bump: 1 };
const PLINTH_RENDER: Surface = { kind: "concrete", tile: 2, opts: { formwork: false }, bump: 0.7 };
const METAL = "#23262e";
const GRILLE_EVERY = 2.4;
const GRILLE_CLEAR = 1.5; // keep ventilation grilles this far from the entrance stairs

export { CONCRETE, SLAB_OUTSET };

/** Position/rotation of a box lying along an exposed edge, pushed `out` metres off its face. */
const along = (e: Edge, u: number, out: number, y: number, len: number, h: number, d: number): BoxSpec => {
  const dx = e.x1 - e.x0;
  const dz = e.y1 - e.y0;
  const L = Math.hypot(dx, dz) || 1;
  const x = e.x0 + (dx / L) * u + e.nx * out;
  const z = e.y0 + (dz / L) * u + e.ny * out;
  return { x, y, z, sx: len, sy: h, sz: d, ry: -Math.atan2(dz, dx) };
};

/** The raised ground floor's plinth: render-textured concrete block from the ground up to the slab, with grilles, a base band and a drip lip. */
function Plinth({ top, rects, style, stairs }: { top: number; rects: Rect[]; style: PlinthStyle; stairs: StairSpec[] }) {
  const k = useKnobs();
  const surf: Surface | undefined = k.textures > 0 ? (style === "brick" ? WALL_SURFACE.brick : PLINTH_RENDER) : undefined; // render-finished concrete or brick, courses and pores in metres
  const blocks = useMemo(() => (surf ? rects.map((r) => shellBox(r.w, top, r.h, k.bevelSegments, 0.01, [r.x + r.w / 2, top / 2, r.y + r.h / 2], () => ({ tile: surf.tile }))) : []), [surf, rects, top, k.bevelSegments]);
  useEffect(() => () => blocks.forEach((g) => g.dispose()), [blocks]);
  const base = useMemo(() => new Color(TINT[style]).multiplyScalar(PLINTH_DARKEN), [style]);
  const shared = useMemo(() => (surf ? surfaceMaterial(surf, `#${base.getHexString()}`, 0.95, k) : null), [surf, base, k]);
  const mats = useMemo(
    () =>
      surf ? [] : rects.map((r) => {
        const side = (w: number) => new MeshStandardMaterial({ map: tiledTexture("plaster", w, top), color: base, roughness: 0.95 });
        const plain = new MeshStandardMaterial({ color: base, roughness: 0.95 });
        // box face order: +x, -x, +y, -y, +z, -z
        return [side(r.h), side(r.h), plain, plain, side(r.w), side(r.w)];
      }),
    [rects, top, base, surf],
  );
  useEffect(
    () => () =>
      mats.forEach((set) => {
        const seen = new Set<MeshStandardMaterial>();
        set.forEach((m) => {
          if (seen.has(m)) return;
          seen.add(m);
          m.map?.dispose();
          m.dispose();
        });
      }),
    [mats],
  );

  const trim = useMemo(() => {
    const edges = exposedEdges(rects).filter((e) => Math.hypot(e.x1 - e.x0, e.y1 - e.y0) > 0.4);
    const band: BoxSpec[] = [];
    const lip: BoxSpec[] = [];
    const frame: BoxSpec[] = [];
    const grille: BoxSpec[] = [];
    for (const e of edges) {
      const L = Math.hypot(e.x1 - e.x0, e.y1 - e.y0);
      band.push(along(e, L / 2, 0.012, 0.09, L, 0.18, 0.03));
      lip.push(along(e, L / 2, 0.03, top - 0.018, L + 0.02, 0.036, 0.07));
      const n = L >= 1.4 ? Math.max(1, Math.round(L / GRILLE_EVERY)) : 0;
      for (let k = 0; k < n; k++) {
        const u = ((k + 0.5) / n) * L;
        const cx = e.x0 + ((e.x1 - e.x0) / L) * u;
        const cz = e.y0 + ((e.y1 - e.y0) / L) * u;
        if (stairs.some((s) => Math.hypot(s.x - cx, s.y - cz) < GRILLE_CLEAR + s.width / 2)) continue;
        frame.push(along(e, u, 0.008, 0.46, 0.66, 0.3, 0.016));
        grille.push(along(e, u, 0.02, 0.46, 0.56, 0.22, 0.012));
      }
    }
    return { band, lip, frame, grille };
  }, [rects, top, stairs]);

  return (
    <>
      {rects.map((r, i) => (
        <mesh key={i} position={[r.x + r.w / 2, top / 2, r.y + r.h / 2]} material={shared ?? mats[i]} castShadow receiveShadow raycast={() => null}>
          {blocks[i] ? <primitive object={blocks[i]} attach="geometry" /> : <boxGeometry args={[r.w, top, r.h]} />}
        </mesh>
      ))}
      <BoxInstances boxes={trim.band} color="#4a4742" />
      <BoxInstances boxes={trim.lip} color="#bdb9b0" />
      <BoxInstances boxes={trim.frame} color="#7c776e" />
      <BoxInstances boxes={trim.grille} color="#15171b" roughness={0.6} shadow={false} />
    </>
  );
}

/** Entrance steps as real concrete blocks with a rounded nosing (one mesh per step; there are only a handful). */
function ConcreteSteps({ boxes, k }: { boxes: BoxSpec[]; k: Knobs }) {
  const geos = useMemo(() => boxes.map((b) => shellBox(b.sx, b.sy, b.sz, k.bevelSegments, 0.02, [b.x, b.y, b.z], () => ({ tile: STEP_SURFACE.tile }))), [boxes, k.bevelSegments]);
  useEffect(() => () => geos.forEach((g) => g.dispose()), [geos]);
  const mat = surfaceMaterial(STEP_SURFACE, "#a29f98", 0.9, k);
  return (
    <>
      {geos.map((g, i) => <mesh key={i} geometry={g} material={mat} position={[boxes[i].x, boxes[i].y, boxes[i].z]} castShadow receiveShadow raycast={() => null} />)}
    </>
  );
}

/** Concrete entrance steps: landing, treads, side handrails and small lamps that come on at dusk. Local +z points away from the door. */
function Staircase({ spec }: { spec: StairSpec }) {
  const k = useKnobs();
  const { blocks, rails, posts, width } = spec;
  const half = width / 2;
  const geo = useMemo(() => {
    const steps: BoxSpec[] = blocks.map((b) => ({ x: 0, y: b.top / 2, z: (b.s0 + b.s1) / 2, sx: width, sy: b.top, sz: b.s1 - b.s0 }));
    const rail: BoxSpec[] = [];
    const post: BoxSpec[] = [];
    for (const side of [-1, 1]) {
      const x = side * (half - 0.04);
      for (const r of rails) {
        const ds = r.s1 - r.s0;
        const dy = r.y1 - r.y0;
        rail.push({ x, y: (r.y0 + r.y1) / 2, z: (r.s0 + r.s1) / 2, sx: 0.04, sy: 0.04, sz: Math.hypot(ds, dy), rx: -Math.atan2(dy, ds) });
      }
      for (const p of posts) {
        // a post stands on the nosing below it
        const idx = blocks.findIndex((b) => p.s >= b.s0 - 1e-6 && p.s <= b.s1 + 1e-6);
        const foot = idx >= 0 ? blocks[idx].top : 0;
        post.push({ x, y: (foot + p.top) / 2, z: p.s, sx: 0.04, sy: p.top - foot, sz: 0.04 });
      }
    }
    return { steps, rail, post };
  }, [blocks, rails, posts, width, half]);

  const lamp = useRef<MeshStandardMaterial>(null);
  useFrame(() => {
    if (lamp.current) lamp.current.emissiveIntensity = 0.2 + (1 - live.daylight) * 2.6;
  });
  const lampY = Math.max(...posts.map((p) => p.top)) + 0.06;
  const rot = Math.atan2(spec.nx, spec.ny);
  return (
    <group position={[spec.x + spec.nx * (WALL_T / 2), 0, spec.y + spec.ny * (WALL_T / 2)]} rotation={[0, rot, 0]}>
      {k.textures > 0 ? <ConcreteSteps boxes={geo.steps} k={k} /> : <BoxInstances boxes={geo.steps} color="#a29f98" />}
      <BoxInstances boxes={geo.rail} color={METAL} roughness={0.5} metalness={0.4} />
      <BoxInstances boxes={geo.post} color={METAL} roughness={0.5} metalness={0.4} />
      {[-1, 1].map((side) => (
        <mesh key={side} position={[side * (half - 0.04), lampY, 0.05]} raycast={() => null}>
          <boxGeometry args={[0.07, 0.07, 0.07]} />
          <meshStandardMaterial ref={side === -1 ? lamp : undefined} color="#2a2a2a" emissive="#ffd9a0" emissiveIntensity={0.2} toneMapped={false} />
        </mesh>
      ))}
    </group>
  );
}

/** Slim columns carrying an open-air slab (a balcony) of a raised floor. */
function Pilotis({ top, rects }: { top: number; rects: Rect[] }) {
  const boxes = useMemo(() => {
    const out: BoxSpec[] = [];
    for (const r of rects) {
      const inset = 0.16;
      for (const x of [r.x + inset, r.x + r.w - inset]) for (const z of [r.y + inset, r.y + r.h - inset]) out.push({ x, y: top / 2, z, sx: 0.16, sy: top, sz: 0.16 });
    }
    return out;
  }, [rects, top]);
  return <BoxInstances boxes={boxes} color={CONCRETE} />;
}

/** Everything that carries the building: plinth under a raised ground floor, pilotis under its balcony, and the entrance steps. Always visible. */
export default function Foundation() {
  const plan = useStore((s) => s.plan);
  const low = useMemo(() => sortedLevels(plan)[0], [plan]);
  const raised = low.elevation > 0.01;
  const rooms = useMemo(() => onLevel(plan, low.id).rooms, [plan, low.id]);
  const top = low.elevation - SLAB_T;
  const hall = hallwayOf(plan); // a flat entered from the building hallway stands its corridor on the plinth
  const rects = useMemo(() => [...buildingRects(rooms, PLINTH_INSET), ...(hall ? [hallwayPlinth(hall, PLINTH_INSET)] : [])], [rooms, hall]);
  const open = useMemo(() => rooms.filter(isOpenAir), [rooms]);
  const stairs = useMemo(() => entrySteps(plan), [plan]); // none for "Door only" and at the hallway door
  const style = useMemo<PlinthStyle>(() => {
    const walls = shellWalls(onLevel(plan, low.id).walls);
    const brick = walls.filter((w) => isBrickWall(sectionStyle(plan, w))).length; // the plinth matches the walls as seen from outside
    return brick > walls.length - brick ? "brick" : "plaster";
  }, [plan, low.id]);
  if (!raised) return null;
  return (
    <>
      {top > 0.05 && <Plinth top={top} rects={rects} style={style} stairs={stairs} />}
      {top > 0.05 && <Pilotis top={top} rects={open} />}
      {stairs.map((s) => (
        <Staircase key={s.openingId} spec={s} />
      ))}
    </>
  );
}
