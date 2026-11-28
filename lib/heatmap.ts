// Heat map layers, pure part 1: what can be mapped (metrics), which sensors feed a map, the colour range and the number formats.
// Part 2 (the interpolated grid) is lib/heatmapField.ts, the colour ramps lib/heatmapPalette.ts. No React, no store: the node test runner loads these files directly.
import type { HAState } from "./ha.ts";
import { onLevel } from "./levels.ts";
import { DEVICE_INTERNAL, type Reading } from "./live.ts";
import { isOutdoorFloor } from "./materials.ts";
import { isNumeric } from "./stats.ts";
import type { Plan, Room } from "./types.ts";
import type { PaletteName } from "./heatmapPalette.ts";

export const HEAT_METRICS = ["temperature", "humidity", "co2", "light", "noise"] as const;
export type HeatMetric = (typeof HEAT_METRICS)[number];

type MetricDef = {
  label: string;
  /** Short name for buttons. */
  short: string;
  unit: string;
  /** Home Assistant `device_class` of a matching sensor. */
  deviceClass: string;
  /** Units a matching sensor may report (an empty unit is accepted too). */
  units: readonly string[];
  /** `log`: light spans decades, so it is interpolated and coloured on a log scale. */
  scale: "linear" | "log";
  /** Colour range used when it is not stretched by the data (see `rangeFor`). */
  range: readonly [number, number];
  /** Readings outside this are sensor glitches and are ignored. */
  valid: readonly [number, number];
  /** Plain-English plural for messages ("No temperature sensors placed yet"). */
  noun: string;
};

export const METRICS: Record<HeatMetric, MetricDef> = {
  temperature: { label: "Temperature", short: "Temp", unit: "°C", deviceClass: "temperature", units: ["°C", "°F", "C", "F"], scale: "linear", range: [18, 26], valid: [-40, 80], noun: "temperature sensors" },
  humidity: { label: "Humidity", short: "Humidity", unit: "%", deviceClass: "humidity", units: ["%"], scale: "linear", range: [20, 80], valid: [0, 100], noun: "humidity sensors" },
  co2: { label: "CO2", short: "CO2", unit: "ppm", deviceClass: "carbon_dioxide", units: ["ppm"], scale: "linear", range: [400, 1500], valid: [0, 20000], noun: "CO2 sensors" },
  light: { label: "Light level", short: "Light", unit: "lx", deviceClass: "illuminance", units: ["lx"], scale: "log", range: [0, 1000], valid: [0, 200000], noun: "light sensors" },
  noise: { label: "Noise", short: "Noise", unit: "dB", deviceClass: "sound_pressure", units: ["dB", "dBA"], scale: "linear", range: [30, 80], valid: [0, 140], noun: "noise sensors" },
};

export const isHeatMetric = (v: unknown): v is HeatMetric => HEAT_METRICS.some((m) => m === v);

/** Interpolation and colouring space of a metric: the value itself, or `log1p(value)` for light (it spans decades). */
export const toScale = (metric: HeatMetric, v: number): number => (METRICS[metric].scale === "log" ? Math.log1p(Math.max(0, v)) : v);
export const fromScale = (metric: HeatMetric, u: number): number => (METRICS[metric].scale === "log" ? Math.expm1(u) : u);

const FAHRENHEIT = ["°F", "F"];
const toC = (v: number) => ((v - 32) * 5) / 9;

/** A diverging palette only makes sense for temperature (cold to hot); everything else falls back to the colour-blind safe one. */
export const effectivePalette = (metric: HeatMetric, p: PaletteName): PaletteName => (p === "diverging" && metric !== "temperature" ? "viridis" : p);

// ---- readings ------------------------------------------------------------------------------------------------------

export type HeatPoint = {
  /** Plan position in metres. */
  x: number;
  y: number;
  /** Always in the metric's own unit (Celsius for temperature), snapped to the precision the map can show (see `snap`). */
  value: number;
  entity: string;
  /** The sensor reported Fahrenheit (only used to label the legend the way the owner reads it). */
  f?: true;
};

/**
 * The step a reading is rounded to before it reaches the map: a change smaller than that does not redraw anything.
 * Temperature 0.1 degrees, humidity and noise 1, CO2 10 ppm, light 5 % (it is on a log scale).
 */
export function snap(metric: HeatMetric, v: number): number {
  switch (metric) {
    case "temperature":
      return Math.round(v * 10) / 10;
    case "humidity":
    case "noise":
      return Math.round(v);
    case "co2":
      return Math.round(v / 10) * 10;
    case "light":
      return Math.round(Math.expm1(Math.round(Math.log1p(v) * 20) / 20));
  }
}

const inRange = (m: HeatMetric, v: number) => Number.isFinite(v) && v >= METRICS[m].valid[0] && v <= METRICS[m].valid[1];

