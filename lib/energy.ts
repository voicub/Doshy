// Energy sources of the whole home (solar, grid, battery, car charger, price) and the maths behind the Live view's energy flow: signed readings,
// what the house uses, self-consumption, the price now, each room's share and the lines drawn between sources, the hub and the rooms.
// Pure: no React, no three.js. Where things sit in the 3D scene is lib/energyLayout.ts; saved settings are lib/useEnergy.ts.
import { isIdle, readWatts, type StateLike } from "./flows.ts";
import { isRecord } from "./guards.ts";
import type { V3 } from "./mathUtil.ts";
import { energyDelta, kwhFactor, sampleAt, type Series } from "./stats.ts";

type NumSeries = Extract<Series, { kind: "num" }>;

/** The sensors the user picked. Every field is optional: Doshy shows what it can with what is there. */
export type EnergySources = {
  /** Watts the panels make. */
  solar?: string;
  /** Watts at the grid meter: positive = taking from the grid (the Home Assistant Energy convention), negative = giving to it. */
  grid?: string;
  gridInvert?: boolean;
  /** Watts of the home battery: positive = discharging into the home, negative = charging. */
  battery?: string;
  batteryInvert?: boolean;
  /** Home battery charge in percent. */
  batterySoc?: string;
  /** Watts the car charger delivers. */
  ev?: string;
  /** Charge of the car's own battery in percent. */
  carSoc?: string;
  /** A sensor holding the price of one kWh; `fixedPrice` is used when there is none (or it is unreadable). */
  price?: string;
  fixedPrice?: number;
  /** Shown after money amounts when the price sensor does not say ("EUR" by default). */
  currency: string;
  /** Daily totals: kWh counters, used for "today" figures. */
  solarKwh?: string;
  importKwh?: string;
  exportKwh?: string;
};

export const DEFAULT_CURRENCY = "EUR";
export const NO_SOURCES: EnergySources = { currency: DEFAULT_CURRENCY };

export const ENTITY_ID = /^[a-z0-9_]+\.[a-z0-9_]+$/;
const MAX_PRICE = 1000;
const MAX_CURRENCY = 8;
export const ENTITY_KEYS = ["solar", "grid", "battery", "batterySoc", "ev", "carSoc", "price", "solarKwh", "importKwh", "exportKwh"] as const;
export type EntityKey = (typeof ENTITY_KEYS)[number];
const FLAG_KEYS = ["gridInvert", "batteryInvert"] as const;

/** Sources from stored or hand-edited JSON: only well-formed entity ids, real booleans and a sane price survive; anything else is dropped. */
export function parseSources(raw: unknown): EnergySources {
  const out: EnergySources = { currency: DEFAULT_CURRENCY };
  if (!isRecord(raw)) return out;
  for (const k of ENTITY_KEYS) {
    const v = raw[k];
    if (typeof v === "string" && ENTITY_ID.test(v)) out[k] = v;
  }
  for (const k of FLAG_KEYS) if (raw[k] === true) out[k] = true;
  const p = raw.fixedPrice;
  if (typeof p === "number" && Number.isFinite(p) && p >= 0 && p <= MAX_PRICE) out.fixedPrice = p;
  const c = typeof raw.currency === "string" ? raw.currency.trim().slice(0, MAX_CURRENCY) : "";
  if (c) out.currency = c;
  return out;
}

/** True when something that moves power is picked (solar, grid, battery or the car charger): the 3D view and the summary card need at least one. */
export const hasLiveSources = (s: EnergySources): boolean => !!(s.solar || s.grid || s.battery || s.ev);

// ---- which sensors fit which row (power sensors: isPowerSensor from flows.ts) ----------------------------------------------

export const isPercentSensor = (st: StateLike) => (st.entity_id ?? "").startsWith("sensor.") && st.attributes?.unit_of_measurement === "%";
export const isKwhSensor = (st: StateLike) => (st.entity_id ?? "").startsWith("sensor.") && ["Wh", "kWh", "MWh"].includes(st.attributes?.unit_of_measurement ?? "");
/** A price per kWh: a "price" or "tariff" in the name, or a unit like "EUR/kWh". */
export const isPriceSensor = (st: StateLike) =>
  (st.entity_id ?? "").startsWith("sensor.") && (/price|tariff/.test(`${st.entity_id} ${st.attributes?.friendly_name ?? ""}`.toLowerCase()) || /\/\s*[kM]?Wh$/i.test(st.attributes?.unit_of_measurement ?? ""));

