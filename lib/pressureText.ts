// The sentences the pressure chips, cards and the wall display say, in one place so they never disagree. Pure; the node test runner loads this file directly.
import { formatChange, formatPressure, tendencyArrow, tendencyText, type PressurePref, type PressureReading, type Tendency, type Zambretti } from "./pressure.ts";

/** "1013 hPa" or "1013 hPa, rising slowly" (a tendency needs three hours of history, so it is left out until there is one). */
export function pressureSentence(reading: PressureReading, tendency: Tendency | undefined, pref: PressurePref): string {
  const value = formatPressure(reading.hpa, pref, reading.unit);
  return tendency ? `${value}, ${tendency.label}` : value;
}

/** "1013 hPa ↗" for the chip. */
export function pressureChip(reading: PressureReading, tendency: Tendency | undefined, pref: PressurePref): string {
  const value = formatPressure(reading.hpa, pref, reading.unit);
  return tendency ? `${value} ${tendencyArrow(tendency)}` : value;
}

/** Where the number comes from and what it is: the line under the value in tooltips. */
export function pressureSource(reading: PressureReading): string {
  if (reading.corrected) return `${reading.name}, reduced to sea level`;
  if (reading.level === "station") return `${reading.name} (at your altitude, not sea level)`;
  return reading.name;
}

/** The tooltip: the value, the three hour change, the Zambretti indication and the caveat that goes with it. */
export function pressureTip(reading: PressureReading, tendency: Tendency | undefined, forecast: Zambretti | undefined, pref: PressurePref): string {
  const lines = [`Air pressure ${pressureSentence(reading, tendency, pref)}`];
  if (tendency) lines.push(`${tendencyText(tendency)}: ${formatChange(tendency.deltaHpa3h, pref, reading.unit)} in 3 hours`);
  else lines.push("Working out the trend: it needs about three hours of readings");
  if (forecast) lines.push(`Indication for the next hours: ${forecast.text}. An indication from the barometer alone, not a forecast.`);
  lines.push(pressureSource(reading));
  return lines.join("\n");
}
