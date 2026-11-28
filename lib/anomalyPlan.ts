// Which entities of the active plan the anomaly watch looks at, and what each one is (a freezer's thermometer, the whole-home power meter, a window contact ...), worked out from
// the plan's links and Home Assistant's own device classes and units. Only what the plan links is watched, like the alerts: a sensor nobody put on the plan is nobody's business.
// Battery sensors are rarely linked themselves, so the battery that belongs to a linked device (`sensor.hall_motion_battery` for `binary_sensor.hall_motion`) is found by name. Pure.
import { linksOf, type Link } from "./alerts.ts";
import { HISTORY_KINDS, type Kind, type Subject } from "./anomalyTypes.ts";
import { domainOf, type HAState } from "./ha.ts";
import { ENTITY_ID } from "./timeline.ts";
import type { Plan } from "./types.ts";

/** History is read for at most this many numeric sensors (the server takes 100). */
export const MAX_WATCHED = 80;
const MAX_SUBJECTS = 160;

const FREEZER = /freez|congel|gefrier|tiefk|zamrz/i;
const FRIDGE = /fridge|refriger|frigider|k[uü]hlschr/i;
/** A power sensor that is plainly the whole home. */
const WHOLE = /\b(total|whole|house|mains|grid|consumption)\b/i;

const unitOf = (st: HAState): string => st.attributes.unit_of_measurement ?? "";
const classOf = (st: HAState): string => st.attributes.device_class ?? "";
const WATER_VOLUME = ["l", "m³", "m3", "gal", "ft³", "ft3"];
const WATER_RATE = ["l/min", "l/h", "m³/h", "m3/h", "gal/min"];

/** What the entity is, or undefined when no rule applies to it. */
function kindOf(st: HAState, link: Link | undefined): Kind | undefined {
  const domain = domainOf(st.entity_id);
  const cls = classOf(st);
  const unit = unitOf(st).toLowerCase();
  const text = `${st.attributes.friendly_name ?? ""} ${st.entity_id}`;
  if (domain === "climate") return "climate";
  if (domain === "cover") return cls === "garage" ? "garage" : undefined;
  if (domain === "binary_sensor") {
    if (cls === "battery") return "battery_flag";
    if (cls === "garage_door") return "garage";
    if (cls === "window") return "window";
    if (cls === "door") return "door";
    if (cls === "opening" || (cls === "" && link?.openingType)) return link?.openingType === "window" ? "window" : "door";
    return undefined;
  }
  if (domain !== "sensor") return undefined;
  if (cls === "battery") return "battery";
  if (cls === "temperature" || unit === "°c" || unit === "°f") return FREEZER.test(text) ? "freezer" : FRIDGE.test(text) ? "fridge" : "temp";
  if (cls === "humidity") return "humidity";
  if (cls === "power" || unit === "w" || unit === "kw") return "power";
  if (cls === "volume_flow_rate" || WATER_RATE.includes(unit)) return /water|flow/i.test(text) || cls === "volume_flow_rate" ? "water_flow" : undefined;
  if (cls === "water" || (WATER_VOLUME.includes(unit) && /water/i.test(text))) return "water_meter";
  return undefined;
}

/** The room (or an alcove's host room) an entity of a room's own fields belongs to. */
function roomLinks(plan: Plan): Map<string, Link> {
  const out = new Map<string, Link>();
  for (const r of plan.rooms) {
    const host = plan.rooms.find((x) => x.id === r.parent) ?? r;
    const link: Link = { roomId: host.id, roomName: host.name };
    for (const e of [r.tempEntity, r.humidityEntity, ...(r.powerEntities ?? [])]) if (e && ENTITY_ID.test(e) && !out.has(e)) out.set(e, link);
  }
  return out;
}

/** The battery sensors that belong to a linked device: same name up to a `_battery` / `_battery_level` ending. */
function batteriesOf(parent: string, states: Record<string, HAState>): string[] {
  const base = parent.slice(parent.indexOf(".") + 1);
  return ["_battery", "_battery_level", "_battery_state"].map((s) => `sensor.${base}${s}`).filter((id) => states[id] && classOf(states[id]) === "battery");
}

export function subjectsOf(plan: Plan, states: Record<string, HAState>): Subject[] {
  const links = new Map<string, Link>([...roomLinks(plan), ...linksOf(plan)]);
  for (const f of plan.flows ?? []) if (f.entity && ENTITY_ID.test(f.entity) && !links.has(f.entity)) links.set(f.entity, {});
  const out: Subject[] = [];
  const seen = new Set<string>();
  const add = (entity: string, link: Link | undefined) => {
    const st = states[entity];
    if (!st || seen.has(entity)) return;
    const kind = kindOf(st, link);
    if (!kind) return;
    seen.add(entity);
    const { roomId, roomName, itemId, openingId } = link ?? {};
    const name = st.attributes.friendly_name || entity;
    out.push({ entity, kind, name, unit: unitOf(st), roomId, roomName, itemId, openingId, whole: kind === "power" && WHOLE.test(`${name} ${entity}`) });
  };
  for (const [entity, link] of links) {
    add(entity, link);
    for (const b of batteriesOf(entity, states)) add(b, link);
  }
  // power and temperature sensors first (they carry the learned rules), then the rest; the cap keeps a huge plan's scan bounded
  let watched = 0;
  const ranked = out.filter((s) => (HISTORY_KINDS.includes(s.kind) ? watched++ < MAX_WATCHED : true));
  return ranked.slice(0, MAX_SUBJECTS);
}

/** The entities whose hours the server must send. */
export const historyEntities = (subjects: readonly Subject[]): string[] => subjects.filter((s) => HISTORY_KINDS.includes(s.kind)).map((s) => s.entity);
