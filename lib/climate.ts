import { domainOf, type HAState } from "./ha.ts";
import { entitiesOfRoom, type HaArea } from "./haAreas.ts";
import type { Plan, Room } from "./types.ts";

type ClimateInfo = { id: string; name: string; current?: number; target?: number; action?: string; mode: string };

/** Thermostats, ones that report a room temperature first (a real thermostat before its mirror entity). */
export function climateIds(states: Record<string, HAState>): string[] {
  return Object.keys(states)
    .filter((id) => domainOf(id) === "climate")
    .sort((a, b) => Number(states[b].attributes.current_temperature != null) - Number(states[a].attributes.current_temperature != null) || a.localeCompare(b));
}

export function climateInfo(st: HAState): ClimateInfo {
  const a = st.attributes;
  return { id: st.entity_id, name: a.friendly_name ?? st.entity_id, current: a.current_temperature, target: a.temperature, action: a.hvac_action, mode: st.state };
}

export type RoomTemp = { room: Room; entity: string; value: number; unit: string };

const isTemperature = (st: HAState) => st.attributes.device_class === "temperature" || (/temperature/.test(st.entity_id) && /^°?[CF]$/.test(st.attributes.unit_of_measurement ?? ""));

/** One temperature reading per plan room: the room's own `tempEntity`, else the first temperature sensor in its Home Assistant areas. */
export function roomTemps(plan: Plan, states: Record<string, HAState>, entityArea: Record<string, string | null>, areas: HaArea[]): RoomTemp[] {
  const out: RoomTemp[] = [];
  for (const room of plan.rooms.filter((r) => !r.parent)) {
    const own = room.tempEntity ? states[room.tempEntity] : undefined;
    const found =
      own ??
      entitiesOfRoom(plan, room, entityArea, states, areas)
        .filter((id) => domainOf(id) === "sensor" && isTemperature(states[id]) && Number.isFinite(parseFloat(states[id].state)))
        .sort()
        .map((id) => states[id])[0];
    const value = found ? parseFloat(found.state) : NaN;
    if (found && Number.isFinite(value)) out.push({ room, entity: found.entity_id, value, unit: found.attributes.unit_of_measurement ?? "°C" });
  }
  return out;
}

/** Round to the thermostat's step (0.1 / 0.5) and keep inside its limits, without float noise. */
export function snapTarget(v: number, step: number, min: number, max: number): number {
  const s = step > 0 ? step : 0.5;
  const n = Math.round((Math.min(max, Math.max(min, v)) - min) / s) * s + min;
  return Math.round(Math.min(max, Math.max(min, n)) * 100) / 100;
}
