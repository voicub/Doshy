// What the 3D preview of a welcome-home sequence shows: the home as it stands before anybody arrives (the sequence's lights off) and after each step. Pure: no store, no timers,
// nothing sent anywhere (lib/arrivalPreview.ts puts these on screen the way the history replay does, with every write to Home Assistant refused meanwhile).
import type { ArrivalStep } from "./arrival.ts";
import type { HAState } from "./ha.ts";

/** In the preview one wait never lasts longer than this (ms): a 60 second wait in the real sequence would only make the person watch an empty screen. */
export const PREVIEW_MAX_GAP_MS = 4000;

/** When each step happens in the preview (ms from the start). */
export function previewTimes(steps: readonly ArrivalStep[], maxGapMs = PREVIEW_MAX_GAP_MS): number[] {
  let t = 0;
  return steps.map((s) => (t += Math.min(s.delayMs, maxGapMs)));
}

/** Domains whose steps change what the 3D scene draws, by on / off. */
const SWITCHED = ["light", "switch", "fan", "input_boolean"];
const domainOf = (entity: string) => entity.slice(0, entity.indexOf("."));

/** The state a step leaves a device in, as the scene reads it; null for a device the preview cannot draw (a scene, a TV, a thermostat). */
function afterStep(st: HAState, step: ArrivalStep): HAState | null {
  const domain = domainOf(step.entity);
  if (SWITCHED.includes(domain)) {
    if (step.on === false) return { ...st, state: "off" };
    if (domain !== "light") return { ...st, state: "on" };
    const attributes = { ...st.attributes };
    if (step.brightness !== undefined) attributes.brightness = Math.min(255, Math.max(1, Math.round((step.brightness * 255) / 100)));
    if (step.rgb) attributes.rgb_color = step.rgb;
    else if (step.kelvin !== undefined) attributes.color_temp_kelvin = step.kelvin;
    return { ...st, state: "on", attributes };
  }
  if (domain === "cover" && step.position !== undefined) return { ...st, state: step.position > 0 ? "open" : "closed", attributes: { ...st.attributes, current_position: step.position } };
  return null;
}

/**
 * The entity map with every switchable device of the sequence off (nobody is home yet), then the first `done` steps applied in order. Devices Home Assistant does not
 * report stay missing. Anything the sequence does not touch is the same object as in `live`.
 */
export function previewStates(live: Readonly<Record<string, HAState>>, steps: readonly ArrivalStep[], done: number): Record<string, HAState> {
  const next: Record<string, HAState> = { ...live };
  for (const s of steps) {
    const st = live[s.entity];
    if (st && SWITCHED.includes(domainOf(s.entity)) && st.state !== "off") next[s.entity] = { ...st, state: "off" };
  }
  for (const s of steps.slice(0, Math.max(0, done))) {
    const st = next[s.entity];
    const after = st ? afterStep(st, s) : null;
    if (after) next[s.entity] = after;
  }
  return next;
}
