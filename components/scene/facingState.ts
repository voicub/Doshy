"use client";
import { useFrame } from "@react-three/fiber";
import { useLayoutEffect, useMemo, useRef, type RefObject } from "react";
import { MathUtils, Vector3, type Camera, type Object3D } from "three";
import { create } from "zustand";
import { keepAlive } from "@/lib/framePacer";
import { DEFAULT_AZIMUTH } from "@/lib/roomIsolate";
import { useStore } from "@/lib/store";
import type { Item, Plan } from "@/lib/types";
import { wallCuts, wallOfItem, type WallCut } from "@/lib/wallFacing";
import { useWalking } from "@/lib/walkStore";
import { useLevel } from "./levelState";
import { useReducedMotion } from "./motion";

/**
 * Cut-away off = automatic: the walls that face the camera are cut, the ones behind stand (lib/wallFacing.ts has the rule). This file is the live side:
 * the azimuth the roles were last worked out for, and hooks that hand each wall (or wall piece, or the label layer) its own answer.
 */
const useFacing = create<{ azimuth: number }>(() => ({ azimuth: DEFAULT_AZIMUTH }));

/** The roles are recomputed when the camera has turned this far (degrees). Cheap, since what lies along each wall is cached per plan: only dot products are left. */
const STEP = 2;
const DEG = 180 / Math.PI;
const turn = (a: number, b: number) => Math.abs(((a - b + 540) % 360) - 180);

const dir = new Vector3();
/** The horizontal direction a camera sits in, as an azimuth in degrees round y from +z (the default isometric camera: 45). Orthographic or not, it only needs where the camera looks. */
export function cameraAzimuth(camera: Camera): number {
  camera.getWorldDirection(dir); // where the camera looks; it sits on the opposite side
  return Math.atan2(-dir.x, -dir.z) * DEG;
}

/**
 * Mounted once inside the Canvas: follows the camera's horizontal direction whoever moves it (mouse, touch, keys, presets, the Rig's animated goals) and publishes it
 * in steps of STEP degrees (also while Cut-away is on, so the azimuth is fresh the moment it is switched off). Walls re-render only when their own answer changes (see `useAutoCut`).
 */
export function FacingDriver() {
  useFrame(({ camera }) => {
    // no early return while Cut-away is on: one trig call per frame, and the hooks below hand back undefined then, so nothing re-renders
    const az = cameraAzimuth(camera);
    if (turn(az, useFacing.getState().azimuth) >= STEP) useFacing.setState({ azimuth: az });
  });
  return null;
}

/** The last answer, kept for the hysteresis: it is only reused for the same plan and storey, so a plan switch or an edit starts from scratch. */
let last: { plan: unknown; level: string; azimuth: number; cuts: ReadonlyMap<string, WallCut> } | null = null;

/** Cut / tall for every building wall of a storey at this azimuth. The same Map comes back while no wall changes, so it is safe to use as a dependency. */
function cutsAt(plan: Plan, level: string, azimuth: number): ReadonlyMap<string, WallCut> {
  const prev = last && last.plan === plan && last.level === level ? last : null;
  if (prev && prev.azimuth === azimuth) return prev.cuts; // every wall asks once per change: the first works it out
  const cuts = wallCuts(plan, level, azimuth, prev?.cuts);
  last = { plan, level, azimuth, cuts };
  return cuts;
}

/** Re-render when the parts of the plan the answer depends on change; the answer itself is worked out from the live plan (a piece being dragged elsewhere does not matter here). */
function usePlanShape(): void {
  useStore((s) => s.plan.walls);
  useStore((s) => s.plan.rooms);
  useStore((s) => s.plan.levels);
}

/** Every building wall's answer on the storey being worked on while Cut-away is off; undefined while it is on (all walls are low then), on a storey that is not the active one, or while somebody walks (every wall stands). */
export function useAutoCuts(levelId: string, active: boolean): ReadonlyMap<string, WallCut> | undefined {
  usePlanShape();
  const manual = useStore((s) => s.cutaway);
  const walking = useWalking();
  return useFacing((s) => (manual || walking || !active ? undefined : cutsAt(useStore.getState().plan, levelId, s.azimuth)));
}

/** This wall's answer (undefined: not automatic, a fence, or somebody is walking: the walls stand). A wall subscribes to its own answer, so turning the camera re-renders only the walls that flip. */
export function useAutoCut(wallId: string | undefined): WallCut | undefined {
  const { id, active } = useLevel();
  usePlanShape();
  const manual = useStore((s) => s.cutaway);
  const walking = useWalking();
  return useFacing((s) => (manual || walking || !active || wallId === undefined ? undefined : cutsAt(useStore.getState().plan, id, s.azimuth).get(wallId)));
}

/** Is the wall this piece hangs on cut right now? (Wall-mounted pieces go with their wall.) */
export function useWallPieceCut(item: Pick<Item, "x" | "y" | "d" | "level">, wallMounted: boolean): boolean {
  const walls = useStore((s) => s.plan.walls);
  const levels = useStore((s) => s.plan.levels);
  const wallId = useMemo(() => (wallMounted ? wallOfItem({ walls, levels }, item) : undefined), [wallMounted, walls, levels, item.x, item.y, item.d, item.level]);
  return useAutoCut(wallId) === "cut";
}

const SQUASH_RATE = 8; // damp rate, the same as Room mode's growing and shrinking walls (isoState.ts): settles in about half a second

/**
 * Eases a group's height (scale y, from the floor up) to `target` (1 = as built). No geometry is rebuilt and nothing is cloned: a pillar that is cut is the same mesh, lower.
 * Reduced motion: instant. Keeps the frame pacer alive only while it moves.
 */
export function useSquash(ref: RefObject<Object3D | null>, target: number): void {
  const reduced = useReducedMotion();
  const k = useRef(target);
  useLayoutEffect(() => {
    if (reduced) k.current = target;
    if (ref.current) ref.current.scale.y = k.current;
  }, [ref, target, reduced]);
  useFrame((_, dt) => {
    if (k.current === target) return;
    k.current = Math.abs(k.current - target) < 0.002 ? target : (keepAlive(), MathUtils.damp(k.current, target, SQUASH_RATE, Math.min(dt, 0.1)));
    if (ref.current) ref.current.scale.y = k.current;
  });
}

/**
 * The camera's azimuth (degrees) rounded to `step`, while Cut-away is off; null while it is on. For things that cannot follow the camera continuously and are rebuilt once per step
 * (the neighbours' trees: static instances), so they change a few times in a turn and not every frame.
 */
export function useAzimuthBucket(step: number): number | null {
  const manual = useStore((s) => s.cutaway);
  return useFacing((s) => (manual ? null : Math.round(s.azimuth / step) * step));
}
