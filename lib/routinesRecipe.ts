// A suggestion as the automation recipe that makes it happen (lib/automations.ts). Whatever the person edited before saying yes (the time, the minutes) replaces the
// detected value; the server checks the recipe again from scratch. Pure.
import { MAX_SUN_OFFSET } from "./automationsDevice.ts";
import type { Recipe } from "./automations.ts";
import type { Suggestion } from "./routines.ts";

export type Edits = {
  /** `HH:MM`, for a suggestion at a clock time */
  time?: string;
  /** minutes after sunrise or sunset (negative: before), for a sun suggestion */
  offset?: number;
  /** minutes without movement, for a "left on" suggestion */
  minutes?: number;
  onlyHome: boolean;
};

export function recipeOf(s: Suggestion, edits: Edits): Recipe {
  if (s.kind === "idle") return { type: "light-off-no-motion", motion: s.motion, lights: [s.entity], minutes: edits.minutes ?? s.minutes };
  const { when } = s;
  if (when.kind === "clock") return { type: "device-at", entity: s.entity, action: s.action, time: edits.time ?? when.time, days: when.days, onlyHome: edits.onlyHome };
  const offset = Math.max(-MAX_SUN_OFFSET, Math.min(MAX_SUN_OFFSET, Math.round(edits.offset ?? when.offset)));
  return { type: "device-sun", entity: s.entity, action: s.action, sun: when.event, offset, days: when.days, onlyHome: edits.onlyHome };
}
