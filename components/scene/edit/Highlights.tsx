"use client";
import { useEffect, useMemo } from "react";
import { BufferGeometry, Float32BufferAttribute } from "three";
import { floorY, levelIdOf } from "@/lib/levels";
import { corners } from "@/lib/placement";
import { useStore } from "@/lib/store";
import { clsOf } from "./place";
import SceneHtml from "../SceneHtml";
import { BoxEdges, CYAN, Plate, WARN, boxOf, type Box } from "./Outlines";
import { useEditUi, type Clear } from "./editStore";
import { gizmoSizes } from "@/lib/gizmoPick";
import { useHandleZoom } from "./Gizmos";
import { isCoarse } from "./pointerKind";
import "./pick.css";

const DEG = Math.PI / 180;
const TAG_Y = 0.14;
const LINE_Y = 0.12;

const m2 = (v: number) => `${v.toFixed(2)} m`;

/** Where a point at (along, across) of the box lands in the plan: along = local +x, across = local +z (the front). */
const at = (b: Box, along: number, across: number): [number, number, number] => {
  const c = Math.cos(b.rot * DEG);
  const s = Math.sin(b.rot * DEG);
  return [b.x + along * c - across * s, b.lv + TAG_Y, b.z + along * s + across * c];
};

function Tag({ position, children, warn }: { position: [number, number, number]; children: string | null; warn?: boolean }) {
  return (
    <SceneHtml position={position}>{children === null ? null : <div className={`edit-tag${warn ? " warn" : ""}`}>{children}</div>}</SceneHtml>
  );
}

/** Dimension, rotation and elevation tags around the selected piece. */
function Dimensions({ box, elev }: { box: Box; elev: number }) {
  const blocked = useEditUi((s) => !!s.gesture?.blocked);
  const s = gizmoSizes(useHandleZoom(), isCoarse());
  const gap = Math.hypot(box.w, box.d) / 2 + s.ringGap + s.px(24);
  return (
    <>
      <Tag position={at(box, 0, box.d / 2 + 0.16)} warn={blocked}>{m2(box.w)}</Tag>
      <Tag position={at(box, box.w / 2 + 0.2, 0)} warn={blocked}>{m2(box.d)}</Tag>
      <Tag position={at(box, gap, 0)}>{`${Math.round(box.rot)}°`}</Tag>
      <Tag position={[box.x, box.y1 + s.arrowGap + s.arrowLen + s.px(20), box.z]}>{elev > 0 ? `+${m2(elev)}` : null}</Tag>
    </>
  );
}

const SIDES = [
  ["e", 1, 0],
  ["w", -1, 0],
  ["s", 0, 1],
  ["n", 0, -1],
] as const;

/** Free distance to the nearest wall on each side while a piece is dragged: a hairline from the item's edge to the wall and a cm tag. */
function Clearances({ box, c }: { box: Box; c: Clear }) {
  const f = { x: box.x, y: box.z, w: box.w, d: box.d, rot: box.rot };
  const ext = useMemo(() => {
    const p = corners(f);
    return { x0: Math.min(...p.map((q) => q.x)), x1: Math.max(...p.map((q) => q.x)), y0: Math.min(...p.map((q) => q.y)), y1: Math.max(...p.map((q) => q.y)) };
    // keyed by the box values: `f` is a fresh object every render
  }, [box.x, box.z, box.w, box.d, box.rot]);
  const rays = SIDES.map(([k, dx, dz]) => {
    const dist = c[k];
    const sx = dx > 0 ? ext.x1 : dx < 0 ? ext.x0 : box.x;
    const sz = dz > 0 ? ext.y1 : dz < 0 ? ext.y0 : box.z;
    return { k, dist, a: [sx, sz] as const, b: dist === null ? null : ([sx + dx * dist, sz + dz * dist] as const) };
  });
  const geo = useMemo(() => {
    const g = new BufferGeometry();
    const pts: number[] = [];
    for (const r of rays) if (r.b) pts.push(r.a[0], LINE_Y, r.a[1], r.b[0], LINE_Y, r.b[1]);
    g.setAttribute("position", new Float32BufferAttribute(pts, 3));
    return g;
    // `rays` is derived from exactly these values
  }, [c.n, c.e, c.s, c.w, ext.x0, ext.x1, ext.y0, ext.y1, box.x, box.z]);
  useEffect(() => () => geo.dispose(), [geo]);
  return (
    <>
      <lineSegments geometry={geo} position={[0, box.lv, 0]} renderOrder={30}>
        <lineBasicMaterial color={CYAN} transparent opacity={0.6} depthTest={false} toneMapped={false} />
      </lineSegments>
      {rays.map((r) => (
        <Tag key={r.k} position={r.b ? [(r.a[0] + r.b[0]) / 2, box.lv + TAG_Y, (r.a[1] + r.b[1]) / 2] : [r.a[0], box.lv + TAG_Y, r.a[1]]}>
          {r.dist === null ? null : `${Math.round(r.dist * 100)} cm`}
        </Tag>
      ))}
    </>
  );
}

