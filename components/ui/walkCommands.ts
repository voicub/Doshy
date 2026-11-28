import { walkHere } from "@/lib/walkStore";
import type { Plan } from "@/lib/types";
import type { Cmd } from "./paletteCommands";

/** Command palette: "Walk through the home" and one "Walk in <room>" per room (an alcove is part of its room). */
export function walkCommands(plan: Plan): Cmd[] {
  const home: Cmd = { id: "act:walk", group: "Actions", label: "Walk through the home", hay: "walk through the home walkthrough first person tour inside", meta: "First person", run: () => walkHere() };
  const rooms = plan.rooms.filter((r) => !r.parent).map((r): Cmd => ({ id: `walk:${r.id}`, group: "Rooms", label: `Walk in ${r.name}`, hay: `walk in ${r.name} walkthrough first person`, meta: "Walkthrough", run: () => walkHere(r.id) }));
  return [home, ...rooms];
}