/** Does this entity feed a map of `metric`: a sensor of the right class and unit that is not a device's internal chip sensor, or a climate entity (temperature / humidity)? Ignores its current value. */
export function isHeatSensor(st: HAState | undefined, metric: HeatMetric): boolean {
  if (!st) return false;
  const def = METRICS[metric];
  const dom = st.entity_id.split(".")[0];
  if (dom === "climate") return metric === "temperature" || (metric === "humidity" && typeof st.attributes.current_humidity === "number");
  if (dom !== "sensor" || st.attributes.device_class !== def.deviceClass || DEVICE_INTERNAL.test(st.entity_id)) return false;
  const unit = st.attributes.unit_of_measurement ?? "";
  return !unit || def.units.includes(unit);
}

/** The usable value of a sensor, converted to the metric's unit. Unavailable, unknown, non-numeric and absurd readings give undefined. */
export function heatReading(st: HAState | undefined, metric: HeatMetric): { value: number; f?: true } | undefined {
  if (!isHeatSensor(st, metric) || !st) return undefined;
  if (st.entity_id.startsWith("climate.")) {
    const v = metric === "temperature" ? st.attributes.current_temperature : st.attributes.current_humidity;
    return typeof v === "number" && inRange(metric, v) ? { value: v } : undefined;
  }
  if (!isNumeric(st.state)) return undefined;
  const raw = Number(st.state);
  const f = metric === "temperature" && FAHRENHEIT.includes(st.attributes.unit_of_measurement ?? "");
  const value = f ? toC(raw) : raw;
  return inRange(metric, value) ? (f ? { value, f: true } : { value }) : undefined;
}

/** Room readings from elsewhere (the live room figures, which also look sensors up through Home Assistant areas). */
export type RoomReadings = Record<string, { temp?: Reading; humidity?: Reading } | undefined>;

/** A room's own sensor field (set in Home Assistant mode) is trusted by what the owner picked, so any numeric sensor counts, whatever its device class. */
function explicitReading(st: HAState | undefined, metric: HeatMetric): { value: number; f?: true } | undefined {
  if (!st || st.entity_id.startsWith("climate.")) return heatReading(st, metric);
  if (!isNumeric(st.state)) return undefined;
  const f = metric === "temperature" && FAHRENHEIT.includes(st.attributes.unit_of_measurement ?? "");
  const value = f ? toC(Number(st.state)) : Number(st.state);
  return inRange(metric, value) ? (f ? { value, f: true } : { value }) : undefined;
}

const explicitField = (room: Room, metric: HeatMetric): string | undefined => (metric === "temperature" ? room.tempEntity : metric === "humidity" ? room.humidityEntity : undefined);

/** A room with its alcoves: the unit a heat map colours, ranks and flags as "no sensor". Outdoor floors (garden, paving) are not part of the house's climate. */
export type HeatGroup = { room: Room; rects: Room[] };
export const heatGroups = (rooms: readonly Room[]): HeatGroup[] =>
  rooms.filter((r) => !r.parent && !isOutdoorFloor(r.floor) && r.w > 0 && r.h > 0).map((room) => ({ room, rects: [room, ...rooms.filter((a) => a.parent === room.id)] }));

/** A sensor this close to a room still belongs to it (a sensor hung on a wall sits a hair outside the floor). */
export const SENSOR_REACH = 0.3;

/** Index of the room group a point belongs to (the nearest rectangle within reach, a smaller room winning a tie), or -1. */
export function groupAt(groups: readonly HeatGroup[], x: number, y: number): number {
  let best = -1;
  let bestGap = SENSOR_REACH + 1e-9;
  let bestArea = Infinity;
  groups.forEach((g, i) => {
    for (const r of g.rects) {
      const gap = Math.hypot(Math.max(r.x - x, 0, x - (r.x + r.w)), Math.max(r.y - y, 0, y - (r.y + r.h)));
      if (gap < bestGap || (gap === bestGap && r.w * r.h < bestArea)) {
        best = i;
        bestGap = gap;
        bestArea = r.w * r.h;
      }
    }
  });
  return best;
}

/**
 * The readings of one level, as points in plan metres: every item on the level whose entity is a matching sensor (or a thermostat for temperature / humidity),
 * plus, for a room that has no placed sensor of its own, the room's explicit sensor field (or the `fallback` figure) at its centre.
 * Sensors that sit outside every indoor room of the level (a garden sensor) are left out, so they do not colour the house.
 */
