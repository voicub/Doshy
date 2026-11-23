"use client";
import { useFrame } from "@react-three/fiber";
import { keepAlive } from "@/lib/framePacer";
import { useEffect, useMemo, useRef, type RefObject } from "react";
import { AdditiveBlending, Color, MathUtils, Object3D, type Group, type InstancedMesh } from "three";
import { useStore } from "@/lib/store";
import type { Item } from "@/lib/types";
import { livePosition, modeOf, startDrive, stepDrive, stepLive, type Drive } from "@/lib/vacuumDrive";
import { buildWorld } from "@/lib/vacuumPath";
import { useReducedMotion } from "./motion";

const DEG = Math.PI / 180;
const TRAIL_N = 320; // stamps kept
const TRAIL_STEP = 0.1; // a stamp every this many metres driven
const TRAIL_FADE = 20; // seconds for a stamp to fade out
const TRAIL_GAIN = 0.22; // additive: tints wood and tile without washing out
const TRAIL_W = 0.3;
const TRAIL_TINT = new Color(0.35, 0.85, 1);
const FLOOR_TOP = 0.06; // top of the floor slab (RoomFloor's FLOOR_T): the robot rides on it instead of sinking in
const WIGGLE_HZ = 38;
const WIGGLE_AMP = 0.12; // rad
const FLAT = new Object3D();
const WORK = new Color();

/**
 * Drives the 3D robot of a vacuum item through the plan in live view: the simulated lap from lib/vacuumDrive.ts, or the position the vacuum reports.
 * Rendered next to the item (same level group); it moves the item's own root group from useFrame (`root`), so React never re-renders per frame, and draws
 * the fading cleaned trail. Outside live view, or with no state, the robot just stands where it was placed.
 */
export default function Vacuum({ item, root }: { item: Item; root: RefObject<Group | null> }) {
  const live = useStore((s) => s.view === "live");
  const st = useStore((s) => (item.entity ? s.states[item.entity] : undefined));
  const walls = useStore((s) => s.plan.walls);
  const openings = useStore((s) => s.plan.openings);
  const rooms = useStore((s) => s.plan.rooms);
  const items = useStore((s) => s.plan.items);
  const voids = useStore((s) => s.plan.voids);
  const levels = useStore((s) => s.plan.levels);
  const reduced = useReducedMotion();
  const active = live && !!st;
  const world = useMemo(() => (active ? buildWorld({ walls, openings, rooms, items, voids, levels }, item) : null), [active, walls, openings, rooms, items, voids, levels, item]);

  const drive = useRef<Drive | null>(null);
  const latest = useRef({ mode: modeOf(st?.state), pos: livePosition(st?.attributes, item.params), last: st?.last_changed });
  latest.current = { mode: modeOf(st?.state), pos: livePosition(st?.attributes, item.params), last: st?.last_changed };
  const restart = reduced ? `${st?.state}|${st?.last_changed}` : "";
  useEffect(() => void (drive.current = null), [world, reduced, restart]); // a new plan restarts the lap; reduced motion re-places the robot on every change of state

  const trail = useRef<InstancedMesh>(null);
  const stamps = useRef({ next: 0, born: new Float32Array(TRAIL_N).fill(-1e9), lastX: NaN, lastY: NaN, dirty: false });
  useEffect(() => {
    const m = trail.current;
    if (!m) return;
    FLAT.scale.setScalar(0);
    FLAT.updateMatrix();
    const black = new Color(0, 0, 0);
    for (let i = 0; i < TRAIL_N; i++) (m.setMatrixAt(i, FLAT.matrix), m.setColorAt(i, black));
    stamps.current.born.fill(-1e9);
  }, [world]);

  useFrame(({ clock }, rawDt) => {
    const g = root.current;
    if (!g) return;
    if (!world) {
      g.position.set(item.x, FLOOR_TOP, item.y);
      g.rotation.y = -item.rot * DEG;
      return;
    }
    const dt = Math.min(rawDt, 0.1);
    const t = clock.elapsedTime;
    const { mode, pos, last } = latest.current;
    const since = last ? Math.max(0, Date.now() - Date.parse(last)) || 0 : 0;
    const d = (drive.current ??= startDrive(world, mode, since, reduced));
    const { x: px, y: py, heading: ph } = d;
    if (pos) {
      stepLive(d, pos, dt);
      d.mode = mode;
    } else if (!reduced) stepDrive(d, world, mode, dt);
    g.position.set(d.x, FLOOR_TOP, d.y);
    g.rotation.y = Math.PI / 2 - d.heading + (d.wiggle > 0 && !reduced ? Math.sin(t * WIGGLE_HZ) * WIGGLE_AMP * d.wiggle : 0);
    if (d.x !== px || d.y !== py || d.heading !== ph || (d.wiggle > 0 && !reduced)) keepAlive();

    const m = trail.current;
    if (!m || reduced) return;
    const s = stamps.current;
    if (mode === "cleaning" && Math.hypot(d.x - px, d.y - py) > 0) {
      if (!(Math.hypot(d.x - s.lastX, d.y - s.lastY) < TRAIL_STEP)) {
        FLAT.position.set(d.x, FLOOR_TOP + 0.004, d.y);
        FLAT.rotation.set(-Math.PI / 2, Math.PI / 2 - d.heading, 0, "YXZ");
        FLAT.scale.set(TRAIL_W, TRAIL_STEP * 1.15, 1);
        FLAT.updateMatrix();
        m.setMatrixAt(s.next, FLAT.matrix);
        m.instanceMatrix.needsUpdate = true;
        s.born[s.next] = t;
        s.next = (s.next + 1) % TRAIL_N;
        s.lastX = d.x;
        s.lastY = d.y;
        s.dirty = true;
      }
    }
    if (!s.dirty) return;
    let alive = false;
    for (let i = 0; i < TRAIL_N; i++) {
      const a = MathUtils.clamp(1 - (t - s.born[i]) / TRAIL_FADE, 0, 1);
      if (a > 0) alive = true;
      m.setColorAt(i, WORK.copy(TRAIL_TINT).multiplyScalar(a * TRAIL_GAIN));
    }
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
    s.dirty = alive;
    if (alive) keepAlive();
  });

  if (!world || reduced) return null;
  return (
    <instancedMesh ref={trail} args={[undefined, undefined, TRAIL_N]} frustumCulled={false} renderOrder={1}>
      <planeGeometry args={[1, 1]} />
      <meshBasicMaterial transparent blending={AdditiveBlending} depthWrite={false} toneMapped={false} />
    </instancedMesh>
  );
}
