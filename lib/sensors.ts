// Pure sensor classifier (no React, no store): turns a Home Assistant entity into a kind, label, icon, state colour, formatted value
// and animation. Pure helpers keep this usable by the node test runner. Rendering: components/scene/SensorFx.tsx.
import type { HAState } from "./ha.ts";
import { isPressureEntity, toHpa } from "./pressure.ts";

type SensorAnim = "none" | "pulse" | "radar" | "shake" | "drip" | "blink";
/** Keys of the icon set SensorFx maps to Phosphor icons. */
export type SensorIcon =
  | "motion" | "presence" | "door" | "window" | "lock" | "smoke" | "gas" | "leak" | "vibration" | "alert" | "battery" | "plug" | "sound" | "light"
  | "cold" | "heat" | "wifi" | "running" | "update" | "temp" | "humidity" | "pressure" | "lux" | "uv" | "air" | "noise" | "power" | "energy" | "wind" | "rain"
  | "distance" | "signal" | "gauge" | "siren" | "soil" | "check";

export type SensorInfo = {
  kind: string; // device class or inferred class: "motion", "temperature", "co2" ...
  label: string; // short human name: "Motion", "Temperature"
  icon: SensorIcon;
  color: string; // #rrggbb state colour
  value: string; // "412 lx", "UV 6 high", "Open"
  anim: SensorAnim; // what to animate right now (already "none" while the sensor is calm)
  /** Something needs attention: leak, smoke, a door left open, a low battery ... */
  alert: boolean;
  /** The sensor is detecting (binary on) or reading something. */
  active: boolean;
  unavailable: boolean;
  /** Numeric reading when there is one. */
  num?: number;
};

type Ent = Pick<HAState, "entity_id" | "state" | "attributes">;
type Stop = [number, string];

const GREEN = "#43d17a";
const AMBER = "#ffb02e";
const ORANGE = "#ff8a3c";
const RED = "#ff4d4d";
const VIOLET = "#b46bff";
const CYAN = "#5ad7ff";
const BLUE = "#4aa3ff";
const GREY = "#8a98a3";
const YELLOW = "#ffe14a";

const hex = (c: string): [number, number, number] => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16)) as [number, number, number];
const toHex = (c: number[]) => `#${c.map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, "0")).join("")}`;

/** Linear colour ramp through value stops (clamped at both ends). */
export function ramp(v: number, stops: Stop[]): string {
  if (v <= stops[0][0]) return stops[0][1];
  for (let i = 1; i < stops.length; i++) {
    if (v <= stops[i][0]) {
      const [a, ca] = stops[i - 1];
      const [b, cb] = stops[i];
      const k = (v - a) / (b - a);
      const x = hex(ca);
      const y = hex(cb);
      return toHex(x.map((c, j) => c + (y[j] - c) * k));
    }
  }
  return stops[stops.length - 1][1];
}

const UNKNOWN = ["unavailable", "unknown", ""];

/** 412 -> "412", 21.46 -> "21.5", 0.123 -> "0.12". */
export function fmtNum(v: number): string {
  const a = Math.abs(v);
  return String(a >= 100 ? Math.round(v) : a >= 10 ? Math.round(v * 10) / 10 : Math.round(v * 100) / 100);
}
/** "21.5°C", "45%", "412 lx": no space before a degree or percent sign. */
const withUnit = (v: number, unit?: string) => (unit ? `${fmtNum(v)}${/^[°%]/.test(unit) ? "" : " "}${unit}` : fmtNum(v));

