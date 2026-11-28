// From one device's state changes to "what the person did, and when": a light turned on, curtains closed, a thermostat set to 19. Pure.
import { DOMAIN_VERBS, domainOf, type DeviceAction } from "./deviceAction.ts";
import { MIN_MS } from "./routinesTime.ts";
import type { ChangeEvent } from "./routinesWire.ts";

/** One thing that was done: when, which kind of thing (the same kind clusters together: `turn_off`, `set_position:40`, `set_temperature:19`) and exactly what. */
export type Occ = { t: number; key: string; action: DeviceAction };

const GONE = ["unavailable", "unknown"];
/** A change this soon after the last one is the same gesture (a thermostat tapped three times, a curtain stopped on the way): the first time and the last value count. */
const SAME_GESTURE_MS = 3 * MIN_MS;
/** A cover this close to open or closed counts as open or closed. */
const ENDS = 3;
const MOVED = 5;

const isOn = (domain: string, state: string): boolean => (domain === "media_player" ? state !== "off" && state !== "standby" : state === "on");

function toggles(entity: string, events: readonly ChangeEvent[]): Occ[] {
  const domain = domainOf(entity);
  const out: Occ[] = [];
  let was: boolean | null = null;
  for (const [t, state] of events) {
    if (GONE.includes(state)) {
      was = null; // coming back from "unavailable" is not somebody pressing a button
      continue;
    }
    const on = isOn(domain, state);
    if (was !== null && was !== on) out.push({ t, key: on ? "turn_on" : "turn_off", action: { verb: on ? "turn_on" : "turn_off" } });
    was = on;
  }
  return out;
}

/** Where a cover ended up, as the action that gets it there. */
function reached(state: string, position: number | undefined): DeviceAction | null {
  if (state === "closed" || (position !== undefined && position <= ENDS)) return { verb: "close" };
  if (position === undefined) return state === "open" ? { verb: "open" } : null;
  return position >= 100 - ENDS ? { verb: "open" } : { verb: "set_position", value: Math.round(position / 5) * 5 };
}

const keyOf = (a: DeviceAction): string => (a.verb === "set_position" ? `set_position:${Math.round((a.value ?? 0) / 10) * 10}` : a.verb);

function covers(events: readonly ChangeEvent[]): Occ[] {
  const out: Occ[] = [];
  const push = (t: number, action: DeviceAction | null) => {
    if (!action) return;
    const last = out[out.length - 1];
    if (last && t - last.t < SAME_GESTURE_MS) out[out.length - 1] = { t: last.t, key: keyOf(action), action };
    else out.push({ t, key: keyOf(action), action });
  };
  let rest: { state: string; n?: number } | null = null;
  let movingSince: number | null = null;
  for (const [t, state, n] of events) {
    if (GONE.includes(state)) {
      rest = null;
      movingSince = null;
      continue;
    }
    if (state === "opening" || state === "closing") {
      movingSince ??= t;
      continue;
    }
    const arrived = reached(state, n);
    if (movingSince !== null) {
      const before = rest ? reached(rest.state, rest.n) : null;
      const sameSpot = before && arrived && before.verb === arrived.verb && Math.abs((before.value ?? 0) - (arrived.value ?? 0)) < MOVED;
      if (!sameSpot) push(movingSince, arrived);
    } else if (rest && (rest.state !== state || (n !== undefined && rest.n !== undefined && Math.abs(n - rest.n) >= MOVED))) push(t, arrived);
    movingSince = null;
    rest = { state, n };
  }
  return out;
}

function setpoints(events: readonly ChangeEvent[]): Occ[] {
  const out: Occ[] = [];
  let was: number | undefined;
  for (const [t, state, n] of events) {
    if (GONE.includes(state) || n === undefined) continue;
    if (was !== undefined && Math.abs(n - was) >= 0.5) {
      const occ: Occ = { t, key: `set_temperature:${Math.round(n)}`, action: { verb: "set_temperature", value: n } };
      const last = out[out.length - 1];
      if (last && t - last.t < SAME_GESTURE_MS) out[out.length - 1] = { ...occ, t: last.t };
      else out.push(occ);
    }
    was = n;
  }
  return out;
}

/** Everything the person did to this device in these changes. Entities of other domains (locks, alarms, sensors) give nothing: Doshy never suggests those. */
export function occurrencesOf(entity: string, events: readonly ChangeEvent[]): Occ[] {
  const domain = domainOf(entity);
  if (!Object.hasOwn(DOMAIN_VERBS, domain)) return [];
  if (domain === "cover") return covers(events);
  if (domain === "climate") return setpoints(events);
  return toggles(entity, events);
}
