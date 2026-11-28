// From an alert (a water leak, smoke, gas or carbon monoxide) to a plain suggestion: where the supply to that spot comes from, the valve that stops it, the words to ask the
// owner in, and the Home Assistant call that closes (or reopens) it. Nothing here sends anything: the dialog asks, and only an explicit confirm makes the call, through the
// same validated service route as every other service (lib/haService.ts). Pure: the node test runner loads this file directly.
import type { AlertKind } from "./alerts.ts";
import { domainOf, type HAState, type ServiceCall } from "./ha.ts";
import { levelIdOf } from "./levels.ts";
import { roomAtLevel } from "./geometry.ts";
import { VALVE_LABEL, valveInfo, type Medium } from "./utilities.ts";
import { buildGraph, traceFrom, type Target, type Trace, type ValveHit } from "./utilitiesGraph.ts";
import type { Plan } from "./types.ts";

export type ValveState = "open" | "closed" | "unknown";

/** What an alert is a threat of, for tracing: a leak is water; gas, carbon monoxide and smoke are about the gas supply. Anything else has nothing to shut off. */
export function mediumOfAlert(kind: AlertKind): Medium | undefined {
  return kind === "leak" ? "water" : kind === "gas" || kind === "co" || kind === "smoke" ? "gas" : undefined;
}

/**
 * Whether a valve or shut-off device is open or closed. A valve entity says it; a switch is a shut-off device whose "on" is flow (that is how the Zigbee and Z-Wave water
 * shut-offs report). Anything else, or unavailable, is unknown: Doshy never guesses a valve closed.
 */
export function valveState(entity: string | undefined, states: Record<string, HAState>): ValveState {
  const st = entity ? states[entity] : undefined;
  if (!st) return "unknown";
  const domain = domainOf(st.entity_id);
  if (domain === "valve") return st.state === "open" ? "open" : st.state === "closed" ? "closed" : "unknown";
  if (domain === "switch") return st.state === "on" ? "open" : st.state === "off" ? "closed" : "unknown";
  return "unknown";
}

/** The ids of the valve items whose linked entity reads closed right now. */
export function closedValves(plan: Pick<Plan, "items">, states: Record<string, HAState>): Set<string> {
  const out = new Set<string>();
  for (const i of plan.items) if (valveInfo(i.kind)?.role !== undefined && i.entity && valveState(i.entity, states) === "closed") out.add(i.id);
  return out;
}

/** The service call that closes or opens a linked valve or shut-off device; null for anything Doshy does not control (no entity, a sensor, a cover). */
export function valveCall(entity: string | undefined, action: "close" | "open"): ServiceCall | null {
  if (!entity) return null;
  const domain = domainOf(entity);
  if (domain === "valve") return { domain, service: action === "close" ? "close_valve" : "open_valve", entity_id: entity };
  if (domain === "switch") return { domain, service: action === "close" ? "turn_off" : "turn_on", entity_id: entity };
  return null;
}

export type Suggestion = {
  medium: Medium;
  trace: Trace;
  /** The valves to close, closest to the problem first: one valve that stops it, or (a loop fed from several sides) every main valve. Empty when the supply is already cut. */
  close: ValveHit[];
  /** Other valves that would also stop it (the main valve when the closest one is a smaller valve). */
  alternatives: ValveHit[];
  /** The supply to this spot is already shut: the valves to open again. */
  reopen: ValveHit[];
  /** The room the problem is in, when it is known. */
  area?: string;
  /** Plain sentences for the dialog. */
  headline: string;
  question: string;
  effect: string;
};

export type ShutoffTarget = {
  medium: Medium;
  /** The alert kind, for the wording (smoke and carbon monoxide are said differently from a gas leak). */
  alert?: AlertKind;
  /** The sensor on the plan, or the entity that is linked to a piece of furniture on it. */
  itemId?: string;
  entity?: string;
  /** Used when the sensor itself is not on the plan: the room the problem is in. */
  roomId?: string;
};
/** An external flow suggestion names a placed sensor or a room, never an arbitrary valve to operate. */
export function shutoffTarget(plan: Plan, states: Record<string, HAState>, sensorOrRoom: string): ShutoffTarget | null {
  const item = plan.items.find((i) => i.id === sensorOrRoom || i.entity === sensorOrRoom);
  const room = plan.rooms.find((r) => r.id === sensorOrRoom) ?? plan.rooms.find((r) => r.name.toLowerCase() === sensorOrRoom.toLowerCase());
  if (!item && !room) return null;
  const cls = item?.entity ? states[item.entity]?.attributes.device_class : undefined;
  const alert = cls === "smoke" ? "smoke" : cls === "gas" ? "gas" : cls === "carbon_monoxide" ? "co" : "leak";
  return { medium: mediumOfAlert(alert) ?? "water", alert, ...(item ? { itemId: item.id } : { roomId: room?.id }) };
}