/** Event-less binary sensor classes by HA device_class. `on` / `off` are what the on / off states mean in words. */
type Bin = { label: string; icon: SensorIcon; on: string; off: string; color: string; anim: SensorAnim; alert?: boolean; offAlert?: boolean };
const OPEN: Pick<Bin, "on" | "off" | "color" | "anim" | "alert"> = { on: "Open", off: "Closed", color: AMBER, anim: "blink", alert: true };
const BINARY: Record<string, Bin> = {
  motion: { label: "Motion", icon: "motion", on: "Motion", off: "Clear", color: CYAN, anim: "radar" },
  occupancy: { label: "Occupancy", icon: "presence", on: "Occupied", off: "Empty", color: CYAN, anim: "radar" },
  presence: { label: "Presence", icon: "presence", on: "Present", off: "Away", color: CYAN, anim: "radar" },
  moving: { label: "Moving", icon: "motion", on: "Moving", off: "Still", color: CYAN, anim: "radar" },
  door: { label: "Door", icon: "door", ...OPEN },
  window: { label: "Window", icon: "window", ...OPEN },
  opening: { label: "Opening", icon: "door", ...OPEN },
  garage_door: { label: "Garage door", icon: "door", ...OPEN },
  lock: { label: "Lock", icon: "lock", on: "Unlocked", off: "Locked", color: AMBER, anim: "none", alert: true }, // HA: on = unlocked
  smoke: { label: "Smoke", icon: "smoke", on: "Smoke!", off: "Clear", color: RED, anim: "pulse", alert: true },
  gas: { label: "Gas", icon: "gas", on: "Gas!", off: "Clear", color: RED, anim: "pulse", alert: true },
  carbon_monoxide: { label: "CO", icon: "gas", on: "CO!", off: "Clear", color: RED, anim: "pulse", alert: true },
  moisture: { label: "Leak", icon: "leak", on: "Leak!", off: "Dry", color: RED, anim: "drip", alert: true },
  vibration: { label: "Vibration", icon: "vibration", on: "Vibration", off: "Still", color: AMBER, anim: "shake" },
  tamper: { label: "Tamper", icon: "alert", on: "Tamper!", off: "OK", color: RED, anim: "blink", alert: true },
  battery: { label: "Battery", icon: "battery", on: "Low battery", off: "Battery OK", color: AMBER, anim: "none", alert: true },
  plug: { label: "Plug", icon: "plug", on: "Plugged in", off: "Unplugged", color: GREEN, anim: "none" },
  problem: { label: "Problem", icon: "alert", on: "Problem", off: "OK", color: RED, anim: "pulse", alert: true },
  safety: { label: "Safety", icon: "alert", on: "Unsafe", off: "Safe", color: RED, anim: "pulse", alert: true },
  sound: { label: "Sound", icon: "sound", on: "Sound", off: "Quiet", color: CYAN, anim: "pulse" },
  light: { label: "Light", icon: "light", on: "Light", off: "Dark", color: YELLOW, anim: "none" },
  cold: { label: "Cold", icon: "cold", on: "Cold", off: "Normal", color: BLUE, anim: "none", alert: true },
  heat: { label: "Heat", icon: "heat", on: "Hot", off: "Normal", color: ORANGE, anim: "none", alert: true },
  connectivity: { label: "Connection", icon: "wifi", on: "Online", off: "Offline", color: GREEN, anim: "none", offAlert: true },
  running: { label: "Running", icon: "running", on: "Running", off: "Idle", color: GREEN, anim: "pulse" },
  update: { label: "Update", icon: "update", on: "Update ready", off: "Up to date", color: CYAN, anim: "none" },
  power: { label: "Power", icon: "power", on: "Power on", off: "No power", color: GREEN, anim: "none" },
};

type Numeric = { label: string; icon: SensorIcon; color: (v: number, unit?: string) => string; text?: (v: number, unit?: string) => string };
const toC = (v: number, unit?: string) => (unit === "°F" ? ((v - 32) * 5) / 9 : v);
const AIR: Stop[] = [[0, GREEN], [50, GREEN], [100, AMBER], [150, ORANGE], [200, RED], [300, VIOLET]];

/** UV index with its WHO band: "UV 6 high". */
export const uvBand = (v: number) => (v < 3 ? "low" : v < 6 ? "moderate" : v < 8 ? "high" : v < 11 ? "very high" : "extreme");

