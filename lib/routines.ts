// The routine finder's detector: from a few weeks of state changes it finds what the household does at about the same time again and again (turns the Hall light off at
// 23:10, opens the curtains at 07:30 on weekdays, closes them with the sunset) and what is left running for no reason, and turns that into suggestions in plain words.
// Deterministic and local: no model, no network, no randomness (the same changes always give the same suggestions with the same ids). Pure; the node test runner loads it.
import { MAX_SUN_OFFSET, type SunEvent } from "./automationsDevice.ts";
import { domainOf, type DeviceAction } from "./deviceAction.ts";
import { densest, type Pt } from "./routinesCluster.ts";
import { isCovered, type Probe } from "./routinesCovered.ts";
import { idleOff } from "./routinesIdle.ts";
import { occurrencesOf, type Occ } from "./routinesActions.ts";
import { sunEventNear } from "./routinesSun.ts";
import { MIN_MS, circularGap, clockText, dayBefore, localOf, median, usableZone } from "./routinesTime.ts";
import type { ChangeEvent, Covered } from "./routinesWire.ts";
import { WEEKDAY_IDS, WEEKDAYS, WEEKEND, type Weekday } from "./weekdays.ts";

/** How far from the middle a time may be and still be "the same time" (minutes). */
export const TOLERANCE_MIN = 12;
const MIN_DAYS_SEEN = 4;
const MAX_CLUSTERS = 3;
const SUN_REACH_MIN = 150;
/** A pattern that tight is a schedule (an automation), not a person. */
const SCHEDULE_SPREAD_MIN = 1.5;
const CONFLICT_MIN = 30;
export const MAX_SUGGESTIONS = 8;
const PER_DEVICE = 2;
const STRIP_DAYS = 14;
const EXAMPLES = 5;

export type When =
  | { kind: "clock"; time: string; tolerance: number; days: Weekday[] }
  | { kind: "sun"; event: SunEvent; offset: number; tolerance: number; days: Weekday[] };

export type Evidence = {
  /** on n of the `of` days the idea applies to */
  support: { n: number; of: number };
  confidence: number;
  /** the last days (oldest first): did it happen, or not, or the idea does not apply that day */
  strip: ("hit" | "miss" | "off")[];
  /** the newest days it happened, with the clock minute */
  examples: { day: string; minute: number }[];
  /** how many days the history reached back */
  windowDays: number;
};
export type RoutineSuggestion = Evidence & { kind: "routine"; id: string; entity: string; action: DeviceAction; when: When };
export type IdleSuggestion = Evidence & { kind: "idle"; id: string; entity: string; motion: string; minutes: number; hoursLeftOn: number };
export type Suggestion = RoutineSuggestion | IdleSuggestion;

export type DayInfo = { day: string; weekday: Weekday };
/** A light and the motion sensor of its room. */
export type Link = { light: string; motion: string };

export type DetectInput = {
  entities: Record<string, readonly ChangeEvent[]>;
  /** the span the changes cover */
  from: number;
  to: number;
  /** now, and how many whole days back to look */
  now: number;
  windowDays: number;
  zone?: string | null;
  lat?: number | null;
  lon?: number | null;
  covers?: readonly Covered[] | null;
  links?: readonly Link[];
};

/** Everything the per-device steps share. */
export type Ctx = {
  zone: string;
  lat: number | null;
  lon: number | null;
  window: DayInfo[];
  weekday: Record<string, Weekday>;
  covers: readonly Covered[];
  links: readonly Link[];
  events: Record<string, readonly ChangeEvent[]>;
};

/**
 * The whole days to judge: the last `windowDays` days before today (today is not over yet), cut to the days the history really holds (Home Assistant forgets old
 * states after a while: a recorder keeping 10 days has no 30). Null when there is no usable history.
 */