/** A small ring on the floor under each ceiling fixture: its pick target (the fixture itself hangs out of reach of the cut-away view). Furniture mode marks the active level's fixtures only. */
function CeilingMarkers({ furniture }: { furniture: boolean }) {
  const plan = useStore((s) => s.plan);
  const active = useStore((s) => s.activeLevel);
  const here = levelIdOf(plan, { level: active });
  return (
    <>
      {plan.items.map((it) =>
        clsOf(it.kind, it.h) === "ceiling" && (!furniture || levelIdOf(plan, it) === here) ? (
          <mesh key={it.id} position={[it.x, floorY(plan, it) + 0.08, it.y]} rotation={[-Math.PI / 2, 0, 0]} renderOrder={6}>
            <ringGeometry args={[0.13, 0.16, 24]} />
            <meshBasicMaterial color={CYAN} transparent opacity={0.55} depthWrite={false} toneMapped={false} />
          </mesh>
        ) : null,
      )}
    </>
  );
}

/** Cyan hairline guides where a module snaps to its neighbours (flush side, stacked edge, ...) and a mono `SNAP 35 CM` tag. */
function SnapGuides() {
  const snap = useEditUi((s) => s.snap);
  const geo = useMemo(() => {
    const g = new BufferGeometry();
    const pts: number[] = [];
    if (snap) for (const q of snap.guides) pts.push(q.a[0], q.a[1] + snap.lv, q.a[2], q.b[0], q.b[1] + snap.lv, q.b[2]);
    g.setAttribute("position", new Float32BufferAttribute(pts, 3));
    return g;
  }, [snap]);
  useEffect(() => () => geo.dispose(), [geo]);
  if (!snap?.guides.length) return null;
  const q = snap.guides[0];
  return (
    <>
      <lineSegments geometry={geo} renderOrder={31}>
        <lineBasicMaterial color={CYAN} transparent opacity={0.9} depthTest={false} toneMapped={false} />
      </lineSegments>
      {snap.label && <Tag position={[q.b[0], q.b[1] + snap.lv + 0.12, q.b[2]]}>{snap.label}</Tag>}
    </>
  );
}
/** Outline of what the pointer is over and of the selection (red-orange while a drag is blocked), plus the selected piece's footprint plate, tags and clearances. */
export default function Highlights({ furniture }: { furniture: boolean }) {
  const plan = useStore((s) => s.plan);
  const sel = useStore((s) => s.sel);
  const hover = useEditUi((s) => s.hover);
  const gesture = useEditUi((s) => s.gesture);
  const clearance = useEditUi((s) => s.clearance);
  const selBox = useMemo(() => boxOf(plan, sel), [plan, sel]);
  const hoverBox = useMemo(() => (hover && !(sel && hover.type === sel.type && hover.id === sel.id) ? boxOf(plan, hover) : null), [plan, hover, sel]);
  const blocked = !!gesture?.blocked;
  const item = furniture && sel?.type === "item" ? plan.items.find((i) => i.id === sel.id) : undefined;
  return (
    <>
      <CeilingMarkers furniture={furniture} />
      {hoverBox && <BoxEdges box={hoverBox} color={CYAN} opacity={0.55} />}
      {selBox && <BoxEdges box={selBox} color={blocked ? WARN : CYAN} />}
      {selBox && <Plate box={selBox} color={blocked ? WARN : CYAN} />}
      {selBox && item && <Dimensions box={selBox} elev={item.elev ?? 0} />}
      {selBox && gesture?.mode === "move" && clearance && <Clearances box={selBox} c={clearance} />}
      {furniture && <SnapGuides />}
    </>
  );
}
