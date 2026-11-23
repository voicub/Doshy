"use client";
import { useThree } from "@react-three/fiber";
import { useEffect, useRef, type RefObject } from "react";
import { Raycaster, type Group, type Intersection } from "three";
import { CATALOG } from "@/lib/catalog";
import { WALL_CUT_H, WALL_T } from "@/lib/geometry";
import { elevationOf, levelIdOf } from "@/lib/levels";
import { paintHit, paintItem, sampleHit, type PaintHit } from "@/lib/materials";
import { usePaint } from "@/lib/paintStore";
import { activeLevelId, useStore } from "@/lib/store";
import { minPartWidth, minProxySize } from "@/lib/pickMath";
import { rankItems } from "@/lib/pickRank";
import { aim, readPick, type Pick } from "./pick";
import { pickIndex } from "./pickIndex";
import { isCoarse } from "./pointerKind";
import { isOrtho } from "../camera";

const CLICK_PX = 4; // a press that moves less than this is a click, not an orbit
const TAP_PX = 12; // a finger always wobbles a little more than a mouse
const FLOOR_PICK_Y = 0.07;
const OVERLAP = 0.12; // pick boxes of walls overshoot their ends so corners are never a gap

/**
 * Pick boxes for the paint bucket: one per wall of the active level (its two faces are told apart by the box's +z / -z normal), one flat slab per room.
 * Furniture comes from the shared pick index of the Furniture view (lib/pickRank.ts).
 */
function SurfaceProxies({ group }: { group: RefObject<Group | null> }) {
  const plan = useStore((s) => s.plan);
  const level = useStore(activeLevelId);
  const lvY = elevationOf(plan, level);
  const rooms = [...plan.rooms].filter((r) => levelIdOf(plan, r) === level).sort((a, b) => b.w * b.h - a.w * a.h);
  return (
    <group ref={group}>
      {rooms.map((r, i) => (
        <mesh key={r.id} userData={{ type: "room", id: r.id } satisfies Pick} position={[r.x + r.w / 2, lvY + FLOOR_PICK_Y + i * 0.002, r.y + r.h / 2]} visible={false}>
          <boxGeometry args={[r.w, 0.01, r.h]} />
        </mesh>
      ))}
      {plan.walls
        .filter((w) => levelIdOf(plan, w) === level)
        .map((w) => {
          const len = Math.hypot(w.b.x - w.a.x, w.b.y - w.a.y);
          if (len < 1e-6) return null;
          const angle = Math.atan2(w.b.y - w.a.y, w.b.x - w.a.x);
          const t = w.thickness ?? WALL_T;
          return (
            <mesh key={w.id} userData={{ type: "wall", id: w.id } satisfies Pick} position={[(w.a.x + w.b.x) / 2, lvY + WALL_CUT_H / 2, (w.a.y + w.b.y) / 2]} rotation={[0, -angle, 0]} visible={false}>
              <boxGeometry args={[len + OVERLAP, WALL_CUT_H, t]} />
            </mesh>
          );
        })}
    </group>
  );
}

/**
 * FURNITURE view with the paint bucket: click furniture to recolour it, a floor to paint it, a wall to paint the side you click (Shift: both sides).
 * Alt-click picks the colour (and material) up. The camera still orbits and pans; a press that moves is not a click.
 */
export default function PaintPicker() {
  const gl = useThree((s) => s.gl);
  const get = useThree((s) => s.get);
  const surfaces = useRef<Group>(null);

  useEffect(() => {
    const el = gl.domElement;
    const caster = new Raycaster();
    const st = useStore.getState;
    let press: { x: number; y: number } | null = null;

    /** The nearest thing under the pointer: furniture, a wall face, or a floor. */
    const hitAt = (e: PointerEvent): { item: string } | { hit: PaintHit } | null => {
      aim(caster, get().camera, el, e.clientX, e.clientY);
      const cam = get().camera;
      const item = rankItems({ o: caster.ray.origin, d: caster.ray.direction }, pickIndex.entries, { minSize: isOrtho(cam) ? minProxySize(cam.zoom, isCoarse()) : 0, minWidth: isOrtho(cam) ? minPartWidth(cam.zoom, isCoarse()) : 0, skipLocked: false })[0];
      surfaces.current?.updateWorldMatrix(true, true);
      const raw: Intersection | undefined = surfaces.current ? caster.intersectObjects(surfaces.current.children, false)[0] : undefined;
      if (item?.type === "item" && (!raw || item.t <= raw.distance)) return { item: item.id };
      if (!raw) return null;
      const data = readPick(raw.object.userData);
      if (!data) return null;
      if (data.type === "room") return { hit: { type: "room", id: data.id } };
      return { hit: { type: "wall", id: data.id, face: (raw.face?.normal.z ?? 1) >= 0 ? "A" : "B" } };
    };

    const onDown = (e: PointerEvent) => {
      press = e.button === 0 && e.target === el ? { x: e.clientX, y: e.clientY } : null;
    };
    const onMove = (e: PointerEvent) => {
      if (e.target === el && !e.buttons) el.style.cursor = e.altKey ? "copy" : "crosshair";
    };
    const onUp = (e: PointerEvent) => {
      const p = press;
      press = null;
      if (!p || Math.hypot(e.clientX - p.x, e.clientY - p.y) >= (e.pointerType === "mouse" ? CLICK_PX : TAP_PX)) return;
      const target = hitAt(e);
      if (!target) return;
      const s = st();
      const paint = usePaint.getState();
      if ("item" in target) {
        const it = s.plan.items.find((i) => i.id === target.item);
        if (!it) return;
        if (e.altKey) {
          paint.setBrush({ color: it.color ?? null });
          paint.remember(it.color ?? null);
        } else if (CATALOG[it.kind]?.parts.some((part) => part.m)) {
          s.editPlan((plan) => paintItem(plan, it.id, paint.brush.color));
          paint.remember(paint.brush.color);
        }
        return;
      }
      if (e.altKey) {
        const picked = sampleHit(s.plan, target.hit);
        if (picked) {
          paint.setBrush(picked);
          paint.remember(picked.color);
        }
        return;
      }
      s.editPlan((plan) => paintHit(plan, target.hit, paint.brush, e.shiftKey));
      paint.remember(paint.brush.color);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !(e.target instanceof Element && e.target.matches("input,textarea,select"))) st().setTool("select");
    };

    el.addEventListener("pointerdown", onDown);
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("keydown", onKey);
    return () => {
      el.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("keydown", onKey);
      el.style.cursor = "";
    };
  }, [gl, get]);

  return <SurfaceProxies group={surfaces} />;
}