export function prepare(input: DetectInput): Ctx | null {
  const zone = usableZone(input.zone ?? undefined);
  const today = localOf(input.now, zone).day;
  let first = Infinity;
  for (const list of Object.values(input.entities)) for (const e of list) if (e[0] > input.from && e[0] < first) first = e[0];
  if (!Number.isFinite(first)) return null;
  const firstDay = localOf(first, zone).day;
  const window = Array.from({ length: input.windowDays }, (_, i) => dayBefore(today, i + 1)).filter((d) => d.day > firstDay);
  if (window.length < MIN_DAYS_SEEN + 1) return null;
  const weekday: Record<string, Weekday> = {};
  for (const d of window) weekday[d.day] = d.weekday;
  const place = input.lat !== null && input.lat !== undefined && input.lon !== null && input.lon !== undefined;
  return { zone, lat: place ? (input.lat ?? null) : null, lon: place ? (input.lon ?? null) : null, window, weekday, covers: input.covers ?? [], links: input.links ?? [], events: input.entities };
}

// ---- judging a cluster ---------------------------------------------------------------------------------------------------------------------------------

type Rule = { days: Weekday[]; n: number; of: number };

/**
 * Which days a set of hits makes a rule for: every day (both kinds of day mostly hit), weekdays only, the weekend only, or a few particular days. Null when the hits
 * are too few or too scattered. A weekend has only a handful of days in a few weeks, so it needs fewer hits (but a higher share).
 */
export function judge(hitDays: ReadonlySet<string>, window: readonly DayInfo[]): Rule | null {
  const count = (set: readonly Weekday[]) => {
    const days = window.filter((d) => set.includes(d.weekday));
    return { of: days.length, n: days.filter((d) => hitDays.has(d.day)).length };
  };
  const wd = count(WEEKDAYS);
  const we = count(WEEKEND);
  const rate = (c: { n: number; of: number }) => (c.of ? c.n / c.of : 0);
  const all = { n: wd.n + we.n, of: wd.of + we.of };
  if (rate(wd) >= 0.6 && rate(we) >= 0.6 && all.n >= 5 && rate(all) >= 0.65) return { days: [...WEEKDAYS, ...WEEKEND], ...all };
  if (rate(wd) >= 0.7 && wd.n >= 5 && rate(we) < 0.6) return { days: [...WEEKDAYS], ...wd };
  if (rate(we) >= 0.75 && we.n >= 4 && rate(wd) < 0.6) return { days: [...WEEKEND], ...we };
  // a few particular days (Tuesday and Thursday): each of them nearly always, the others hardly ever
  const each = WEEKDAY_IDS.map((d) => ({ d, ...count([d]) }));
  const chosen = each.filter((c) => c.of >= 3 && rate(c) >= 0.75);
  const rest = each.filter((c) => !chosen.includes(c));
  const n = chosen.reduce((s, c) => s + c.n, 0);
  const restRate = rest.reduce((s, c) => s + c.n, 0) / Math.max(1, rest.reduce((s, c) => s + c.of, 0));
  if (chosen.length && chosen.length <= 4 && n >= 5 && restRate <= 0.25) return { days: chosen.map((c) => c.d), n, of: chosen.reduce((s, c) => s + c.of, 0) };
  return null;
}

// ---- candidates ----------------------------------------------------------------------------------------------------------------------------------------

type Hit = { t: number; day: string; minute: number; occ: Occ };
type Candidate = { entity: string; action: DeviceAction; key: string; when: When; rule: Rule; hits: Hit[]; spread: number; confidence: number; part: string };

/** FNV-1a: a short stable id from text. */
export function hashId(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193);
  return `r${(h >>> 0).toString(16).padStart(8, "0")}`;
}

/** The part of the day an idea belongs to: it keeps its id when its time drifts a little. */
const partOfDay = (minute: number): string => (minute >= 1260 || minute < 300 ? "night" : minute < 660 ? "morning" : minute < 1020 ? "day" : "evening");

const round = (v: number, step: number) => Math.round(v / step) * step;

function actionFrom(base: DeviceAction, hits: readonly Hit[]): DeviceAction {
  if (base.verb === "set_position") return { verb: "set_position", value: Math.min(95, Math.max(5, round(median(hits.map((h) => h.occ.action.value ?? 0)), 5))) };
  if (base.verb === "set_temperature") return { verb: "set_temperature", value: round(median(hits.map((h) => h.occ.action.value ?? 0)), 0.5) };
  return base;
}

