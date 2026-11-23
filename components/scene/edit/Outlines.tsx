"use client";
import { useEffect, useMemo } from "react";
import { BoxGeometry, EdgesGeometry } from "three";
import { CATALOG } from "@/lib/catalog";
import { itemExtent } from "@/lib/editMath";
import { WALL_CUT_H, WALL_T } from "@/lib/geometry";
import { elevationOf, floorY, levelIdOf } from "@/lib/levels";
import type { Plan, Sel } from "@/lib/types";

const DEG = Math.PI / 180;
export const CYAN = "#5ad7ff";
export const WARN = "#ff7a45";

/** The oriented box a selection occupies: centre (plan x, z), base and top heights in world metres (surface included), the height `lv` of the surface it stands on (level floor, or the ground for an item outside), size along its own x / z, rotation in degrees (clockwise in plan). */
export type Box = { x: number; z: number; y0: number; y1: number; lv: number; w: number; d: number; rot: number };

export function boxOf(plan: Plan, s: Sel): Box | null {
  if (!s) return null;
  const lvOf = (e: { level?: string }) => elevationOf(plan, levelIdOf(plan, e));
  if (s.type === "item") {
    const it = plan.items.find((i) => i.id === s.id);
    const def = it && CATALOG[it.kind];
    if (!it || !def) return null;
    const lv = floorY(plan, it);
    const { y0, y1 } = itemExtent(def, it, def.solid ? WALL_CUT_H : undefined);
    return { x: it.x, z: it.y, y0: y0 + lv, y1: y1 + lv, lv, w: it.w, d: it.d, rot: it.rot };
  }
  if (s.type === "room") {
    const r = plan.rooms.find((x) => x.id === s.id);
    if (!r) return null;
    const lv = lvOf(r);
    return { x: r.x + r.w / 2, z: r.y + r.h / 2, y0: lv + 0.06, y1: lv + 0.1, lv, w: r.w, d: r.h, rot: 0 };
  }
  if (s.type === "opening") {
    const o = plan.openings.find((x) => x.id === s.id);
    const w = o && plan.walls.find((x) => x.id === o.wallId);
    if (!o || !w) return null;
    const lv = lvOf(w);
    const high = o.sill >= WALL_CUT_H;
    return {
      x: w.a.x + (w.b.x - w.a.x) * o.t,
      z: w.a.y + (w.b.y - w.a.y) * o.t,
      y0: lv + (high ? o.sill : 0),
      y1: lv + (high ? o.sill + o.height : Math.min(o.sill + o.height, WALL_CUT_H)),
      lv,
      w: o.width,
      d: (w.thickness ?? WALL_T) + 0.04,
      rot: (Math.atan2(w.b.y - w.a.y, w.b.x - w.a.x) * 180) / Math.PI,
    };
  }
  return null;
}

/** Hairline edges of an oriented box, drawn over everything (depth test off) so a piece stays outlined behind walls and other furniture. */
export function BoxEdges({ box, color, opacity = 1 }: { box: Box; color: string; opacity?: number }) {
  const geo = useMemo(() => {
    const b = new BoxGeometry(box.w, box.y1 - box.y0, box.d);
    const e = new EdgesGeometry(b);
    b.dispose();
    return e;
  }, [box.w, box.y1, box.y0, box.d]);
  useEffect(() => () => geo.dispose(), [geo]);
  return (
    <lineSegments geometry={geo} position={[box.x, (box.y0 + box.y1) / 2, box.z]} rotation={[0, -box.rot * DEG, 0]} renderOrder={30}>
      <lineBasicMaterial color={color} transparent opacity={opacity} depthTest={false} toneMapped={false} />
    </lineSegments>
  );
}

/** Translucent plate on the floor under a box: the footprint a selected piece occupies. */
export function Plate({ box, color }: { box: Box; color: string }) {
  return (
    <mesh position={[box.x, box.lv + 0.075, box.z]} rotation={[-Math.PI / 2, 0, -box.rot * DEG]} renderOrder={5}>
      <planeGeometry args={[box.w, box.d]} />
      <meshBasicMaterial color={color} transparent opacity={0.16} depthWrite={false} toneMapped={false} />
    </mesh>
  );
}
