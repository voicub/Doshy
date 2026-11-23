"use client";
import type { ServiceCall } from "@/lib/ha";
import { useStore } from "@/lib/store";
import { patchState, runService } from "./serviceActions";

/**
 * Send one WashData command (a `button.press`, or a `select.select_option`). `optimistic` maps entity ids to the state to show right away; when Home Assistant
 * refuses, every one of them goes back to what it was and the result is a plain sentence ("Could not pause it: ..."). Null when it went through.
 * Nothing is sent unless a tap in WashCard calls this.
 */
export async function washCall(call: ServiceCall, what: string, optimistic: Record<string, string> = {}): Promise<string | null> {
  const before = useStore.getState().states;
  const saved = Object.fromEntries(Object.keys(optimistic).flatMap((id) => (before[id] ? [[id, before[id]]] : [])));
  for (const [id, state] of Object.entries(optimistic)) patchState(id, {}, state);
  const err = await runService(call);
  if (!err) return null;
  useStore.setState((s) => ({ states: { ...s.states, ...saved } }));
  return `Could not ${what}: ${err}`;
}