function strip(window: readonly DayInfo[], rule: Rule, hitDays: ReadonlySet<string>): Evidence["strip"] {
  return window.slice(0, STRIP_DAYS).reverse().map((d) => (!rule.days.includes(d.weekday) ? "off" : hitDays.has(d.day) ? "hit" : "miss"));
}

function build(entity: string, key: string, base: DeviceAction, hits: Hit[], rule: Rule, centre: number, spread: number, sun: SunEvent | null): Candidate {
  const action = actionFrom(base, hits);
  const tolerance = Math.max(5, Math.ceil(spread / 5) * 5);
  const clock = round(centre, 5);
  const when: When = sun ? { kind: "sun", event: sun, offset: Math.max(-MAX_SUN_OFFSET, Math.min(MAX_SUN_OFFSET, round(centre, 5))), tolerance, days: rule.days } : { kind: "clock", time: clockText(clock), tolerance, days: rule.days };
  const confidence = Math.round((rule.n / rule.of) * (1 - 0.25 * Math.min(1, spread / TOLERANCE_MIN)) * 100) / 100;
  const middle = sun ? median(hits.map((h) => h.minute)) : centre;
  return { entity, action, key, when, rule, hits, spread, confidence, part: partOfDay(middle) };
}

/** The sun-relative points of an action's hits: minutes after the sunrise or sunset the hit is nearest to (the one most of them are near), else null. */
function sunPoints(ctx: Ctx, hits: readonly Hit[]): { event: SunEvent; pts: Pt[] } | null {
  if (ctx.lat === null || ctx.lon === null) return null;
  const events: SunEvent[] = ["sunrise", "sunset"];
  const offsets = events.map((event) => hits.map((h, id): Pt | null => {
    const at = sunEventNear(h.t, ctx.lat as number, ctx.lon as number, event);
    const v = at === null ? NaN : (h.t - at) / MIN_MS;
    return Number.isFinite(v) && Math.abs(v) <= SUN_REACH_MIN ? { v, day: h.day, id } : null;
  }).filter((p): p is Pt => p !== null));
  const best = offsets[0].length >= offsets[1].length ? 0 : 1;
  return offsets[best].length ? { event: events[best], pts: offsets[best] } : null;
}

function probeOf(ctx: Ctx, near: Hit): Probe {
  return {
    minute: near.minute,
    sunOffset: (event) => {
      if (ctx.lat === null || ctx.lon === null) return null;
      const at = sunEventNear(near.t, ctx.lat, ctx.lon, event);
      return at === null ? null : (near.t - at) / MIN_MS;
    },
  };
}

/** The hit nearest the middle of a cluster (what "a typical day" looked like). */
const typical = (hits: readonly Hit[], minute: number): Hit => hits.reduce((a, b) => (circularGap(b.minute, minute) < circularGap(a.minute, minute) ? b : a));

/**
 * The day a hit belongs to for a habit around midnight: a light switched off at 00:05 belongs to the evening before, and one at 23:55 to the same evening, when the habit's time
 * is before midnight (after 12:00); for a habit just after midnight the 23:55 ones belong to the next day. Away from midnight a hit belongs to its own day.
 */
function onItsDay(h: Hit, centre: number): Hit {
  if (centre >= 720 && h.minute < 720) return { ...h, day: dayBefore(h.day, 1).day };
  if (centre < 720 && h.minute >= 720) return { ...h, day: dayBefore(h.day, -1).day };
  return h;
}

