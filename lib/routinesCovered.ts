// "Does an automation that already exists do this?": the routine finder does not suggest what Home Assistant (or Doshy) already does to the same device at about the same time. Pure.
import type { SunEvent } from "./automationsDevice.ts";
import type { Verb } from "./deviceAction.ts";
import { circularGap } from "./routinesTime.ts";
import type { Covered } from "./routinesWire.ts";

/** Times closer than this are "the same time". */
export const SAME_TIME_MIN = 30;

/** The idea, as far as the check needs it: the time of day it would run at, and how far from sunrise or sunset that is on a typical day (null when the sun is unknown). */
export type Probe = { minute: number; sunOffset: (event: SunEvent) => number | null };

/** The service names an automation's action may call, as the verbs they do (`toggle` does both). */
export function verbsOfService(service: string): Verb[] {
  const name = service.slice(service.indexOf(".") + 1);
  switch (name) {
    case "turn_on": return ["turn_on"];
    case "turn_off": return ["turn_off"];
    case "toggle": return ["turn_on", "turn_off"];
    case "open_cover": return ["open"];
    case "close_cover": return ["close"];
    case "set_cover_position": return ["set_position"];
    case "set_temperature": return ["set_temperature"];
    default: return [];
  }
}

/** True when an existing automation already does `verb` to `entity` at about this time. Automations that start from a sensor or a button have no time to compare and do not count. */
export function isCovered(covers: readonly Covered[], entity: string, verb: Verb, probe: Probe): boolean {
  return covers.some((c) => {
    if (c.entity !== entity || !c.verbs.includes(verb)) return false;
    if (c.at.some((at) => circularGap(at, probe.minute) <= SAME_TIME_MIN)) return true;
    return c.sun.some((s) => {
      const offset = probe.sunOffset(s.event);
      return offset !== null && Math.abs(offset - s.offset) <= SAME_TIME_MIN;
    });
  });
}
