"use client";
import type { HAState } from "@/lib/ha";
import type { Plan } from "@/lib/types";
import { useAutomationUi } from "./automationUi";
import type { Cmd } from "./paletteCommands";
import { runScene } from "./scenesRun";
import { useRoutinesUi } from "./routinesUi";
import { useArrivalUi } from "./arrivalUi";

/** The palette entries of this feature: ask in plain words, open Scenes, run each scene, open the automations. `ask` narrows the palette to the command box. */
export function sceneCommands(plan: Plan, states: Record<string, HAState>, onScenes: () => void, ask: () => void): Cmd[] {
  const scenes = plan.scenes ?? [];
  const live = (s: (typeof scenes)[number]) => s.steps.filter((x) => states[x.entity]).length;
  return [
    { id: "act:ask", group: "Actions", label: "Ask Doshy...", hay: "Ask Doshy type a command say voice turn off the lights close curtains set temperature is the window open", meta: "Type a command", run: ask, stay: true },
    { id: "act:scenes", group: "Scenes", label: "Scenes...", hay: "Scenes movie night good morning away bedtime edit make new scene", meta: scenes.length ? `${scenes.length} saved` : "Make one", run: onScenes },
    ...scenes.map((s): Cmd => ({ id: `scene:${s.id}`, group: "Scenes", label: `Run scene: ${s.name}`, hay: `run scene ${s.name}`, meta: `${live(s)} devices`, run: () => void runScene(s) })),
    { id: "act:automations", group: "Actions", label: "Automations...", hay: "Automations make it do something notify me turn off when no motion close curtains sun scene at time Doshy automations", meta: "Made by Doshy", run: () => useAutomationUi.getState().show() },
    { id: "act:arrival", group: "Actions", label: "Welcome home...", hay: "welcome home arrival light my way choreography entrance garden lights", meta: "Arrival choreography", run: () => useArrivalUi.getState().open("arrival") },
    { id: "act:departure", group: "Actions", label: "Goodbye...", hay: "goodbye departure everybody leaves lights off curtains eco front door", meta: "Departure choreography", run: () => useArrivalUi.getState().open("departure") },
    { id: "act:routines", group: "Actions", label: "Find routines...", hay: "Find routines habits patterns suggest automations repeated same time every night weekday automatic ideas history", meta: "From your home's own history", run: () => useRoutinesUi.getState().show() },
  ];
}