export function heatPoints(plan: Plan, states: Record<string, HAState>, metric: HeatMetric, levelId: string, fallback?: RoomReadings): HeatPoint[] {
  const lv = onLevel(plan, levelId);
  const groups = heatGroups(lv.rooms);
  const placed = new Set<number>();
  const out: HeatPoint[] = [];
  const add = (x: number, y: number, entity: string, r: { value: number; f?: true } | undefined) => {
    if (r) out.push({ x, y, entity, value: snap(metric, r.value), ...(r.f ? { f: true as const } : {}) });
  };
  for (const it of lv.items) {
    const r = it.entity ? heatReading(states[it.entity], metric) : undefined;
    const g = r ? groupAt(groups, it.x, it.y) : -1;
    if (g < 0 || !it.entity) continue;
    placed.add(g);
    add(it.x, it.y, it.entity, r);
  }
  if (metric !== "temperature" && metric !== "humidity") return out;
  groups.forEach(({ room, rects }, gi) => {
    if (placed.has(gi)) return;
    const ids = rects.map((r) => explicitField(r, metric)).filter((e): e is string => !!e);
    let r = ids.map((id) => explicitReading(states[id], metric)).find(Boolean);
    if (!r && !ids.length) {
      const fb = fallback?.[room.id]?.[metric === "temperature" ? "temp" : "humidity"];
      const c = fb && (metric === "temperature" && FAHRENHEIT.includes(fb.unit) ? { value: toC(fb.value), f: true as const } : { value: fb.value });
      if (c && inRange(metric, c.value)) r = c;
    }
    add(room.x + room.w / 2, room.y + room.h / 2, ids[0] ?? `room:${room.id}`, r);
  });
  return out;
}

/** How many sensors of each metric the plan has placed (value ignored: an unavailable sensor still counts), plus the explicit room fields: enables or greys out the picker. */
export function sensorCounts(plan: Plan, states: Record<string, HAState>): Record<HeatMetric, number> {
  const out: Record<HeatMetric, number> = { temperature: 0, humidity: 0, co2: 0, light: 0, noise: 0 };
  const ids = new Set<string>();
  for (const it of plan.items) if (it.entity) ids.add(it.entity);
  for (const r of plan.rooms) {
    if (r.tempEntity) ids.add(r.tempEntity);
    if (r.humidityEntity) ids.add(r.humidityEntity);
  }
  for (const id of ids) for (const m of HEAT_METRICS) if (isHeatSensor(states[id], m)) out[m]++;
  return out;
}

// ---- range ---------------------------------------------------------------------------------------------------------

const niceCeil = (v: number) => {
  const p = 10 ** Math.floor(Math.log10(Math.max(v, 1)));
  return p * ([1, 2, 5, 10].find((m) => m * p >= v) ?? 10);
};

/**
 * The colour range [low, high] of a map: a fixed sensible span per metric, stretched to nice numbers when the readings fall outside it.
 * Temperature has no fixed span: it follows the readings in whole degrees but never covers less than 4 degrees (so a 0.5 degree difference does not look dramatic).
 */
export function rangeFor(metric: HeatMetric, values: readonly number[]): [number, number] {
  const vs = values.filter(Number.isFinite);
  const [d0, d1] = METRICS[metric].range;
  if (metric === "temperature") {
    if (!vs.length) return [d0, d1];
    let lo = Math.floor(Math.min(...vs));
    let hi = Math.ceil(Math.max(...vs));
    for (let flip = false; hi - lo < 4; flip = !flip) flip ? hi++ : lo--;
    return [lo, hi];
  }
  if (!vs.length) return [d0, d1];
  const lo = Math.min(...vs);
  const hi = Math.max(...vs);
  switch (metric) {
    case "humidity":
      return [Math.max(0, Math.min(d0, Math.floor(lo / 10) * 10)), Math.min(100, Math.max(d1, Math.ceil(hi / 10) * 10))];
    case "co2":
      return [Math.min(d0, Math.floor(lo / 100) * 100), Math.max(d1, Math.ceil(hi / 500) * 500)];
    case "light":
      return [0, Math.max(d1, niceCeil(hi))];
    case "noise":
      return [Math.min(d0, Math.floor(lo / 10) * 10), Math.max(d1, Math.ceil(hi / 10) * 10)];
  }
}

// ---- words ---------------------------------------------------------------------------------------------------------

/** "17.8 °C" for a metric value (Celsius inside, shown in Fahrenheit when the sensors report it). */
export function formatHeat(metric: HeatMetric, v: number, fahrenheit = false): string {
  const def = METRICS[metric];
  if (metric === "temperature") return fahrenheit ? `${((v * 9) / 5 + 32).toFixed(1)} °F` : `${v.toFixed(1)} °C`;
  return `${Math.round(v)} ${def.unit}`;
}

/** The same without decimals, for the ends of the colour bar ("18 °C"). */
export const formatEnd = (metric: HeatMetric, v: number, fahrenheit = false): string =>
  metric === "temperature" ? `${Math.round(fahrenheit ? (v * 9) / 5 + 32 : v)} ${fahrenheit ? "°F" : "°C"}` : formatHeat(metric, v);

/** Plain-English reason a metric cannot be shown yet. */
export const noSensorsText = (metric: HeatMetric): string => `No ${METRICS[metric].noun} placed yet`;
