import { type HAState } from "@/lib/ha";
import { roomLightEntities } from "@/lib/rooms";
import type { Plan } from "@/lib/types";

export type Ent = { id: string; label: string; outdoor?: boolean };
type Consumer = { label: string; power?: string; energy?: string };
export type StatsSpec = {
  temps: Ent[];
  hums: Ent[];
  thermostat?: string;
  power?: string;
  energy?: string;
  consumers: Consumer[];
  lights: Ent[];
  openings: Ent[];
};

const WELL_KNOWN = [
  { label: "Office", temp: "sensor.office_climate_temperature", hum: "sensor.office_climate_humidity" },
  { label: "Bedroom", temp: "sensor.bedroom_climate_temperature", hum: "sensor.bedroom_climate_humidity" },
  { label: "Outside", temp: "sensor.outside_temperature", hum: "sensor.outside_humidity", outdoor: true },
];
const CONSUMERS = [
  { label: "PC display", base: "sensor.office_pc_display" },
  { label: "Dehumidifier", base: "sensor.office_dehumidifier" },
  { label: "Thermostat", base: "sensor.house_thermostat" },
];
const DEFAULT_THERMOSTAT = "climate.flat_thermostat";
const DEFAULT_POWER = "sensor.house_power_power";
const DEFAULT_ENERGY = "sensor.house_power_energy";

const nameOf = (id: string, states: Record<string, HAState>) => states[id]?.attributes.friendly_name ?? id;

/** Entities to chart: what the plan links (lights, openings, room temperature sensors) plus the well-known set, when they exist in `states`. */
export function buildSpec(plan: Plan, states: Record<string, HAState>): StatsSpec {
  const has = (id: string) => id in states;
  const temps: Ent[] = [];
  const hums: Ent[] = [];
  for (const w of WELL_KNOWN) {
    if (has(w.temp)) temps.push({ id: w.temp, label: w.label, outdoor: w.outdoor });
    if (has(w.hum)) hums.push({ id: w.hum, label: w.label, outdoor: w.outdoor });
  }
  for (const r of plan.rooms) {
    const t = r.tempEntity;
    if (!t || !has(t) || temps.some((e) => e.id === t)) continue;
    temps.push({ id: t, label: r.name });
    const h = t.replace("_temperature", "_humidity");
    if (h !== t && has(h)) hums.push({ id: h, label: r.name });
  }

  const thermostat = plan.items.find((i) => i.entity?.startsWith("climate.") && has(i.entity))?.entity ?? (has(DEFAULT_THERMOSTAT) ? DEFAULT_THERMOSTAT : undefined);

  const consumers = CONSUMERS.map((c) => ({ label: c.label, power: has(`${c.base}_power`) ? `${c.base}_power` : undefined, energy: has(`${c.base}_energy`) ? `${c.base}_energy` : undefined })).filter((c) => c.power || c.energy);

  const lightIds = [...new Set(plan.rooms.flatMap((r) => roomLightEntities(plan, r)))].filter(has);
  const lights = lightIds.map((id) => ({ id, label: nameOf(id, states) }));

  const seen: Record<string, true> = {};
  const openings: Ent[] = [];
  for (const o of plan.openings) {
    if (!o.entity || seen[o.entity] || !has(o.entity)) continue;
    seen[o.entity] = true;
    openings.push({ id: o.entity, label: nameOf(o.entity, states).replace(/\s+contact$/i, "") });
  }

  return { temps, hums, thermostat, power: has(DEFAULT_POWER) ? DEFAULT_POWER : undefined, energy: has(DEFAULT_ENERGY) ? DEFAULT_ENERGY : undefined, consumers, lights, openings };
}