const NUMERIC: Record<string, Numeric> = {
  temperature: { label: "Temperature", icon: "temp", color: (v, u) => ramp(toC(v, u), [[8, BLUE], [20, "#8fe3d0"], [24, "#c8e88a"], [30, ORANGE], [36, RED]]) },
  humidity: { label: "Humidity", icon: "humidity", color: (v) => ramp(v, [[0, "#6f8396"], [40, "#5fa8e0"], [100, "#1f8fff"]]) },
  pressure: { label: "Pressure", icon: "pressure", color: (v, u) => { const h = toHpa(v, u ?? "hPa"); return h !== undefined && h > 800 && h < 1000 ? AMBER : CYAN; } },
  illuminance: { label: "Light level", icon: "lux", color: (v) => ramp(Math.log10(Math.max(1, v)), [[0, "#3b4a66"], [1.5, "#7f8fb0"], [2.7, "#ffe9a8"], [4, "#fff6cf"]]) },
  uv: { label: "UV", icon: "uv", color: (v) => ramp(v, [[0, GREEN], [2, GREEN], [3, YELLOW], [5, YELLOW], [6, ORANGE], [7, ORANGE], [8, RED], [10, RED], [11, VIOLET]]), text: (v) => `UV ${fmtNum(v)} ${uvBand(v)}` },
  irradiance: { label: "Sun power", icon: "uv", color: (v) => ramp(v, [[0, "#6b7a8a"], [400, YELLOW], [800, ORANGE], [1200, RED]]) },
  co2: { label: "CO2", icon: "air", color: (v) => ramp(v, [[400, GREEN], [800, GREEN], [1000, AMBER], [1500, ORANGE], [2000, RED]]) },
  voc: { label: "VOC", icon: "air", color: (v, u) => ramp(u === "ppm" ? v * 1000 : v, [[0, GREEN], [220, GREEN], [660, AMBER], [2200, RED]]) },
  pm1: { label: "PM1", icon: "air", color: (v) => ramp(v, [[0, GREEN], [12, GREEN], [35, AMBER], [55, ORANGE], [150, RED]]) },
  pm25: { label: "PM2.5", icon: "air", color: (v) => ramp(v, [[0, GREEN], [12, GREEN], [35, AMBER], [55, ORANGE], [150, RED]]) },
  pm10: { label: "PM10", icon: "air", color: (v) => ramp(v, [[0, GREEN], [54, GREEN], [154, AMBER], [254, ORANGE], [354, RED]]) },
  aqi: { label: "Air quality", icon: "air", color: (v) => ramp(v, AIR) },
  noise: { label: "Noise", icon: "noise", color: (v) => ramp(v, [[30, GREEN], [55, GREEN], [70, AMBER], [85, RED]]) },
  power: { label: "Power", icon: "power", color: (v, u) => ramp(u === "kW" ? v * 1000 : v, [[0, "#6f8396"], [100, CYAN], [1000, AMBER], [3000, RED]]) },
  energy: { label: "Energy", icon: "energy", color: () => "#2fd9b0" },
  voltage: { label: "Voltage", icon: "energy", color: (v) => (v > 0 && (v < 207 || v > 253) ? AMBER : GREEN) },
  current: { label: "Current", icon: "energy", color: (v) => ramp(v, [[0, "#6f8396"], [5, CYAN], [10, AMBER], [16, RED]]) },
  battery: { label: "Battery", icon: "battery", color: (v) => ramp(v, [[0, RED], [15, RED], [30, AMBER], [50, GREEN], [100, GREEN]]) },
  soil: { label: "Soil moisture", icon: "soil", color: (v) => ramp(v, [[0, ORANGE], [20, AMBER], [35, GREEN], [65, GREEN], [100, BLUE]]) },
  wind: { label: "Wind", icon: "wind", color: (v) => ramp(v, [[0, "#6f8396"], [20, CYAN], [50, AMBER], [90, RED]]) },
  rain: { label: "Rain", icon: "rain", color: (v) => ramp(v, [[0, "#6f8396"], [0.1, BLUE], [10, "#1f8fff"]]) },
  distance: { label: "Distance", icon: "distance", color: () => CYAN },
  signal: { label: "Signal", icon: "signal", color: (v) => ramp(v, [[-100, RED], [-85, RED], [-70, AMBER], [-55, GREEN]]) },
  value: { label: "Sensor", icon: "gauge", color: () => CYAN },
};

/** Map HA's sensor device_class names onto our keys. */
const CLASS_ALIAS: Record<string, string> = {
  carbon_dioxide: "co2", volatile_organic_compounds: "voc", volatile_organic_compounds_parts: "voc", pm25: "pm25", sound_pressure: "noise",
  atmospheric_pressure: "pressure", wind_speed: "wind", precipitation: "rain", precipitation_intensity: "rain", moisture: "soil", signal_strength: "signal",
  uv_index: "uv", apparent_power: "power", aqi: "aqi",
};
/** Units that say what a class-less sensor measures. */
const UNIT_CLASS: [RegExp, string][] = [
  [/^°[CF]$/, "temperature"], [/^lx$/i, "illuminance"], [/^ppm$/i, "co2"], [/^ppb$/i, "voc"], [/^dB[A]?$/i, "noise"], [/^W$|^kW$/, "power"],
  [/^kWh$|^Wh$/, "energy"], [/^V$/, "voltage"], [/^A$/, "current"], [/^(hPa|mbar|kPa)$/, "pressure"], [/^dBm$/, "signal"], [/^uv/i, "uv"], [/^W\/m²$/, "irradiance"],
  [/^µg\/m³$/, "pm25"], [/^(km\/h|m\/s|mph)$/, "wind"],
];
/** Last resort: the entity id names it ("sensor.hall_humidity", "sensor.garden_uv"). */
const NAME_CLASS: [RegExp, string][] = [
  [/humid/, "humidity"], [/batt/, "battery"], [/soil|moisture/, "soil"], [/(^|_)uv(_|$)/, "uv"], [/pm_?10/, "pm10"], [/pm_?(2_?5|25)/, "pm25"], [/pm_?1(_|$)/, "pm1"],
  [/co2|carbon_dioxide/, "co2"], [/voc/, "voc"], [/aqi|air_quality/, "aqi"], [/lux|illumin/, "illuminance"], [/rain|precip/, "rain"], [/wind/, "wind"], [/temp/, "temperature"],
];

