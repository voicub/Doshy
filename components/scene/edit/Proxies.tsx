"use client";
import { memo, useLayoutEffect, useMemo, type RefObject } from "react";
import type { Group } from "three";
import { WALL_CUT_H, WALL_T } from "@/lib/geometry";
import { elevationOf, levelIdOf } from "@/lib/levels";
import { useStore } from "@/lib/store";
import type { Opening, Room, Wall } from "@/lib/types";
import type { Pick } from "./pick";
import { entriesOf, pickIndex } from "./pickIndex";

const FLOOR_PICK_Y = 0.07; // just above the floor slab

const RoomProxy = memo(function RoomProxy({ room, rank, lv }: { room: Room; rank: number; lv: number }) {
  const data: Pick = { type: "room", id: room.id };
  return (
    <mesh userData={data} position={[room.x + room.w / 2, lv + FLOOR_PICK_Y + rank * 0.002, room.y + room.h / 2]} visible={false}>
      <boxGeometry args={[room.w, 0.01, room.h]} />
    </mesh>
  );
});

const OpeningProxy = memo(function OpeningProxy({ o, wall, lv }: { o: Opening; wall: Wall; lv: number }) {
  const len = Math.hypot(wall.b.x - wall.a.x, wall.b.y - wall.a.y);
  const top = o.sill + o.height;
  const y0 = o.sill >= WALL_CUT_H ? o.sill : 0;
  const y1 = o.sill >= WALL_CUT_H ? top : Math.min(top, WALL_CUT_H);
  const x = wall.a.x + (wall.b.x - wall.a.x) * o.t;
  const z = wall.a.y + (wall.b.y - wall.a.y) * o.t;
  const angle = Math.atan2(wall.b.y - wall.a.y, wall.b.x - wall.a.x);
  const data: Pick = { type: "opening", id: o.id };
  if (len < 1e-6) return null;
  return (
    <mesh userData={data} position={[x, lv + (y0 + y1) / 2, z]} rotation={[0, -angle, 0]} visible={false}>
      <boxGeometry args={[o.width, Math.max(0.1, y1 - y0), (wall.thickness ?? WALL_T) + 0.12]} />
    </mesh>
  );
});

/**
 * The pick targets of an editing view. Items are not meshes: their boxes live in `pickIndex` and are tested as plain maths (lib/pickRank.ts), so even a plan of
 * hundreds of pieces costs nothing to keep and only a changed piece is rebuilt. This group holds the rooms and openings (Home Assistant mode) that the controller raycasts.
 * Furniture mode picks the active level's items only; HA mode picks items, rooms and openings on every level.
 */
export default function Proxies({ group, all }: { group: RefObject<Group | null>; all: boolean }) {
  const plan = useStore((s) => s.plan);
  const active = useStore((s) => s.activeLevel);
  const entries = useMemo(() => entriesOf(plan, active, all), [plan, active, all]);
  useLayoutEffect(() => {
    pickIndex.entries = entries;
    return () => void (pickIndex.entries === entries && (pickIndex.entries = []));
  }, [entries]);
  const lvOf = (e: { level?: string }) => elevationOf(plan, levelIdOf(plan, e));
  const bySize = [...plan.rooms].sort((a, b) => b.w * b.h - a.w * a.h);
  return (
    <group ref={group}>
      {all && bySize.map((r, rank) => <RoomProxy key={r.id} room={r} rank={rank} lv={lvOf(r)} />)}
      {all &&
        plan.openings.map((o) => {
          const w = plan.walls.find((x) => x.id === o.wallId);
          return w ? <OpeningProxy key={o.id} o={o} wall={w} lv={lvOf(w)} /> : null;
        })}
    </group>
  );
}
