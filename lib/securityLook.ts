import { roomAtLevel } from "./geometry.ts";
import type { HAState } from "./ha.ts";
import { levelIdOf } from "./levels.ts";
import type { Item, Plan } from "./types.ts";

/** How a security device's glow part looks for its entity's state: colour, brightness 0..1 and pulse rate (Hz, 0 = steady). */
export type Look = { level: number; rgb: [number, number, number]; pulse: number };

const RED: Look["rgb"] = [255, 59, 48];
const GREEN: Look["rgb"] = [80, 220, 120];
const AMBER: Look["rgb"] = [255, 170, 60];
const CYAN: Look["rgb"] = [90, 215, 255];
const OFF: Look = { level: 0, rgb: RED, pulse: 0 };
const ARMED = /^armed_/;

const isCamera = (kind: string) => /^sec_(cam|doorbell)/.test(kind);

/** The glow a camera / doorbell / alarm panel / keypad shows for `st` (undefined = not linked or not reported: no glow). */
export function securityLook(kind: string, st: HAState | undefined): Look | undefined {
  if (!st) return undefined;
  const s = st.state;
  if (s === "unavailable" || s === "unknown") return OFF;
  if (isCamera(kind)) {
    const doorbell = /doorbell/.test(kind);
    if (s === "recording" || s === "streaming") return { level: 1, rgb: RED, pulse: 0.6 };
    return doorbell ? { level: 0.7, rgb: CYAN, pulse: 0 } : { level: 0.35, rgb: RED, pulse: 0 }; // idle: a dim standby dot
  }
  if (/^sec_(alarm|keypad)/.test(kind)) {
    if (s === "triggered") return { level: 1, rgb: RED, pulse: 4 };
    if (s === "arming" || s === "pending") return { level: 1, rgb: AMBER, pulse: 1.5 };
    if (ARMED.test(s)) return { level: 1, rgb: RED, pulse: 0 };
    if (s === "disarmed" || s === "on") return { level: 0.8, rgb: GREEN, pulse: 0 };
    return OFF;
  }
  return undefined;
}

/** Which Home Assistant domains a security item can be linked to (the picker lists only these); undefined = not a security kind. */
export function securityDomains(kind: string): string[] | undefined {
  if (isCamera(kind)) return ["camera"];
  if (/^sec_(alarm|keypad)/.test(kind)) return ["alarm_control_panel", "binary_sensor"];
  return undefined;
}

const MOTION_CLASSES = ["motion", "occupancy", "presence"];
const NEAR = 5; // m: a camera outside any room looks at motion sensors this close

/**
 * Motion that was seen where a camera looks: the motion / presence sensors linked in the camera's room (or within a few metres when it is outdoors).
 * `now` = one of them is on; `at` = when the most recent of them last changed (the end of the last motion when none is on). Undefined when the room has no such sensor.
 */
export function lastMotion(plan: Plan, states: Record<string, HAState>, cam: Item): { now: boolean; at?: string } | undefined {
  const level = levelIdOf(plan, cam);
  const room = roomAtLevel(plan, level, cam.x, cam.y);
  const sensors = plan.items
    .filter((i) => i.entity?.startsWith("binary_sensor.") && levelIdOf(plan, i) === level && (room ? roomAtLevel(plan, level, i.x, i.y)?.id === room.id : Math.hypot(i.x - cam.x, i.y - cam.y) <= NEAR))
    .flatMap((i) => (i.entity ? [states[i.entity]] : []))
    .filter((s): s is HAState => !!s && MOTION_CLASSES.includes(s.attributes.device_class ?? ""));
  if (!sensors.length) return undefined;
  const at = sensors.map((s) => s.last_changed).filter((t): t is string => !!t).sort().at(-1);
  return { now: sensors.some((s) => s.state === "on"), at };
}
