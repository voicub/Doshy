// Pure: which things in the home need attention right now, worked out from the plan's linked entities and the Home Assistant states. Nothing is remembered here:
// a problem that clears simply stops being listed. Acknowledging, snoozing and the camera are in lib/alertsQueue.ts / lib/alertsStore.ts. The node test runner loads this file directly.
import { domainOf, type HAState } from "./ha.ts";
import { isRecord } from "./guards.ts";
import { roomAtLevel } from "./geometry.ts";
import { levelIdOf } from "./levels.ts";
import { openingRooms } from "./openings.ts";
import type { Opening, Plan } from "./types.ts";
import { stormWarning, type PressureReading, type Tendency } from "./pressure.ts";

export type AlertKind = "leak" | "smoke" | "gas" | "co" | "door_open" | "window_open" | "intrusion" | "problem" | "anomaly" | "weather";
export type Severity = "critical" | "warning" | "info";

export type Alert = {
  /** Stable while the condition lasts: `<kind>:<entity>`. */
  id: string;
  kind: AlertKind;
  severity: Severity;
  source?: "anomaly" | "weather";
  entity: string;
  /** The entity's friendly name (its id when it has none). */
  name: string;
  /** The (parent) room it happens in; absent for something that is linked to nothing on a floor (a house alarm panel). */
  roomId?: string;
  roomName?: string;
  /** The furniture item or the door / window that carries the entity: what to pulse in the 3D view. */
  itemId?: string;
  openingId?: string;
  /** When the entity last changed (ms since 1970); `now` when Home Assistant did not say. */
  since: number;
  /** Short headline ("Water leak") and a full plain-English sentence. */
  title: string;
  message: string;
};

export type AlertConfig = { openMinutes: number };

export const ALERT_MODES = ["focus", "banner", "off"] as const;
export type AlertMode = (typeof ALERT_MODES)[number];
export const ALERT_MODE_LABEL: Record<AlertMode, string> = { focus: "Focus the camera", banner: "Banner only", off: "Off" };
export type AlertSettings = { mode: AlertMode; sound: boolean; openMinutes: number };
export const ALERT_DEFAULTS: AlertSettings = { mode: "focus", sound: false, openMinutes: 15 };
export const OPEN_MINUTES_RANGE = { min: 1, max: 240 } as const;
export const SNOOZE_MS = 10 * 60_000;

const clampMinutes = (n: number): number => Math.min(OPEN_MINUTES_RANGE.max, Math.max(OPEN_MINUTES_RANGE.min, Math.round(n)));

/** Stored settings, field by field: a missing or wrong-typed value falls back to its default, a number is kept inside its range. */
export function cleanAlertSettings(raw: unknown): AlertSettings {
  const r = isRecord(raw) ? raw : {};
  const mode = ALERT_MODES.find((m) => m === r.mode) ?? ALERT_DEFAULTS.mode;
  const minutes = typeof r.openMinutes === "number" && Number.isFinite(r.openMinutes) ? clampMinutes(r.openMinutes) : ALERT_DEFAULTS.openMinutes;
  return { mode, sound: typeof r.sound === "boolean" ? r.sound : ALERT_DEFAULTS.sound, openMinutes: minutes };
}

// ---- where an entity sits in the plan ---------------------------------------------------------------------------------------------------

export type Link = { roomId?: string; roomName?: string; itemId?: string; openingId?: string; openingType?: Opening["type"] };

/** Every entity the plan links, once, with the device that carries it and the room it is in. Furniture wins over a door / window, which wins over a Room field. */
export function linksOf(plan: Plan): Map<string, Link> {
  const out = new Map<string, Link>();
  const roomOf = (id: string): Pick<Link, "roomId" | "roomName"> => {
    const r = plan.rooms.find((x) => x.id === id);
    const host = plan.rooms.find((x) => x.id === r?.parent) ?? r;
    return host ? { roomId: host.id, roomName: host.name } : {};
  };
  for (const i of plan.items) {
    if (!i.entity || out.has(i.entity)) continue;
    const r = roomAtLevel(plan, levelIdOf(plan, i), i.x, i.y);
    out.set(i.entity, { ...(r ? roomOf(r.id) : {}), itemId: i.id });
  }
  for (const o of plan.openings) {
    if (!o.entity || out.has(o.entity)) continue;
    const r = openingRooms(plan, o).rooms[0];
    out.set(o.entity, { ...(r ? roomOf(r.id) : {}), openingId: o.id, openingType: o.type });
  }
  for (const r of plan.rooms) {
    for (const e of r.presenceEntities ?? []) if (!out.has(e)) out.set(e, roomOf(r.id));
  }
  return out;
}

// ---- what counts as a problem -----------------------------------------------------------------------------------------------------------

type Rule = { kind: AlertKind; severity: Severity; title: string; text: string };

const SAFETY: Record<string, Rule> = {
  moisture: { kind: "leak", severity: "critical", title: "Water leak", text: "water detected" },
  smoke: { kind: "smoke", severity: "critical", title: "Smoke", text: "smoke detected" },
  gas: { kind: "gas", severity: "critical", title: "Gas", text: "gas detected" },
  carbon_monoxide: { kind: "co", severity: "critical", title: "Carbon monoxide", text: "carbon monoxide detected" },
};
const PROBLEM: Record<string, Rule> = {
  problem: { kind: "problem", severity: "warning", title: "Problem", text: "reports a problem" },
  safety: { kind: "problem", severity: "warning", title: "Safety", text: "reports it is unsafe" },
  tamper: { kind: "problem", severity: "warning", title: "Tampered", text: "was tampered with" },
};
const OPEN_KIND: Record<string, "door_open" | "window_open"> = { door: "door_open", garage_door: "door_open", window: "window_open" };
/** Covers that are doors (a garage door, a gate). Blinds and curtains are open all day and never alert. */
const DOOR_COVERS: readonly string[] = ["garage", "door", "gate"];
/** Sensors that mean "somebody is here": an intruder when the alarm is armed for an empty house. */
const PRESENCE_CLASSES: readonly string[] = ["motion", "occupancy", "presence", "vibration", "moving"];
/** Alarm states that expect an empty house (armed_home and armed_night leave people moving about). */
const EMPTY_HOUSE: readonly string[] = ["armed_away", "armed_vacation", "triggered"];