/** Clusters of one kind of action on one device, as ideas: by clock time, and by sun time when that holds together better. */
function clusters(ctx: Ctx, entity: string, key: string, occs: readonly Occ[]): Candidate[] {
  const hits: Hit[] = occs.map((occ) => {
    const l = localOf(occ.t, ctx.zone);
    return { t: occ.t, day: l.day, minute: l.minute, occ };
  });
  if (hits.length < MIN_DAYS_SEEN) return [];
  const out: Candidate[] = [];
  let left: Pt[] = hits.map((h, id) => ({ v: h.minute, day: h.day, id }));
  for (let i = 0; i < MAX_CLUSTERS; i++) {
    const c = densest(left, TOLERANCE_MIN, true);
    if (!c || c.days < MIN_DAYS_SEEN) break;
    const picked = c.members.map((m) => onItsDay(hits[m.id], c.centre)).filter((h) => ctx.weekday[h.day]);
    const rule = picked.length ? judge(new Set(picked.map((h) => h.day)), ctx.window) : null;
    if (rule) out.push(build(entity, key, picked[0].occ.action, picked, rule, c.centre, c.spread, null));
    const gone = new Set(c.members.map((m) => m.id));
    left = left.filter((p) => !gone.has(p.id));
  }
  const sun = sunPoints(ctx, hits);
  const s = sun ? densest(sun.pts, TOLERANCE_MIN, false) : null;
  if (sun && s && s.days >= MIN_DAYS_SEEN) {
    const picked = s.members.map((m) => hits[m.id]).filter((h) => ctx.weekday[h.day]);
    const rule = picked.length ? judge(new Set(picked.map((h) => h.day)), ctx.window) : null;
    if (rule) {
      const cand = build(entity, key, picked[0].occ.action, picked, rule, s.centre, s.spread, sun.event);
      const ids = new Set(picked.map((p) => p.t));
      // the sun explains the same evenings better than the clock (two more days, or as many days but twice as tight): replace the clock ideas it overlaps; the clock wins ties: a fixed time is simpler
      const overlaps = (c: Candidate) => c.hits.filter((h) => ids.has(h.t)).length * 2 >= Math.min(c.hits.length, picked.length);
      const rivals = out.filter(overlaps);
      const better = (r: Candidate) => cand.rule.n >= r.rule.n + 2 || (cand.rule.n >= r.rule.n && cand.spread * 2 <= r.spread);
      if (!rivals.length || rivals.every(better)) return [...out.filter((c) => !overlaps(c)), cand];
    }
  }
  return out;
}

/** Ideas for one device: what was done at about the same time again and again. */
function candidatesFor(ctx: Ctx, entity: string): Candidate[] {
  const events = ctx.events[entity] ?? [];
  const byKey = new Map<string, Occ[]>();
  for (const occ of occurrencesOf(entity, events)) byKey.set(occ.key, [...(byKey.get(occ.key) ?? []), occ]);
  const out: Candidate[] = [];
  for (const [key, occs] of [...byKey.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1))) out.push(...clusters(ctx, entity, key, occs));
  return out;
}

// ---- ranking -------------------------------------------------------------------------------------------------------------------------------------------

/** A suggestion from an idea: drops the ones that look like a schedule or that an existing automation already does. */
function suggest(ctx: Ctx, c: Candidate): RoutineSuggestion | null {
  if (c.spread <= SCHEDULE_SPREAD_MIN && c.rule.n >= 6) return null;
  const near = typical(c.hits, c.when.kind === "clock" ? clockMinute(c.when.time) : median(c.hits.map((h) => h.minute)));
  if (isCovered(ctx.covers, c.entity, c.action.verb, probeOf(ctx, near))) return null;
  const hitDays = new Set(c.hits.map((h) => h.day));
  const examples = [...c.hits].sort((a, b) => b.t - a.t).slice(0, EXAMPLES).map((h) => ({ day: h.day, minute: Math.round(h.minute) }));
  const id = hashId(["routine", c.entity, c.key, c.when.kind === "sun" ? c.when.event : c.part].join("|"));
  return { kind: "routine", id, entity: c.entity, action: c.action, when: c.when, support: { n: c.rule.n, of: c.rule.of }, confidence: c.confidence, strip: strip(ctx.window, c.rule, hitDays), examples, windowDays: ctx.window.length };
}

const clockMinute = (time: string): number => Number(time.slice(0, 2)) * 60 + Number(time.slice(3));
const OPPOSITE: Partial<Record<DeviceAction["verb"], DeviceAction["verb"]>> = { turn_on: "turn_off", turn_off: "turn_on", open: "close", close: "open" };