/** The sensor class of a numeric `sensor.*`: its device_class, else its unit, else its name. */
export function numericClass(e: Ent): string {
  if (isPressureEntity(e)) return "pressure";
  const dc = e.attributes.device_class;
  if (dc) {
    const k = CLASS_ALIAS[dc] ?? dc;
    if (NUMERIC[k]) return k;
  }
  const unit = e.attributes.unit_of_measurement ?? "";
  if (unit === "%") return NAME_CLASS.map(([r, k]) => (r.test(e.entity_id) ? k : "")).find((k) => k === "humidity" || k === "battery" || k === "soil") ?? "value";
  for (const [r, k] of UNIT_CLASS) if (r.test(unit)) return k;
  for (const [r, k] of NAME_CLASS) if (r.test(e.entity_id)) return k;
  return "value";
}

const base = (kind: string, label: string, icon: SensorIcon): SensorInfo => ({ kind, label, icon, color: GREY, value: "--", anim: "none", alert: false, active: false, unavailable: true });

function classifyBinary(e: Ent): SensorInfo {
  const dc = e.attributes.device_class ?? "";
  const b = BINARY[dc] ?? { label: "Sensor", icon: "check" as SensorIcon, on: "On", off: "Off", color: CYAN, anim: "pulse" as SensorAnim };
  const out = base(dc || "binary", b.label, b.icon);
  if (UNKNOWN.includes(e.state)) return out;
  const on = e.state === "on";
  const bad = on ? !!b.alert : !!b.offAlert;
  return { ...out, unavailable: false, active: on, alert: bad, value: on ? b.on : b.off, anim: on ? b.anim : "none", color: on ? b.color : b.offAlert ? RED : GREY };
}

function classifyNumber(e: Ent): SensorInfo {
  const k = numericClass(e);
  const n = NUMERIC[k];
  const out = base(k, n.label, n.icon);
  const v = e.state.trim() !== "" && Number.isFinite(Number(e.state)) ? Number(e.state) : undefined;
  if (v === undefined) return UNKNOWN.includes(e.state) ? out : { ...out, unavailable: false, value: e.state, color: CYAN };
  const unit = e.attributes.unit_of_measurement;
  const color = n.color(v, unit);
  // red / violet readings are the "go and look" ones; they pulse gently
  const bad = color === RED || color === VIOLET;
  return { ...out, unavailable: false, active: true, num: v, color, value: n.text ? n.text(v, unit) : withUnit(v, unit), alert: bad, anim: bad ? "pulse" : "none" };
}

const LOCK: Record<string, { value: string; color: string; alert?: boolean }> = {
  locked: { value: "Locked", color: GREEN },
  locking: { value: "Locking", color: GREEN },
  unlocked: { value: "Unlocked", color: AMBER },
  unlocking: { value: "Unlocking", color: AMBER },
  open: { value: "Open", color: AMBER },
  opening: { value: "Opening", color: AMBER },
  jammed: { value: "Jammed", color: RED, alert: true },
};

/**
 * What an entity looks like as a sensor, or null when it is not one (a light, a switch ...).
 * binary_sensor / sensor / lock / siren are covered; any sensor.* with a number gets a coloured reading, even without a device class.
 */
export function classifySensor(e?: Ent): SensorInfo | null {
  if (!e) return null;
  const domain = e.entity_id.split(".")[0];
  if (domain === "binary_sensor") return classifyBinary(e);
  if (domain === "sensor") return classifyNumber(e);
  if (domain === "lock") {
    const out = base("lock", "Lock", "lock");
    const l = LOCK[e.state];
    if (!l) return out;
    return { ...out, unavailable: false, active: e.state !== "locked", value: l.value, color: l.color, alert: !!l.alert, anim: l.alert ? "pulse" : "none" };
  }
  if (domain === "siren") {
    const out = base("siren", "Siren", "siren");
    if (UNKNOWN.includes(e.state)) return out;
    const on = e.state === "on";
    return { ...out, unavailable: false, active: on, alert: on, value: on ? "Sounding" : "Quiet", color: on ? RED : GREY, anim: on ? "pulse" : "none" };
  }
  return null;
}

/** Brightness of the device's status LED: lit when something is happening or needs attention, a faint glow otherwise, dark when the sensor is offline. */
export const ledLevel = (s: SensorInfo) => (s.unavailable ? 0.12 : s.active || s.alert ? 1 : 0.4);
