"use client";
import { useFrame } from "@react-three/fiber";
import { keepAlive } from "@/lib/framePacer";
import { useLayoutEffect, useRef, type RefObject } from "react";
import { MathUtils, type Object3D } from "three";
import { isolationOf, stayingItems, wallRoles, type WallRole, type Zone } from "@/lib/roomIsolate";
import { useStore } from "@/lib/store";
import { useReducedMotion } from "./motion";

/** The zone Room mode isolates, or undefined while it is off. Same object until the plan, the room or the open-plan switch changes. */
export const useIsoZone = (): Zone | undefined => useStore(isolationOf);

/** How this wall looks in Room mode (undefined outside it). */
export const useIsoWall = (wallId: string): WallRole | undefined =>
  useStore((s) => {
    const z = isolationOf(s);
    return z ? wallRoles(s.plan, z).get(wallId) : undefined;
  });

/** Is this piece of furniture another room's, so Room mode takes it away? */
export const useIsoItemGone = (itemId: string): boolean =>
  useStore((s) => {
    const z = isolationOf(s);
    return !!z && !stayingItems(s.plan, z).has(itemId);
  });

const FLAT = 0.001; // a sunk part is this fraction of its height
const GONE = 0.01; // below this it is not drawn at all
const RATE = 8; // damp rate: settles in about half a second

/**
 * Sinks a group onto its floor (scale y -> ~0, then hidden) while `gone`, and lets it rise again after. No transparency, no cloned materials, no new draw calls:
 * a part that is hidden is not drawn, and nothing is recompiled. Reduced motion: instant. Returns the live scale so a caller that changes the part's height can keep it continuous.
 * `keepDrawn`: stay in the scene graph (just flat) for a group that holds a light, since a light that is hidden changes the light count and recompiles every material.
 */
export function useIsoSink(ref: RefObject<Object3D | null>, gone: boolean, keepDrawn = false): RefObject<number> {
  const reduced = useReducedMotion();
  const k = useRef(gone ? FLAT : 1);
  const target = gone ? FLAT : 1;
  const apply = () => {
    const g = ref.current;
    if (!g) return;
    g.scale.y = k.current;
    if (!keepDrawn) g.visible = k.current > GONE;
  };
  useLayoutEffect(() => {
    if (reduced) k.current = target;
    apply();
    // `apply` only reads refs; re-run when the target or motion preference changes
  }, [target, reduced]);
  useFrame((_, dt) => {
    if (k.current === target && ref.current?.scale.y === k.current) return;
    k.current = Math.abs(k.current - target) < 0.002 ? target : (keepAlive(), MathUtils.damp(k.current, target, RATE, Math.min(dt, 0.1)));
    apply();
  });
  return k;
}