// ---- readings --------------------------------------------------------------------------------------------------------

/** Sensor states, plus the car's `battery_level` attribute that device trackers carry. */
export type EState = { entity_id?: string; state: string; attributes?: { unit_of_measurement?: string; device_class?: string; friendly_name?: string; battery_level?: unknown } };
export type EStates = Record<string, EState | undefined>;

/** Watts with the sensor's sign flipped when it counts the other way (never -0). */
function signedWatts(id: string | undefined, invert: boolean | undefined, states: EStates): number | undefined {
  const w = id ? readWatts(states[id]) : undefined;
  return w && invert ? -w : w;
}

const num = (v: unknown): number | undefined => (typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) : undefined);
const pct = (v: unknown): number | undefined => {
  const n = num(v);
  return n !== undefined && Number.isFinite(n) ? Math.min(100, Math.max(0, n)) : undefined;
};

export type EnergyNow = {
  solarW: number;
  importW: number;
  exportW: number;
  batteryChargeW: number;
  batteryDischargeW: number;
  /** Home battery charge, 0..100. */
  socPct?: number;
  evW: number;
  /** What the home uses, car excluded. Undefined when a picked sensor cannot be read (the sum would be wrong) or there is no grid / solar+battery to balance against. */
  houseW?: number;
  /** Share of the solar power used at home (not sent to the grid; charging the battery counts as used), 0..100. Undefined without solar power or a grid reading. */
  selfConsumptionPct?: number;
  pricePerKwh?: number;
  currency: string;
  /** Importing kW x price; 0 when exporting. Undefined without a price or a grid reading. */
  costPerHour?: number;
  /** Which sources have a usable reading right now. */
  available: { solar: boolean; grid: boolean; battery: boolean; soc: boolean; ev: boolean; price: boolean };
};

const CENTS = /^(ct|c|cent|cents|¢)$/i;
/** The price of one kWh and its currency from the sensor (a unit like "EUR/kWh", "ct/kWh" or "EUR/MWh" is understood), else the fixed price. */
export function priceOf(s: EnergySources, states: EStates): { pricePerKwh?: number; currency: string } {
  const st = s.price ? states[s.price] : undefined;
  const n = st && st.state.trim() !== "" ? Number(st.state) : NaN;
  if (st && Number.isFinite(n) && n >= 0) {
    const m = /^(.*?)\s*\/\s*([kM]?Wh)$/i.exec(st.attributes?.unit_of_measurement ?? "");
    const per = m?.[2].toLowerCase();
    const value = per === "mwh" ? n / 1000 : per === "wh" ? n * 1000 : n;
    const cur = m?.[1].trim() ?? "";
    if (CENTS.test(cur)) return { pricePerKwh: value / 100, currency: s.currency };
    return { pricePerKwh: value, currency: cur || s.currency };
  }
  return { pricePerKwh: s.fixedPrice, currency: s.currency };
}

