"use client";
import { useMemo } from "react";
import { elevationOf, levelIdOf } from "@/lib/levels";
import { colorOf, letterOf, prefsOf, type PersonPrefs, type Resolution } from "@/lib/presence";
import { usePresenceView } from "@/lib/presenceHooks";
import { usePresence } from "@/lib/presenceStore";
import { spotsIn } from "@/lib/presenceWalk";
import { TIER_ORDER, useQuality } from "@/lib/quality";
import { useStore } from "@/lib/store";
import type { Plan } from "@/lib/types";
import { buildGrid, type Grid } from "@/lib/vacuumPath";
import { useLevelVisibility } from "./levelState";
import { useReducedMotion } from "./motion";
import PresenceAvatar, { type Placed } from "./PresenceAvatar";

type Located = Resolution & { roomId: string; roomName: string };
const isDrawn = (r: Resolution): r is Located => r.enabled && r.home && r.roomId !== undefined && r.roomName !== undefined;

/** Everyone who is home, enabled and has a room, each on a free spot of that room's floor (people in one room keep apart). */
function place(view: readonly Resolution[], prefs: Record<string, PersonPrefs>, plan: Plan, gridFor: (level: string) => Grid | null): Placed[] {
  const byRoom = new Map<string, Located[]>();
  for (const r of view.filter(isDrawn)) byRoom.set(r.roomId, [...(byRoom.get(r.roomId) ?? []), r]);
  const out: Placed[] = [];
  for (const [roomId, people] of byRoom) {
    const room = plan.rooms.find((r) => r.id === roomId);
    if (!room) continue;
    const level = levelIdOf(plan, room);
    const grid = gridFor(level);
    const spots = grid ? spotsIn(grid, room, people.map((r) => r.entity)) : null;
    for (const r of people) {
      const pf = prefsOf({ people: prefs }, r.entity);
      const at = spots?.get(r.entity) ?? { x: room.x + room.w / 2, y: room.y + room.h / 2 };
      out.push({ entity: r.entity, name: r.name, roomName: r.roomName, color: colorOf(r.entity, pf), letter: letterOf(r.name, pf), roomId, level, elevation: elevationOf(plan, level), x: at.x, y: at.y });
    }
  }
  return out;
}

const FIGURE_FROM = TIER_ORDER.indexOf("medium");

function Avatars() {
  const view = usePresenceView();
  const prefs = usePresence((s) => s.people);
  const walls = useStore((s) => s.plan.walls);
  const openings = useStore((s) => s.plan.openings);
  const rooms = useStore((s) => s.plan.rooms);
  const items = useStore((s) => s.plan.items);
  const voids = useStore((s) => s.plan.voids);
  const levels = useStore((s) => s.plan.levels);
  const figure = useQuality((s) => TIER_ORDER.indexOf(s.tier) >= FIGURE_FROM); // Balanced and up: a 3D figure; Light and Eco: a flat disc
  const calm = useReducedMotion();
  const { visible } = useLevelVisibility();

  const plan = useMemo<Plan>(() => ({ walls, openings, rooms, items, voids, levels }), [walls, openings, rooms, items, voids, levels]);
  // one floor grid per storey, built the first time somebody needs it and again only when the building changes
  const gridFor = useMemo(() => {
    const cache = new Map<string, Grid | null>();
    return (level: string): Grid | null => {
      if (!cache.has(level)) cache.set(level, buildGrid(plan, level));
      return cache.get(level) ?? null;
    };
  }, [plan]);
  const placed = useMemo(() => place(view, prefs, plan, gridFor), [view, prefs, plan, gridFor]);

  return (
    <>
      {placed.map((p) => (
        <PresenceAvatar key={p.entity} p={p} figure={figure} animate={figure && !calm} shown={visible[p.level] !== false} gridFor={gridFor} />
      ))}
    </>
  );
}

/** The people who are home, drawn in the room they are in (Live view; see docs/presence.md). Off with the switch in Display: then nothing here runs. */
export default function PresenceAvatars() {
  const on = usePresence((s) => s.show);
  return on ? <Avatars /> : null;
}
