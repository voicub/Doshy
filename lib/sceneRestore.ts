// "Restore previous": what a device was doing before a scene touched it, as the steps that put it back. Pure.
import { domainOf, type HAState } from "./ha.ts";
import { stepOf, type SceneStep } from "./scenes.ts";

/** The state of every device a list of steps will touch, copied now (a scene or script cannot be undone, so those are left out). */
export function snapshotFor(steps: readonly SceneStep[], states: Record<string, HAState>): Record<string, HAState> {
  const out: Record<string, HAState> = {};
  for (const s of steps) {
    const st = states[s.entity];
    if (st && !["scene", "script"].includes(domainOf(s.entity))) out[s.entity] = st;
  }
  return out;
}

/** The step that brings one device back to what `before` says. Null when it was unavailable or has nothing a step can say. */
function backStep(before: HAState): SceneStep | null {
  const a = before.attributes;
  const entity = before.entity_id;
  if (before.state === "unavailable" || before.state === "unknown") return null;
  switch (domainOf(entity)) {
    case "light": {
      if (before.state !== "on") return stepOf({ entity, on: false });
      const brightness = typeof a.brightness === "number" ? Math.max(1, Math.round((a.brightness / 255) * 100)) : undefined;
      return stepOf({ entity, on: true, brightness, ...(a.color_temp_kelvin ? { kelvin: a.color_temp_kelvin } : a.rgb_color ? { rgb: a.rgb_color } : {}) });
    }
    case "cover": {
      if (typeof a.current_position === "number") return stepOf({ entity, position: a.current_position });
      return before.state === "closed" ? stepOf({ entity, position: 0 }) : before.state === "open" ? stepOf({ entity, position: 100 }) : null;
    }
    case "media_player":
      return before.state === "off" ? stepOf({ entity, on: false }) : stepOf({ entity, on: true, volume: typeof a.volume_level === "number" ? a.volume_level * 100 : undefined });
    case "climate":
      return typeof a.temperature === "number" ? stepOf({ entity, temperature: a.temperature }) : null;
    case "switch":
    case "fan":
    case "input_boolean":
      return stepOf({ entity, on: before.state === "on" });
    default:
      return null;
  }
}

/** The steps that undo a scene run, from the snapshot taken just before it. */
export const restoreSteps = (before: Record<string, HAState>): SceneStep[] => Object.values(before).flatMap((st) => backStep(st) ?? []);
