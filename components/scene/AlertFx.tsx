"use client";
import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo } from "react";
import { AdditiveBlending, BufferGeometry, DoubleSide, Float32BufferAttribute, MeshBasicMaterial, PlaneGeometry } from "three";
import type { Alert } from "@/lib/alerts";
import { useAlerts } from "@/lib/alertsStore";
import { keepAlive } from "@/lib/framePacer";
import { elevationOf, levelIdOf } from "@/lib/levels";
import { roomGroup } from "@/lib/planOps";
import { useKnobs } from "@/lib/quality";
import { useStore } from "@/lib/store";
import type { Plan } from "@/lib/types";
import { boxOf, type Box } from "./edit/Outlines";
import { useReducedMotion } from "./motion";

const RED = "#ff2d1f";
const LIFT = 0.095; // above the floor plate (0.06), light pools (0.075) and the live layers (0.088)
const EDGE_M = 0.14; // width of the outline round a room's floor
const BEAM_H = 1.2;
const PULSE_S = 1.1; // seconds per pulse
const FILL = { base: 0.08, swing: 0.22 };
const ACCENT = { base: 0.55, swing: 0.45 };
const STILL_ACCENT = 0.9;

/** Four thin strips along the inside of a w x d rectangle (flat, facing up): an outline that stays the same width whatever the room's size. */
function frameGeometry(w: number, d: number, t: number): BufferGeometry {
  const a = w / 2;
  const b = d / 2;
  const m = Math.min(t, a, b);
  const quad = (x0: number, z0: number, x1: number, z1: number) => [x0, 0, z0, x1, 0, z0, x1, 0, z1, x0, 0, z0, x1, 0, z1, x0, 0, z1];
  const g = new BufferGeometry();
  g.setAttribute("position", new Float32BufferAttribute([...quad(-a, -b, a, -b + m), ...quad(-a, b - m, a, b), ...quad(-a, -b + m, -a + m, b - m), ...quad(a - m, -b + m, a, b - m)], 3));
  return g;
}

type Rect = { x: number; z: number; w: number; d: number; y: number };

/** The floor rectangles (a room and its alcoves) of every room an alert is in, and the box of every device or door / window that carries one. */
function targets(plan: Plan, queue: readonly Alert[]): { rects: Rect[]; boxes: Box[] } {
  const rects: Rect[] = [];
  const boxes: Box[] = [];
  const seen = new Set<string>();
  for (const a of queue) {
    const room = a.roomId && !seen.has(a.roomId) ? plan.rooms.find((r) => r.id === a.roomId) : undefined;
    if (room) {
      seen.add(room.id);
      const y = elevationOf(plan, levelIdOf(plan, room)) + LIFT;
      for (const r of roomGroup(plan, room)) rects.push({ x: r.x + r.w / 2, z: r.y + r.h / 2, w: r.w, d: r.h, y });
    }
    const box = a.itemId ? boxOf(plan, { type: "item", id: a.itemId }) : a.openingId ? boxOf(plan, { type: "opening", id: a.openingId }) : null;
    if (box) boxes.push(box);
  }
  return { rects, boxes };
}

function Floor({ rect, animate, fill, accent }: { rect: Rect; animate: boolean; fill: MeshBasicMaterial; accent: MeshBasicMaterial }) {
  const frame = useMemo(() => frameGeometry(rect.w, rect.d, EDGE_M), [rect.w, rect.d]);
  const plate = useMemo(() => new PlaneGeometry(rect.w, rect.d).rotateX(-Math.PI / 2), [rect.w, rect.d]);
  useEffect(() => () => { frame.dispose(); plate.dispose(); }, [frame, plate]);
  return (
    <group position={[rect.x, rect.y, rect.z]}>
      {animate && <mesh geometry={plate} material={fill} renderOrder={6} raycast={() => null} />}
      <mesh geometry={frame} material={accent} renderOrder={7} raycast={() => null} />
    </group>
  );
}

function Device({ box, accent }: { box: Box; accent: MeshBasicMaterial }) {
  const r = Math.max(box.w, box.d, 0.3) / 2 + 0.12;
  return (
    <group position={[box.x, 0, box.z]}>
      <mesh position-y={box.lv + LIFT + 0.005} rotation-x={-Math.PI / 2} material={accent} renderOrder={8} raycast={() => null}>
        <ringGeometry args={[r * 0.85, r, 40]} />
      </mesh>
      <mesh position-y={box.y1 + BEAM_H / 2} material={accent} renderOrder={8} raycast={() => null}>
        <cylinderGeometry args={[0.02, 0.02, BEAM_H, 6]} />
      </mesh>
    </group>
  );
}

/** What is drawn while at least one alert waits: the floor of its room and a ring and beam at its device. Mounted only then, so acknowledging stops it at once. */
function Pulses({ queue }: { queue: readonly Alert[] }) {
  const plan = useStore((s) => s.plan);
  const reduced = useReducedMotion();
  const animate = useKnobs().ambient && !reduced; // Eco and Light, or reduced motion: a still outline, no frames asked for
  const { rects, boxes } = useMemo(() => targets(plan, queue), [plan, queue]);
  // one material for every floor plate, one for every outline, ring and beam: the pulse writes two numbers a frame
  const fill = useMemo(() => new MeshBasicMaterial({ color: RED, transparent: true, opacity: FILL.base, blending: AdditiveBlending, depthWrite: false, toneMapped: false, side: DoubleSide }), []);
  const accent = useMemo(() => new MeshBasicMaterial({ color: RED, transparent: true, opacity: STILL_ACCENT, depthWrite: false, toneMapped: false, side: DoubleSide }), []);
  useEffect(() => () => { fill.dispose(); accent.dispose(); }, [fill, accent]);
  useEffect(() => { if (!animate) accent.opacity = STILL_ACCENT; }, [animate, accent]);

  useFrame(({ clock }) => {
    if (!animate) return;
    const u = 0.5 + 0.5 * Math.sin((clock.elapsedTime * 2 * Math.PI) / PULSE_S);
    fill.opacity = FILL.base + FILL.swing * u;
    accent.opacity = ACCENT.base + ACCENT.swing * u;
    keepAlive(false); // glow only: no shadow pass
  });

  return (
    <>
      {rects.map((r, i) => <Floor key={i} rect={r} animate={animate} fill={fill} accent={accent} />)}
      {boxes.map((b, i) => <Device key={i} box={b} accent={accent} />)}
    </>
  );
}

/** Focus mode's picture of an alarm: the room's floor and the device pulse red until the alert is acknowledged or snoozed. Live view only. */
export default function AlertFx() {
  const queue = useAlerts((s) => s.queue);
  const on = useAlerts((s) => s.mode === "focus");
  const live = useStore((s) => s.view === "live");
  return on && live && queue.length > 0 ? <Pulses queue={queue} /> : null;
}
