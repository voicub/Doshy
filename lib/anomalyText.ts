// Units and words for the anomaly watch: the engine works in °C, W, % and litres whatever the sensor reports; these convert in and out, and say a length of time or a start
// ("since Tuesday") the way a person would. Pure.
import { localOf, usableZone } from "./routinesTime.ts";
import { weekdayName } from "./weekdays.ts";
import type { Kind, Subject } from "./anomalyTypes.ts";

const LITRES: Record<string, number> = { l: 1, "m³": 1000, m3: 1000, gal: 3.78541, "ft³": 28.3168, ft3: 28.3168 };
/** litres per hour for one unit of a flow-rate sensor */
const LITRES_PER_HOUR: Record<string, number> = { "l/min": 60, "l/h": 1, "m³/h": 1000, "m3/h": 1000, "gal/min": 227.125 };

/** A reading of this sensor in the engine's unit, or null when the unit is not one the rules understand (such a sensor is not judged). */
export function toSI(kind: Kind, unit: string, v: number): number | null {
  const u = unit.toLowerCase();
  switch (kind) {
    case "temp": case "fridge": case "freezer":
      return u === "°f" ? (v - 32) / 1.8 : u === "°c" ? v : null;
    case "power":
      return u === "kw" ? v * 1000 : u === "w" ? v : null;
    case "humidity":
      return v;
    case "water_meter":
      return Object.hasOwn(LITRES, u) ? v * LITRES[u] : null;
    case "water_flow":
      return Object.hasOwn(LITRES_PER_HOUR, u) ? v * LITRES_PER_HOUR[u] : null;
    default:
      return v;
  }
}

/** The engine's number back in the sensor's own unit (a temperature level; for a difference use `fromSIDelta`). */
export function fromSI(s: Subject, v: number): number {
  const u = s.unit.toLowerCase();
  if (s.kind === "power" && u === "kw") return v / 1000;
  if (u === "°f" && (s.kind === "temp" || s.kind === "fridge" || s.kind === "freezer")) return v * 1.8 + 32;
  return v;
}

/** A temperature difference in the sensor's unit (a degree Fahrenheit is smaller). */
export const fromSIDelta = (s: Subject, d: number): number => (s.unit.toLowerCase() === "°f" ? d * 1.8 : d);

/** "4" "12" "3.5": whole numbers from 10 up, one decimal below. */
export const num = (x: number): string => (Math.abs(x) >= 10 ? String(Math.round(x)) : String(Math.round(x * 10) / 10));

/** "40 minutes", "3 hours", "26 hours", "2 days". */
export function duration(ms: number): string {
  const min = Math.max(1, Math.round(ms / 60_000));
  if (min < 60) return `${min} minute${min === 1 ? "" : "s"}`;
  const h = Math.round(min / 60);
  if (h < 48) return `${h} hour${h === 1 ? "" : "s"}`;
  return `${Math.round(h / 24)} days`;
}

const clock = (t: number, zone: string): string => {
  const m = Math.floor(localOf(t, zone).minute);
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
};

/** "since 14:30" today, "since Tuesday" within the last week, otherwise "for over 5 days". `open`: the stretch runs back to where the history we looked at begins. */
export function since(start: number, now: number, zone: string | null, open = false): string {
  const z = usableZone(zone ?? undefined);
  const l = localOf(start, z);
  const days = Math.round((now - start) / 86_400_000);
  if (open || days > 6) return `for over ${Math.max(days, 1)} days`;
  if (l.day === localOf(now, z).day) return `since ${clock(start, z)}`;
  return `since ${weekdayName(l.weekday)}`;
}

/** The local hour (0..23) at `t`. */
export const hourOf = (t: number, zone: string | null): number => Math.floor(localOf(t, usableZone(zone ?? undefined)).minute / 60);

export const clockAt = (t: number, zone: string | null): string => clock(t, usableZone(zone ?? undefined));

/** "Bedroom humidity" -> kept; a trailing " temperature" / " power" is dropped where the sentence already says it. */
export const subjectName = (name: string, dropWord: string): string => name.replace(new RegExp(`\\s+${dropWord}$`, "i"), "");
