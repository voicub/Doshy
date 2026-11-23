// Pure: the Home Assistant devices linked to a room, as plain-word rows grouped by type (components/ui/RoomDevices.tsx).
// The node test runner loads this file directly, so imports carry a .ts extension or are type-only.
import { CATALOG } from "./catalog.ts";
import { curtainRig, isWindowCurtain, LAYER_ROW, type CurtainLayer } from "./curtain.ts";
import { domainOf, isActive, TOGGLEABLE, type HAState } from "./ha.ts";
import { isOn, lightInfo } from "./light.ts";
import { lightOf, roomItems } from "./rooms.ts";
import { classifySensor } from "./sensors.ts";
import { itemsIn, type Zone } from "./roomIsolate.ts";
import { rowWords, washdataOf, washView, type WashKind } from "./washdata.ts";
import type { Item, Plan, Room } from "./types.ts";

export const DEVICE_TYPES = ["lights", "switches", "climate", "media", "sensors", "security", "appliances"] as const;
export type DeviceType = (typeof DEVICE_TYPES)[number];
export const TYPE_TITLE: Record<DeviceType, string> = { lights: "Lights", switches: "Switches", climate: "Climate", media: "Media", sensors: "Sensors", security: "Security", appliances: "Appliances" };

export type DeviceRow = { itemId: string; entity: string; name: string; type: DeviceType; state: string; value: string; on: boolean; toggleable: boolean; alert?: boolean; layer?: CurtainLayer; /** A WashData appliance: its kind, for the icon. */ wash?: WashKind };
type DeviceGroup = { type: DeviceType; title: string; rows: DeviceRow[] };

const SECURITY_DOMAINS = ["camera", "alarm_control_panel", "lock", "siren"];
const SENSOR_DOMAINS = ["sensor", "binary_sensor"];
const CLIMATE_DOMAINS = ["climate", "water_heater", "humidifier"];

function typeOf(item: Item, entity: string): DeviceType {
  const d = domainOf(entity);
  if (lightOf(item)) return "lights";
  if (SECURITY_DOMAINS.includes(d) || CATALOG[item.kind]?.cat === "Security") return "security";
  if (SENSOR_DOMAINS.includes(d)) return "sensors";
  if (CLIMATE_DOMAINS.includes(d)) return "climate";
  if (d === "media_player") return "media";
  if (d === "vacuum" || CATALOG[item.kind]?.cat === "Appliances") return "appliances";
  return TOGGLEABLE.includes(d) ? "switches" : "appliances";
}

/** "Unavailable", "On", "70%", "21.5°C", "Open" ... */
function valueOf(st: HAState | undefined, type: DeviceType): string {
  if (!st || st.state === "unavailable" || st.state === "unknown") return "Unavailable";
  if (type === "lights") {
    const info = lightInfo(st, "#ffffff");
    return info.on ? (st.attributes.brightness != null ? `${Math.round(info.level * 100)}%` : "On") : "Off";
  }
  const unit = st.attributes.unit_of_measurement;
  const pos = st.attributes.current_position;
  if (domainOf(st.entity_id) === "cover" && typeof pos === "number") return pos >= 99.5 ? "Open" : pos <= 0.5 ? "Closed" : `${Math.round(pos)}% open`; // a blind or curtain at 60%
  const t = st.attributes.current_temperature;
  const text = unit ? `${st.state}${/^[°%]/.test(unit) ? "" : " "}${unit}` : st.state[0].toUpperCase() + st.state.slice(1).replace(/_/g, " ");
  return type === "climate" && typeof t === "number" ? `${text} · ${t}°` : text;
}

/** A WashData appliance (washing machine, dryer, dishwasher): "Washing - 32 min left" under Appliances, whichever of its entities the item links to. */
function washRow(item: Item, states: Record<string, HAState>, entity: string): DeviceRow | null {
  const dev = washdataOf(states, entity);
  if (!dev) return null;
  const v = washView(states, dev.base);
  return { itemId: item.id, entity, name: dev.name, type: "appliances", state: v.state, value: rowWords(v), on: v.running, toggleable: false, wash: dev.kind, ...(v.phase === "problem" ? { alert: true } : {}) };
}

const rowOf = (item: Item, states: Record<string, HAState>, entity = item.entity, layer?: CurtainLayer, tag = ""): DeviceRow | null => {
  if (!entity) return null;
  const wash = washRow(item, states, entity);
  if (wash) return wash;
  const st = states[entity];
  const type = typeOf(item, entity);
  const sensor = type === "sensors" || type === "security" ? classifySensor(st ? { ...st, entity_id: entity } : undefined) : null;
  const unavailable = !st || st.state === "unavailable" || st.state === "unknown";
  return {
    itemId: item.id,
    entity,
    name: `${st?.attributes.friendly_name || CATALOG[item.kind]?.label || entity}${tag}`,
    type,
    state: st?.state ?? "unavailable",
    value: sensor && !unavailable ? sensor.value : valueOf(st, type),
    on: isOn(st) || isActive(st),
    toggleable: TOGGLEABLE.includes(domainOf(entity)),
    ...(sensor?.alert && !unavailable ? { alert: true } : {}),
    ...(layer ? { layer } : {}),
  };
};

/** A window curtain with two layers lists both: "<name> (sheer)" and "<name> (sun-blocking)", each with its own entity. Any other piece is one row. */
function rowsOf(item: Item, states: Record<string, HAState>): DeviceRow[] {
  const def = CATALOG[item.kind];
  const rig = def && isWindowCurtain(item.kind, def.cat) ? curtainRig(def.parts) : null;
  if (!rig) return [rowOf(item, states)].flatMap((r) => r ?? []);
  const blackout = item.params?.blackoutEntity;
  const both = !!rig.sheer && !!rig.blackout;
  return [
    rig.sheer ? rowOf(item, states, item.entity, "sheer", both ? ` ${LAYER_ROW.sheer}` : "") : null,
    rig.blackout ? rowOf(item, states, typeof blackout === "string" ? blackout : undefined, "blackout", both ? ` ${LAYER_ROW.blackout}` : "") : null,
  ].flatMap((r) => r ?? []);
}

/** Rows in type order, alerts first, then by name. */
export function groupRows(rows: DeviceRow[]): DeviceGroup[] {
  return DEVICE_TYPES.map((type) => ({
    type,
    title: TYPE_TITLE[type],
    rows: rows.filter((r) => r.type === type).sort((a, b) => Number(!!b.alert) - Number(!!a.alert) || a.name.localeCompare(b.name)),
  })).filter((g) => g.rows.length);
}

export const deviceRows = (plan: Plan, states: Record<string, HAState>, room: Room): DeviceRow[] =>
  roomItems(plan, room).flatMap((i) => rowsOf(i, states));

/** The linked devices standing in a Room mode footprint (open-plan neighbours included when the zone has them). */
export const zoneDeviceRows = (plan: Plan, states: Record<string, HAState>, zone: Zone): DeviceRow[] => itemsIn(plan, zone).flatMap((i) => rowsOf(i, states));

/** The linked devices of a room (alcoves included), grouped by type. */
export const roomDevices = (plan: Plan, states: Record<string, HAState>, room: Room): DeviceGroup[] => groupRows(deviceRows(plan, states, room));

/** Case-insensitive substring over name + entity id + value; `type` null = all types. */
export function filterRows(rows: DeviceRow[], query: string, type: DeviceType | null): DeviceRow[] {
  const q = query.trim().toLowerCase();
  return rows.filter((r) => (!type || r.type === type) && (!q || `${r.name} ${r.entity} ${r.value}`.toLowerCase().includes(q)));
}
