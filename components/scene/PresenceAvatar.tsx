"use client";
import { useFrame, useThree } from "@react-three/fiber";
import { memo, useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { Color, MathUtils, MeshBasicMaterial, MeshStandardMaterial, type Group } from "three";
import { keepAlive } from "@/lib/framePacer";
import { advance, startWalk, type Walk } from "@/lib/presenceWalk";
import { isolationOf, within } from "@/lib/roomIsolate";
import { useStore } from "@/lib/store";
import type { Pt } from "@/lib/types";
import { pointAt, type Grid } from "@/lib/vacuumPath";
import { Marker } from "./DeclutterLayer";
import { FIG_H, discGeometry, figureGeometry, spotMaterial } from "./presenceFigure";
import "./presence.css";

/** Top of the floor slab above the storey's elevation (RoomFloor's FLOOR_T): people stand on it. */
const FLOOR_TOP = 0.06;
const STEP_M = 0.55; // metres per step (bob rhythm)
const BOB = 0.035;
const SWAY = 0.03; // rad
const POP_S = 0.3; // seconds a new avatar takes to grow in
const DT_MAX = 0.1;

export type Placed = {
  entity: string;
  name: string;
  roomName: string;
  color: string;
  letter: string;
  roomId: string;
  level: string;
  /** Height of the storey's floor (m). */
  elevation: number;
  /** Where the avatar stands in its room (plan metres). */
  x: number;
  y: number;
};

type Props = {
  p: Placed;
  /** Balanced and up: a 3D figure. Otherwise a flat disc, static. */
  figure: boolean;
  /** A figure may walk between rooms (and grow in): not with reduced motion. */
  animate: boolean;
  /** The storey is shown. */
  shown: boolean;
  gridFor: (level: string) => Grid | null;
};

/**
 * One person in the scene. The group is moved from useFrame, never through React; `keepAlive` is called only while a walk or the grow-in runs, so a still
 * house idles at about zero cost. The little bob and sway of a standing figure ride on frames somebody else already asked for.
 */
function PresenceAvatar({ p, figure, animate, shown, gridFor }: Props) {
  const root = useRef<Group>(null);
  const body = useRef<Group>(null);
  const invalidate = useThree((s) => s.invalidate);
  const at = useRef<Pt>({ x: p.x, y: p.y });
  const walk = useRef<Walk | null>(null);
  const heading = useRef(0);
  const grow = useRef(1);
  const seen = useRef<{ room: string; level: string } | null>(null);
  const showing = useRef(shown);
  showing.current = shown;
  const phase = useMemo(() => (p.x * 7.3 + p.y * 3.1) % (Math.PI * 2), [p.x, p.y]);

  const material = useMemo(() => (figure ? new MeshStandardMaterial({ color: new Color(p.color), roughness: 0.65, metalness: 0, emissive: new Color(p.color), emissiveIntensity: 0.18 }) : new MeshBasicMaterial({ color: new Color(p.color) })), [figure, p.color]);
  useEffect(() => () => material.dispose(), [material]);

  const base = p.elevation + FLOOR_TOP;
  useLayoutEffect(() => {
    const was = seen.current;
    seen.current = { room: p.roomId, level: p.level };
    const grid = gridFor(p.level);
    // a walk to the new spot (also when another person's arrival nudged this spot: no jumping); too short, walled off or another storey: it appears there
    walk.current = was !== null && was.level === p.level && animate && figure && grid ? startWalk(grid, at.current, { x: p.x, y: p.y }) : null;
    if (!walk.current) {
      at.current = { x: p.x, y: p.y };
      if (was !== null && (was.room !== p.roomId || was.level !== p.level) && animate && figure) grow.current = 0;
    }
    root.current?.position.set(at.current.x, base, at.current.y);
    invalidate();
  }, [p.roomId, p.level, p.x, p.y, base, animate, figure, gridFor, invalidate]);

  useFrame(({ clock }, rawDt) => {
    const g = root.current;
    const b = body.current;
    if (!g || !b) return;
    const dt = Math.min(rawDt, DT_MAX);
    const zone = isolationOf(useStore.getState()); // Room mode: only the people inside the isolated room
    g.visible = showing.current && (!zone || (zone.level === p.level && within(zone.rects, at.current.x, at.current.y, 0.1)));

    let lift = 0;
    const w = walk.current;
    if (w) {
      keepAlive(false); // the only reason to keep drawing: somebody is on the move (a person casts no sun shadow, so the shadow pass is skipped)
      const next = advance(w, dt);
      const pos = pointAt(next.route, next.s);
      at.current = { x: pos.x, y: pos.y };
      heading.current = Math.atan2(pos.hx, pos.hy);
      g.position.set(pos.x, base, pos.y);
      lift = Math.abs(Math.sin((next.s / STEP_M) * Math.PI)) * BOB;
      walk.current = next.s >= next.route.len ? null : next;
    }
    if (grow.current < 1) {
      keepAlive(false);
      grow.current = Math.min(1, grow.current + dt / POP_S);
    }
    if (figure) {
      b.rotation.y = heading.current;
      b.scale.setScalar(MathUtils.smootherstep(grow.current, 0, 1) || 0.001);
      b.position.y = animate ? (w ? lift : Math.sin(clock.elapsedTime * 1.6 + phase) * 0.01) : 0;
      b.rotation.z = animate && !w ? Math.sin(clock.elapsedTime * 1.1 + phase) * SWAY : 0;
    }
  });

  return (
    <group ref={root}>
      <group ref={body}>
        {figure ? <mesh geometry={figureGeometry()} material={material} /> : <mesh geometry={discGeometry()} material={material} position-y={0.012} />}
      </group>
      {figure && <mesh geometry={discGeometry()} material={spotMaterial} position-y={0.004} />}
      <Marker id={`presence:${p.entity}`} kind="badge" position={[0, figure ? FIG_H + 0.1 : 0.3, 0]}>
        <div className="ppl-tag" style={{ ["--pc" as string]: p.color }} title={`${p.name}: ${p.roomName}`} aria-label={`${p.name}, in ${p.roomName}`}>
          {p.letter}
        </div>
      </Marker>
    </group>
  );
}

export default memo(PresenceAvatar);
