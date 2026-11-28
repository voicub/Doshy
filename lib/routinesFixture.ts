// Made-up weeks of state changes for the routine finder's tests (and for trying the panel against a fake Home Assistant). Not used by the app itself.
import { dayBefore, localOf, MIN_MS } from "./routinesTime.ts";
import type { ChangeEvent } from "./routinesWire.ts";
import type { Weekday } from "./weekdays.ts";

export const ZONE = "Europe/Bucharest";
export const DAY_MS = 86_400_000;

/** The instant at which the wall clock of `zone` shows `time` on `day` (YYYY-MM-DD). Settles in two steps, so it is right on both sides of a clock change. */
export function at(day: string, time: string, zone = ZONE): number {
  const [y, mo, d] = day.split("-").map(Number);
  const [h, m, s = 0] = time.split(":").map(Number);
  const want = h * 60 + m + s / 60;
  let t = Date.UTC(y, mo - 1, d, h, m, s);
  for (let i = 0; i < 3; i++) {
    const l = localOf(t, zone);
    const dayShift = l.day < day ? 1 : l.day > day ? -1 : 0;
    t += ((want - l.minute) + dayShift * 1440) * MIN_MS;
  }
  return t;
}

/** `now` for the tests: noon on `day` in the home's zone. */
export const noon = (day: string): number => at(day, "12:00");

/** Day keys, oldest first, for the `n` days before `today`. */
export type Day = { day: string; weekday: Weekday };
export const daysBefore = (today: string, n: number): Day[] => Array.from({ length: n }, (_, i) => dayBefore(today, n - i));

/** `state` reached at `time` (+ `jitter` minutes from the list, cycled) on each of these days. Put the lists of both states together with `merge`. */
export function changes(days: readonly { day: string }[], time: string, state: string, jitter: readonly number[] = [0]): ChangeEvent[] {
  return days.map((d, i): ChangeEvent => [at(d.day, time) + jitter[i % jitter.length] * MIN_MS, state]);
}

/** Several lists of changes as one, oldest first. */
export const merge = (...lists: ChangeEvent[][]): ChangeEvent[] => lists.flat().sort((a, b) => a[0] - b[0]);

/** A sensor that changes twice a day: gives the history a known start, like a busy home's recorder does. */
export function anchor(from: number, to: number): ChangeEvent[] {
  const out: ChangeEvent[] = [];
  for (let t = from + 3_600_000, on = true; t < to; t += 12 * 3_600_000, on = !on) out.push([t, on ? "on" : "off"]);
  return out;
}

/** A small seeded random generator (mulberry32): the same numbers every run. */
export function seeded(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