const classOf = (st: HAState): string => (typeof st.attributes.device_class === "string" ? st.attributes.device_class : "");
/** A table entry by a key that came from Home Assistant: own keys only (never `constructor`). */
const pick = <T>(table: Record<string, T>, key: string): T | undefined => (Object.hasOwn(table, key) ? table[key] : undefined);

function minutesText(min: number): string {
  const m = Math.floor(min);
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h${m % 60 ? ` ${m % 60} min` : ""}`;
}

const ago = (since: number, now: number): number => Math.max(0, (now - since) / 60_000);

/** The rule a linked entity matches right now, or undefined. `empty`: an alarm is armed for an empty house. */
function ruleFor(st: HAState, link: Link, empty: boolean, now: number, since: number, cfg: AlertConfig): Rule | undefined {
  const domain = domainOf(st.entity_id);
  const cls = classOf(st);
  if (domain === "cover") {
    if (st.state !== "open" || !DOOR_COVERS.includes(cls) || ago(since, now) < cfg.openMinutes) return undefined;
    return { kind: "door_open", severity: "warning", title: "Door left open", text: `open for ${minutesText(ago(since, now))}` };
  }
  if (domain !== "binary_sensor" || st.state !== "on") return undefined;
  const known = pick(SAFETY, cls) ?? pick(PROBLEM, cls);
  if (known) return known;
  if (PRESENCE_CLASSES.includes(cls)) return empty ? { kind: "intrusion", severity: "critical", title: "Movement", text: "movement while the alarm is on" } : undefined;
  // a contact sensor: its class says door or window; with no class (or the vague "opening") the door or window it is linked to says which
  const fromLink = link.openingType ? (link.openingType === "window" ? "window_open" : "door_open") : undefined;
  const kind = cls === "" || cls === "opening" ? (fromLink ?? (cls === "opening" ? "door_open" : undefined)) : pick(OPEN_KIND, cls);
  if (!kind || ago(since, now) < cfg.openMinutes) return undefined;
  return { kind, severity: "warning", title: kind === "window_open" ? "Window left open" : "Door left open", text: `open for ${minutesText(ago(since, now))}` };
}

const RANK: Record<Severity, number> = { critical: 0, warning: 1, info: 2 };

/**
 * What needs attention now. Only entities the plan links count (a sensor nobody put on the plan is nobody's business here), plus a house alarm that has gone off, linked or not.
 * `unavailable` and `unknown` never alert. Most serious first; within one severity the newest first, so a fresh alarm is not buried under an old one.
 */
export function deriveAlerts(plan: Plan, states: Record<string, HAState>, now: number, cfg: AlertConfig): Alert[] {
  const links = linksOf(plan);
  const panels = Object.values(states).filter((s) => domainOf(s.entity_id) === "alarm_control_panel");
  const empty = panels.some((p) => EMPTY_HOUSE.includes(p.state));
  const out: Alert[] = [];
  const add = (st: HAState, link: Link, rule: Rule, since: number) => {
    const name = st.attributes.friendly_name || st.entity_id;
    const where = link.roomName ? ` (${link.roomName})` : "";
    const { roomId, roomName, itemId, openingId } = link;
    out.push({ id: `${rule.kind}:${st.entity_id}`, kind: rule.kind, severity: rule.severity, entity: st.entity_id, name, roomId, roomName, itemId, openingId, since, title: rule.title, message: `${name}${where}: ${rule.text}` });
  };
  const sinceOf = (st: HAState) => {
    const t = st.last_changed ? Date.parse(st.last_changed) : NaN;
    return Number.isNaN(t) ? now : t;
  };
  for (const p of panels) {
    if (p.state === "triggered") add(p, links.get(p.entity_id) ?? {}, { kind: "intrusion", severity: "critical", title: "Alarm", text: "the alarm has gone off" }, sinceOf(p));
  }
  for (const [entity, link] of links) {
    const st = states[entity];
    if (!st || domainOf(entity) === "alarm_control_panel") continue;
    const since = sinceOf(st);
    const rule = ruleFor(st, link, empty, now, since, cfg);
    if (rule) add(st, link, rule, since);
  }
  return out.sort((a, b) => RANK[a.severity] - RANK[b.severity] || b.since - a.since || a.id.localeCompare(b.id));
}

/** Optional barometer indication. Never a safety warning, never raised while editing. */
export function pressureAlert(reading: PressureReading | null, tendency: Tendency | undefined, enabled: boolean, editing: boolean, now: number): Alert[] {
  if (!enabled || editing || !reading || !stormWarning(tendency)) return [];
  return [{ id: `weather:${reading.entity}`, kind: "weather", source: "weather", severity: "info", entity: reading.entity, name: reading.name, since: now, title: "Falling pressure", message: "Pressure is falling very rapidly: a storm may be coming. A barometer indication, not a forecast." }];
}