const WORDS: Record<Medium, { effect: string; zone: string }> = {
  water: { effect: "Taps and appliances that use water will stop until you open it again.", zone: "Water to that part of the home will stop until you open it again." },
  gas: { effect: "Gas appliances such as the boiler, hob and fire will stop until you open it again, and some may need restarting.", zone: "Gas to that part of the home will stop until you open it again, and some appliances may need restarting." },
};

function headlineOf(medium: Medium, alert: AlertKind | undefined, where: string): string {
  if (medium === "water") return `Water may be coming through ${where ? `the ${where} supply` : "a pipe near this sensor"}.`;
  if (alert === "smoke") return `Smoke was detected${where ? ` in the ${where}` : ""}. If gas could be feeding a fire, you can shut it off.`;
  if (alert === "co") return `Carbon monoxide was detected${where ? ` in the ${where}` : ""}. A gas appliance may be faulty: you can shut the gas off.`;
  return `Gas may be coming from a pipe${where ? ` near the ${where}` : " near this sensor"}.`;
}

/** Where the problem is: the sensor item (its level and spot), or the centre of the room. */
function targetOf(plan: Plan, t: ShutoffTarget): { at: Target; room?: string } | null {
  const item = plan.items.find((i) => i.id === t.itemId) ?? (t.entity ? plan.items.find((i) => i.entity === t.entity) : undefined);
  if (item) {
    const level = levelIdOf(plan, item);
    const room = roomAtLevel(plan, level, item.x, item.y);
    const host = room && (plan.rooms.find((r) => r.id === room.parent) ?? room);
    return { at: { x: item.x, y: item.y, level, ...(host ? { room: { x: host.x, y: host.y, w: host.w, h: host.h } } : {}) }, room: host?.name };
  }
  const room = plan.rooms.find((r) => r.id === t.roomId);
  if (!room) return null;
  return { at: { x: room.x + room.w / 2, y: room.y + room.h / 2, level: levelIdOf(plan, room), room: { x: room.x, y: room.y, w: room.w, h: room.h } }, room: room.name };
}

/** The first valve that Doshy can close (it has a linked valve or switch), else the first of all: a valve nobody linked is closed by hand. */
const preferControlled = (list: readonly ValveHit[]): ValveHit[] => {
  const controlled = list.find((v) => valveCall(v.entity, "close"));
  return controlled ? [controlled] : list.slice(0, 1);
};

/**
 * What to tell the owner about a leak or gas alarm: null when there is nothing to offer (no pipes of that kind are drawn, or the sensor is nowhere near one and not in a room).
 * `closed` is worked out from the states: valves that already read closed block the supply, which is how "it is already shut" is told apart from "no valve found".
 */
export function suggestShutoff(plan: Plan, states: Record<string, HAState>, target: ShutoffTarget): Suggestion | null {
  const place = targetOf(plan, target);
  if (!place || !plan.utilities?.length) return null;
  const trace = traceFrom(buildGraph(plan, target.medium), place.at, closedValves(plan, states));
  if (!trace.found) return null;
  const close = trace.cutters.length ? preferControlled(trace.cutters) : trace.closeAll;
  const alternatives = trace.cutters.filter((v) => !close.some((c) => c.itemId === v.itemId));
  const reopen = trace.connected && !trace.supplied ? trace.blockedBy.filter((v) => valveCall(v.entity, "open")) : [];
  const first = close[0];
  const label = first ? (VALVE_LABEL[first.kind] ?? "valve") : "";
  const question = close.length > 1 ? `Close these ${close.length} valves?` : first ? `Close the ${label}?` : "";
  const zone = first?.role === "zone" || first?.role === "valve";
  return {
    medium: target.medium, trace, close, alternatives, reopen,
    ...(place.room ? { area: place.room } : {}),
    headline: headlineOf(target.medium, target.alert, place.room?.toLowerCase() ?? ""),
    question,
    effect: WORDS[target.medium][zone && close.length === 1 ? "zone" : "effect"],
  };
}
