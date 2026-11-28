// "The kitchen light is left on long after the last movement": how often a light stays on for an hour or more after its room's motion sensor last saw anyone, and how long
// the sensor's own quiet gaps are while somebody really is there (so the suggested delay does not switch the light off on a person sitting still). Pure.
import { occurrencesOf } from "./routinesActions.ts";
import { MIN_MS, localOf } from "./routinesTime.ts";
import type { ChangeEvent } from "./routinesWire.ts";

/** A light left on this long after the last movement counts as forgotten. */
export const FORGOTTEN_MIN = 60;
const MIN_FORGOTTEN = 3;
const MIN_EPISODES = 5;
const TOO_SHORT_MS = 5 * MIN_MS;
const DELAY_MIN = 10;
const DELAY_MAX = 60;
const DELAY_DEFAULT = 15;

export type Idle = {
  /** times the light was forgotten, and for how many hours after the last movement (local day of the switch-off) */
  forgotten: { day: string; t: number; hours: number }[];
  /** lights-on evenings where the sensor saw movement at all */
  episodes: number;
  /** the delay to suggest, in minutes */
  minutes: number;
};

const quantile = (sorted: readonly number[], q: number): number => sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))];

/**
 * Looks at every time the light was on (from switched on to switched off) and at the motion sensor's changes in between. Null unless the sensor clearly belongs to this
 * light (it saw movement in at least half of the episodes) and the light was forgotten at least three times.
 */
export function idleOff(light: string, lightEvents: readonly ChangeEvent[], motionEvents: readonly ChangeEvent[], zone: string, inWindow: (day: string) => boolean): Idle | null {
  const switches = occurrencesOf(light, lightEvents);
  const seen = motionEvents.map((e) => e[0]);
  const forgotten: Idle["forgotten"] = [];
  const gaps: number[] = [];
  let episodes = 0;
  let total = 0;
  let onAt: number | null = null;
  for (const s of switches) {
    if (s.action.verb === "turn_on") {
      onAt = s.t;
      continue;
    }
    if (onAt === null) continue;
    const start = onAt;
    onAt = null;
    const during = seen.filter((t) => t >= start && t <= s.t);
    const day = localOf(s.t, zone).day;
    if (s.t - start < TOO_SHORT_MS || !inWindow(day)) continue;
    total++;
    if (!during.length) continue;
    episodes++;
    for (let i = 1; i < during.length; i++) gaps.push((during[i] - during[i - 1]) / MIN_MS);
    const tail = (s.t - during[during.length - 1]) / MIN_MS;
    if (tail >= FORGOTTEN_MIN) forgotten.push({ day, t: s.t, hours: Math.round((tail / 60) * 10) / 10 });
  }
  if (forgotten.length < MIN_FORGOTTEN || episodes < MIN_EPISODES || episodes * 2 < total) return null;
  const sorted = gaps.sort((a, b) => a - b);
  const minutes = sorted.length ? Math.min(DELAY_MAX, Math.max(DELAY_MIN, Math.ceil((quantile(sorted, 0.9) * 1.25) / 5) * 5)) : DELAY_DEFAULT;
  return { forgotten, episodes, minutes };
}