/** Everything the live card and the 3D lines need, from the picked sensors and the current states. */
export function energyNow(s: EnergySources, states: EStates): EnergyNow {
  const solar = signedWatts(s.solar, false, states);
  const grid = signedWatts(s.grid, s.gridInvert, states);
  const bat = signedWatts(s.battery, s.batteryInvert, states);
  const ev = signedWatts(s.ev, false, states);
  const soc = s.batterySoc ? pct(states[s.batterySoc]?.state) : undefined;
  const solarW = Math.max(0, solar ?? 0); // a panel sensor can dip below zero at night
  const importW = Math.max(0, grid ?? 0);
  const exportW = Math.max(0, -(grid ?? 0));
  const batteryDischargeW = Math.max(0, bat ?? 0);
  const batteryChargeW = Math.max(0, -(bat ?? 0));
  const evW = Math.max(0, ev ?? 0);
  const readable = [[s.solar, solar], [s.grid, grid], [s.battery, bat], [s.ev, ev]].every(([id, w]) => !id || w !== undefined);
  const balanced = grid !== undefined || (solar !== undefined && bat !== undefined);
  const houseW = readable && balanced ? Math.max(0, solarW + importW + batteryDischargeW - exportW - batteryChargeW - evW) : undefined;
  const selfConsumptionPct = solar !== undefined && grid !== undefined && !isIdle(solarW) ? Math.min(100, Math.max(0, ((solarW - Math.min(exportW, solarW)) / solarW) * 100)) : undefined;
  const { pricePerKwh, currency } = priceOf(s, states);
  return {
    solarW, importW, exportW, batteryChargeW, batteryDischargeW, socPct: soc, evW, houseW, selfConsumptionPct, pricePerKwh, currency,
    costPerHour: grid !== undefined && pricePerKwh !== undefined ? (importW / 1000) * pricePerKwh : undefined,
    available: { solar: solar !== undefined, grid: grid !== undefined, battery: bat !== undefined, soc: soc !== undefined, ev: ev !== undefined, price: pricePerKwh !== undefined },
  };
}

// ---- rooms -----------------------------------------------------------------------------------------------------------

export const OTHER_ID = "other";
export type RoomShare = { id: string; watts: number; /** 0..1 of the whole */ share: number };

/**
 * Each room's share of what is used, biggest first. What the house uses beyond the rooms' own sensors is one last "other" entry (only when it is
 * a real amount). The whole is the house figure, or the rooms' sum when that is bigger (room sensors can overlap) so shares never pass 100 %.
 */
export function roomShares(rooms: { id: string; watts: number }[], houseW: number | undefined): RoomShare[] {
  const used = rooms.filter((r) => r.watts > 0);
  const sum = used.reduce((n, r) => n + r.watts, 0);
  const whole = Math.max(houseW ?? 0, sum);
  if (whole <= 0) return [];
  const out = used.map((r) => ({ id: r.id, watts: r.watts, share: r.watts / whole })).sort((a, b) => b.watts - a.watts);
  if (whole - sum >= 15) out.push({ id: OTHER_ID, watts: whole - sum, share: (whole - sum) / whole });
  return out;
}

// ---- lines -----------------------------------------------------------------------------------------------------------

export const ENERGY_COLORS = { solar: "#ffd24a", import: "#5aa0ff", export: "#3df2c4", battery: "#b07cff", ev: "#5ad7ff" } as const;

export type SourceKey = "solar" | "grid" | "battery" | "ev";
/** from -> to is the line as drawn; `direction` says which way the power runs on it (1 = from -> to, -1 = to -> from, 0 = idle). `watts` is the magnitude. */
export type FlowSegment = { key: string; kind: SourceKey | "room"; from: V3; to: V3; watts: number; color: string; direction: 1 | -1 | 0 };
/** Where the lines attach: the hub inside the building, one anchor per source outside it, and one per room. */
export type Anchors = { hub: V3; sources: Partial<Record<SourceKey, V3>>; rooms: { id: string; at: V3 }[] };

const hex = (c: string) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16));
/** Weighted average of #rrggbb colours (weights are watts); the accent colour when every weight is 0. */
export function mixColors(parts: readonly (readonly [string, number])[]): string {
  const total = parts.reduce((n, [, w]) => n + Math.max(0, w), 0);
  if (total <= 0) return ENERGY_COLORS.ev;
  const rgb = [0, 0, 0];
  for (const [c, w] of parts) hex(c).forEach((v, i) => (rgb[i] += (v * Math.max(0, w)) / total));
  return `#${rgb.map((v) => Math.round(v).toString(16).padStart(2, "0")).join("")}`;
}

const dirOf = (w: number, sign: 1 | -1): 1 | -1 | 0 => (isIdle(w) ? 0 : sign);

/**
 * The lines to draw. One per source that has a reading (source anchor -> hub; the direction says which way the power really runs: export, battery
 * charging and the car run hub-ward -> out), one per room with a power figure (hub -> room, coloured by what supplies the house, weighted by watts).
 */
