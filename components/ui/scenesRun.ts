"use client";
import { create } from "zustand";
import { errorMessage } from "@/lib/guards";
import type { HAState } from "@/lib/ha";
import { postScene } from "@/lib/sceneApi";
import { restoreSteps, snapshotFor } from "@/lib/sceneRestore";
import { sceneActions, type Scene, type SceneStep } from "@/lib/scenes";
import { useStore } from "@/lib/store";
import { patchState } from "./serviceActions";

export type RunPhase = "running" | "done" | "partial" | "failed";

/** The scene that ran last: what it said, and how things were just before, so "Restore previous" can put them back. */
export type SceneRun = { id: number; name: string; /** A typed command, not a scene: the toast words it as an action ("Done: ..."). */ command: boolean; phase: RunPhase; problems: string[]; before: Record<string, HAState>; restoring: boolean; restored: boolean };

export const useSceneRun = create<{ run: SceneRun | null }>(() => ({ run: null }));

const DONE_TOAST_MS = 12_000;
let seq = 0;
let hideTimer: ReturnType<typeof setTimeout> | undefined;

const patch = (p: Partial<SceneRun>) => useSceneRun.setState((s) => (s.run ? { run: { ...s.run, ...p } } : s));
export const dismissSceneRun = () => {
  clearTimeout(hideTimer);
  useSceneRun.setState({ run: null });
};

/** Show the new state right away; the next poll confirms it (or corrects it when a device did not obey). */
function optimistic(step: SceneStep) {
  const { entity } = step;
  const domain = entity.slice(0, entity.indexOf("."));
  if (domain === "light") {
    if (step.on === false) return patchState(entity, {}, "off");
    return patchState(entity, { ...(step.brightness !== undefined ? { brightness: Math.round((step.brightness / 100) * 255) } : {}), ...(step.kelvin !== undefined ? { color_temp_kelvin: step.kelvin } : {}), ...(step.rgb ? { rgb_color: step.rgb } : {}) }, "on");
  }
  if (domain === "cover" && step.position !== undefined) return patchState(entity, { current_position: step.position }, step.position === 0 ? "closed" : "open");
  if (domain === "climate" && step.temperature !== undefined) return patchState(entity, { temperature: step.temperature });
  if ((domain === "switch" || domain === "fan" || domain === "input_boolean" || domain === "media_player") && step.on !== undefined) return patchState(entity, {}, step.on ? (domain === "media_player" ? "idle" : "on") : "off");
}

const nameOf = (entity: string) => useStore.getState().states[entity]?.attributes.friendly_name ?? entity;

/** Send the steps as one list of calls and say how it went: every device that did not answer, plus `extra` notes. Never throws. */
async function send(steps: SceneStep[], id: number, extra: string[] = []): Promise<void> {
  const actions = sceneActions({ steps });
  try {
    const results = await postScene(actions);
    const failed = results.flatMap((r, i) => (r.ok ? [] : [`${nameOf(actions[i].entity_id)}: ${r.error ?? "no answer"}`]));
    const problems = [...failed, ...extra];
    patch({ phase: !problems.length ? "done" : failed.length === results.length ? "failed" : "partial", problems });
  } catch (e) {
    patch({ phase: "failed", problems: [errorMessage(e)] });
  }
  // the dashboard re-reads a moment later: lights answer at once, covers and thermostats take a while
  for (const ms of [700, 3000]) setTimeout(() => void useStore.getState().refreshStates(), ms);
  clearTimeout(hideTimer);
  if (useSceneRun.getState().run?.id === id && useSceneRun.getState().run?.phase === "done") hideTimer = setTimeout(() => useSceneRun.getState().run?.id === id && dismissSceneRun(), DONE_TOAST_MS);
}

/** Run steps now (a saved scene, the editor's "Try it", or a confirmed typed command). Devices Home Assistant does not know are left out and said so. */
export async function runSteps(name: string, steps: SceneStep[], command = false): Promise<void> {
  const states = useStore.getState().states;
  const live = steps.filter((s) => states[s.entity]);
  const id = ++seq;
  clearTimeout(hideTimer);
  if (!sceneActions({ steps: live }).length) {
    useSceneRun.setState({ run: { id, name, command, phase: "failed", problems: [steps.length ? "None of these devices are known to Home Assistant any more." : "There is nothing to do yet."], before: {}, restoring: false, restored: false } });
    return;
  }
  useSceneRun.setState({ run: { id, name, command, phase: "running", problems: [], before: snapshotFor(live, states), restoring: false, restored: false } });
  live.forEach(optimistic);
  const gone = steps.length - live.length;
  await send(live, id, gone ? [`${gone} device${gone === 1 ? " is" : "s are"} not in Home Assistant any more.`] : []);
}

export const runScene = (scene: Pick<Scene, "name" | "steps">): Promise<void> => runSteps(scene.name, scene.steps);

/** Put the devices the last scene touched back as they were just before it. */
export async function restorePrevious(): Promise<void> {
  const run = useSceneRun.getState().run;
  if (!run || run.restoring || run.restored) return;
  const steps = restoreSteps(run.before);
  if (!steps.length) return patch({ restored: true, phase: "done", problems: [] });
  patch({ restoring: true, phase: "running", problems: [] });
  steps.forEach(optimistic);
  await send(steps, run.id);
  patch({ restoring: false, restored: true });
}
