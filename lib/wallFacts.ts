import type { PressurePref, PressureReading, Tendency } from "./pressure.ts";
import { pressureSentence } from "./pressureText.ts";

// Plain-English sentences for the wall display's "House now" and room slides. Pure; the node test runner loads this file directly.

/** "Anna is home", "Anna and Ben are home", "Nobody is home", "Anna is home, Ben is away". `null` when no person is tracked at all. */
export function homeText(people: readonly { name: string; home: boolean }[]): string | null {
  if (people.length === 0) return null;
  const here = people.filter((p) => p.home).map((p) => p.name);
  const away = people.filter((p) => !p.home).map((p) => p.name);
  if (here.length === 0) return "Nobody is home";
  const list = here.length === 1 ? here[0] : `${here.slice(0, -1).join(", ")} and ${here[here.length - 1]}`;
  const is = here.length === 1 ? "is" : "are";
  if (away.length === 0) return `${list} ${is} home`;
  return `${list} ${is} home, ${away.join(" and ")} ${away.length === 1 ? "is" : "are"} away`;
}

/** "All doors and windows are closed", "1 window open: Kitchen window", "3 open: A, B and C". */
export function openText(names: readonly string[]): string {
  if (names.length === 0) return "All doors and windows are closed";
  const list = names.length === 1 ? names[0] : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
  return names.length === 1 ? `1 open: ${list}` : `${names.length} open: ${list}`;
}

/** Watts as a person reads them: under a kilowatt in W, above in kW with one decimal. */
export function powerText(watts: number): string {
  const w = Math.max(0, watts);
  return w < 1000 ? `${Math.round(w)} W` : `${(w / 1000).toFixed(1)} kW`;
}

/** "Clear", "Rain" ... for the weather kind; a clear night is "Clear night". */
export function weatherText(kind: "clear" | "cloudy" | "fog" | "rain" | "storm" | "snow", night: boolean): string {
  if (kind === "clear") return night ? "Clear night" : "Clear";
  return { cloudy: "Cloudy", fog: "Foggy", rain: "Rain", storm: "Thunderstorm", snow: "Snow" }[kind];
}

/** "Pressure 1013 hPa, rising slowly" for the clock and weather slide; null when the home has no barometer. */
export function pressureLine(reading: PressureReading | null, tendency: Tendency | undefined, pref: PressurePref): string | null {
  return reading ? `Pressure ${pressureSentence(reading, tendency, pref)}` : null;
}