export function flowLines(a: Anchors, now: EnergyNow, roomWatts: Readonly<Record<string, number | undefined>>): FlowSegment[] {
  const out: FlowSegment[] = [];
  const line = (kind: SourceKey, watts: number, color: string, sign: 1 | -1) => {
    const from = a.sources[kind];
    if (from) out.push({ key: kind, kind, from, to: a.hub, watts, color, direction: dirOf(watts, sign) });
  };
  const { available: av } = now;
  if (av.solar) line("solar", now.solarW, ENERGY_COLORS.solar, 1);
  if (av.grid) line("grid", now.importW + now.exportW, now.exportW > now.importW ? ENERGY_COLORS.export : ENERGY_COLORS.import, now.exportW > now.importW ? -1 : 1);
  if (av.battery) line("battery", now.batteryDischargeW + now.batteryChargeW, ENERGY_COLORS.battery, now.batteryChargeW > now.batteryDischargeW ? -1 : 1);
  if (av.ev) line("ev", now.evW, ENERGY_COLORS.ev, -1);
  const supply = mixColors([[ENERGY_COLORS.solar, now.solarW], [ENERGY_COLORS.import, now.importW], [ENERGY_COLORS.battery, now.batteryDischargeW]]);
  for (const r of a.rooms) {
    const w = roomWatts[r.id];
    if (w !== undefined && w >= 0) out.push({ key: `room:${r.id}`, kind: "room", from: a.hub, to: r.at, watts: w, color: supply, direction: dirOf(w, 1) });
  }
  return out;
}

// ---- words -----------------------------------------------------------------------------------------------------------

const money = (n: number) => (n >= 100 ? n.toFixed(0) : n.toFixed(2));
/** "0.31 EUR" ("0.31 EUR/h" with a suffix); "n/a" when there is no amount. */
export const formatCost = (amount: number | undefined, currency: string, suffix = ""): string => (amount === undefined ? "n/a" : `${money(amount)} ${currency}${suffix}`);
/** "3.42 kWh", "18.6 kWh", "142 kWh". */
export const formatKwh = (kwh: number | undefined): string => (kwh === undefined ? "n/a" : `${kwh < 10 ? kwh.toFixed(2) : kwh < 100 ? kwh.toFixed(1) : kwh.toFixed(0)} kWh`);

/** What the grid is doing now. */
export const gridState = (n: EnergyNow): "importing" | "exporting" | "idle" => (isIdle(n.importW - n.exportW) ? "idle" : n.importW > n.exportW ? "importing" : "exporting");
/** What the home battery is doing now. */
export const batteryState = (n: EnergyNow): "charging" | "discharging" | "idle" => (isIdle(n.batteryDischargeW - n.batteryChargeW) ? "idle" : n.batteryChargeW > n.batteryDischargeW ? "charging" : "discharging");

/** One word for a source's marker in the 3D view ("n/a" when its sensor cannot be read). Said in words too, so a still picture (Eco, reduced motion) still shows the direction. */
export function sourceStatus(kind: SourceKey, n: EnergyNow): string {
  if (!n.available[kind]) return "n/a";
  if (kind === "grid") return gridState(n);
  if (kind === "battery") return batteryState(n);
  const w = kind === "solar" ? n.solarW : n.evW;
  return isIdle(w) ? "idle" : kind === "solar" ? "producing" : "charging";
}

// ---- today -----------------------------------------------------------------------------------------------------------

/**
 * kWh a counter gained since `since`: the sum of its rises (a daily counter that resets at midnight loses only the step across the reset), starting
 * from its value at `since` and ending at its `live` reading. `unit` converts Wh / MWh.
 */
export function kwhSince(series: NumSeries, since: number, unit: string | undefined, live?: number): number {
  const v: number[] = [];
  const base = sampleAt(series, since);
  if (base !== undefined) v.push(base);
  series.t.forEach((t, i) => t >= since && v.push(series.v[i]));
  if (live !== undefined && Number.isFinite(live)) v.push(live);
  return energyDelta(v) * kwhFactor(unit);
}