/** Two ideas that undo each other within half an hour on the same device are noise (a light toggled on and off around the same time): both go. */
function conflicting(a: RoutineSuggestion, b: RoutineSuggestion): boolean {
  if (a.entity !== b.entity || OPPOSITE[a.action.verb] !== b.action.verb || a.when.kind !== b.when.kind) return false;
  const at = (w: When) => (w.kind === "clock" ? clockMinute(w.time) : w.offset);
  return (a.when.kind === "clock" ? circularGap(at(a.when), at(b.when)) : Math.abs(at(a.when) - at(b.when))) < CONFLICT_MIN;
}

const score = (s: Suggestion) => s.confidence * (1 + Math.min(s.support.n, STRIP_DAYS) / STRIP_DAYS);

/** The best few: no conflicting pairs, at most two per device, best first (ties by id so the order never changes), at most MAX_SUGGESTIONS. */
export function rank(suggestions: readonly Suggestion[]): Suggestion[] {
  const routines = suggestions.filter((s): s is RoutineSuggestion => s.kind === "routine");
  const kept = suggestions.filter((s) => s.kind === "idle" || !routines.some((r) => r !== s && conflicting(s, r)));
  const seen = new Set<string>();
  const perDevice = new Map<string, number>();
  const out: Suggestion[] = [];
  for (const s of [...kept].sort((a, b) => score(b) - score(a) || (a.id < b.id ? -1 : 1))) {
    const n = perDevice.get(s.entity) ?? 0;
    if (n >= PER_DEVICE || seen.has(s.id)) continue;
    seen.add(s.id);
    perDevice.set(s.entity, n + 1);
    out.push(s);
    if (out.length === MAX_SUGGESTIONS) break;
  }
  return out;
}

/** Every idea for one device as suggestions (the unit the browser runs between pauses so the screen never freezes). */
export function suggestionsFor(ctx: Ctx, entity: string): Suggestion[] {
  const out: Suggestion[] = candidatesFor(ctx, entity).flatMap((c) => suggest(ctx, c) ?? []);
  if (domainOf(entity) === "light") {
    const inWindow = (day: string) => day in ctx.weekday;
    for (const link of ctx.links.filter((l) => l.light === entity)) {
      const idle = idleOff(entity, ctx.events[entity] ?? [], ctx.events[link.motion] ?? [], ctx.zone, inWindow);
      if (!idle || ctx.covers.some((c) => c.entity === entity && c.verbs.includes("turn_off") && c.sensors.includes(link.motion))) continue;
      const days = new Set(idle.forgotten.map((f) => f.day));
      const rule: Rule = { days: [...WEEKDAYS, ...WEEKEND], n: idle.forgotten.length, of: idle.episodes };
      const hoursLeftOn = Math.round(median(idle.forgotten.map((f) => f.hours)) * 10) / 10;
      out.push({
        kind: "idle", id: hashId(["idle", entity, link.motion].join("|")), entity, motion: link.motion, minutes: idle.minutes, hoursLeftOn,
        support: { n: rule.n, of: rule.of }, confidence: Math.round((rule.n / rule.of) * 100) / 100, strip: strip(ctx.window, rule, days),
        examples: [...idle.forgotten].sort((a, b) => b.t - a.t).slice(0, EXAMPLES).map((f) => ({ day: f.day, minute: Math.round(localOf(f.t, ctx.zone).minute) })), windowDays: ctx.window.length,
      });
    }
  }
  return out;
}

/**
 * The final step: two suggestions of one scan with the same id (a weekday and a weekend routine in the same part of the day) are told apart by their days, then the best
 * few are kept. The browser calls this after running `suggestionsFor` device by device.
 */
export function finish(all: readonly Suggestion[]): Suggestion[] {
  const ids = new Set<string>();
  return rank(all.map((s) => {
    if (!ids.has(s.id)) {
      ids.add(s.id);
      return s;
    }
    return s.kind === "routine" ? { ...s, id: hashId([s.id, ...s.when.days].join("|")) } : s;
  }));
}

/** All of it in one go (tests, small homes); the browser runs `suggestionsFor` per device between pauses instead. */
export function detectRoutines(input: DetectInput): Suggestion[] {
  const ctx = prepare(input);
  return ctx ? finish(Object.keys(input.entities).sort().flatMap((entity) => suggestionsFor(ctx, entity))) : [];
}
