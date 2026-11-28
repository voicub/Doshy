"use client";
import { useMemo } from "react";
import type { CommandContext } from "@/lib/commandParse";
import { contacts, sceneDevices } from "@/lib/sceneDevices";
import { useStore } from "@/lib/store";

/** What the command box knows about the home: the plan's rooms, linked devices, window sensors and scenes, the states, and the room being looked at. */
export function useCommandContext(): CommandContext {
  const plan = useStore((s) => s.plan);
  const states = useStore((s) => s.states);
  const looking = useStore((s) => s.isolatedRoom ?? s.focusRoom);
  return useMemo(() => {
    const host = (id: string | null) => (id ? (plan.rooms.find((r) => r.id === id)?.parent ?? id) : null);
    return {
      rooms: plan.rooms.filter((r) => !r.parent).map((r) => ({ id: r.id, name: r.name, tempEntity: r.tempEntity })),
      devices: sceneDevices(plan, states),
      contacts: contacts(plan, states),
      scenes: plan.scenes ?? [],
      states,
      here: host(looking),
    };
  }, [plan, states, looking]);
}
