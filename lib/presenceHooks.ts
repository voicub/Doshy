import { useMemo, useRef } from "react";
import { useAreas } from "./haAreas";
import { peopleOf, rememberRooms, resolveAll, type Resolution } from "./presence.ts";
import { usePresence } from "./presenceStore";
import { useStore } from "./store";

/** The room each person was last seen in for sure, shared by every reader so the scene and the sheet agree when a sensor goes quiet. Resolution checks the room still exists in the plan. */
const lastRooms = new Map<string, string>();

/** Where everybody is right now (home or away, in which room). A new array only when something about somebody changed, so the 3D avatars do not re-render on every poll. */
export function usePresenceView(): Resolution[] {
  const states = useStore((s) => s.states);
  const rooms = useStore((s) => s.plan.rooms);
  const levels = useStore((s) => s.plan.levels);
  const areas = useAreas((s) => s.areas);
  const entityArea = useAreas((s) => s.entityArea);
  const people = usePresence((s) => s.people);
  const trackers = usePresence((s) => s.trackers);
  const shown = useRef<Resolution[]>([]);
  return useMemo(() => {
    const next = resolveAll(peopleOf(states, trackers), { people }, { layout: { rooms, levels }, states, areas, entityArea, last: lastRooms });
    rememberRooms(lastRooms, next);
    if (JSON.stringify(next) !== JSON.stringify(shown.current)) shown.current = next;
    return shown.current;
  }, [states, rooms, levels, areas, entityArea, people, trackers]);
}
