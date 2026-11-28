// What a suggestion says, in plain words: what the household does ("You turn the Hall light off at about 23:10 every night"), how sure that is ("Seen on 19 of the last 21
// nights") and what Doshy offers ("Turn the Hall light off automatically at 23:10 every night?"). Pure.
import { sunWords } from "./automationsDevice.ts";
import { actionWords, type DeviceAction } from "./deviceAction.ts";
import type { IdleSuggestion, RoutineSuggestion, Suggestion, When } from "./routines.ts";
import { WEEKDAY_IDS, WEEKDAYS, WEEKEND, daysWords } from "./weekdays.ts";

export type Namer = (entity: string) => string;
export type Words = { habit: string; seen: string; question: string };

const upper = (s: string) => s.replace(/^./, (c) => c.toUpperCase());
const sameDays = (a: readonly string[], b: readonly string[]) => a.length === b.length && a.every((d, i) => d === b[i]);

/** What a person does, as a sentence start: "You turn the Hall light off". */
function youDo(a: DeviceAction, name: string): string {
  switch (a.verb) {
    case "turn_on": return `You turn ${name} on`;
    case "turn_off": return `You turn ${name} off`;
    case "open": return `You open ${name}`;
    case "close": return `You close ${name}`;
    case "set_position": return `You put ${name} at ${a.value}%`;
    case "set_temperature": return `You set ${name} to ${a.value} degrees`;
  }
}

const isNight = (time: string) => time >= "21:00" || time < "05:00";

function daysFor(when: When): string {
  const all = sameDays(when.days, WEEKDAY_IDS);
  return all && when.kind === "clock" && isNight(when.time) ? "every night" : daysWords(when.days);
}

/** The "when" part: "at 23:10 every night" / "10 minutes after sunset on weekdays". */
export function whenWords(when: When): string {
  return `${when.kind === "clock" ? `at ${when.time}` : sunWords(when.event, when.offset)} ${daysFor(when)}`;
}

function seenUnit(when: When): string {
  if (sameDays(when.days, WEEKDAYS)) return "weekdays";
  if (sameDays(when.days, WEEKEND)) return "weekend days";
  if (sameDays(when.days, WEEKDAY_IDS)) return when.kind === "clock" && isNight(when.time) ? "nights" : "days";
  return `${daysWords(when.days).replace(/^on /, "")} days`;
}

function routineWords(s: RoutineSuggestion, name: string): Words {
  const { when } = s;
  const about = when.kind === "clock" ? `at about ${when.time}` : Math.abs(when.offset) <= 7 ? `at about ${when.event}` : `about ${sunWords(when.event, when.offset)}`;
  return {
    habit: `${youDo(s.action, name)} ${about} ${daysFor(when)}.`,
    seen: `Seen on ${s.support.n} of the last ${s.support.of} ${seenUnit(s.when)}`,
    question: `${upper(actionWords(s.action, name))} automatically ${whenWords(s.when)}?`,
  };
}

/** "about once a week", "about twice a week", "most days" or "5 times in the last 21 days". */
function howOften(n: number, days: number): string {
  const perWeek = (n * 7) / Math.max(1, days);
  if (n / Math.max(1, days) >= 0.5) return "most days";
  if (perWeek <= 1.5) return "about once a week";
  if (perWeek <= 2.5) return "about twice a week";
  return `${n} times in the last ${days} days`;
}

function idleWords(s: IdleSuggestion, name: string, motion: string): Words {
  const left = s.hoursLeftOn >= 1.5 ? `more than ${Math.floor(s.hoursLeftOn)} hours` : "over an hour";
  return {
    habit: `${upper(name)} is left on for ${left} after the last movement ${howOften(s.support.n, s.windowDays)}.`,
    seen: `Left on ${s.support.n} of ${s.support.of} times it was switched on`,
    question: `Turn it off ${s.minutes} minutes after ${motion} stops seeing movement?`,
  };
}

/** The three sentences of a suggestion. `name` says how a device is called (its name, with the room where that helps). */
export function wordsOf(s: Suggestion, name: Namer): Words {
  return s.kind === "routine" ? routineWords(s, name(s.entity)) : idleWords(s, name(s.entity), name(s.motion));
}

/** "just now", "12 min ago", "2 h ago", "3 days ago". */
export function agoWords(then: number, now: number): string {
  const s = Math.max(0, Math.round((now - then) / 1000));
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86_400) return `${Math.floor(s / 3600)} h ago`;
  const d = Math.floor(s / 86_400);
  return `${d} day${d === 1 ? "" : "s"} ago`;
}
