// The automatic rule for the heavy (blackout) curtain layer: close at dawn, optionally open again at a set time. Pure: given the sun, the cover,
// the owner's settings and what happened before, it says what to do now (nothing, close, open) and what to remember. The server loop that
// asks it every minute is lib/server/curtainAutomation.ts. The node test runner loads this file directly: no browser or path-alias imports.

/** What `sun.sun` says: its state (`above_horizon` / `below_horizon`), `elevation` in degrees, `rising`. */
export type SunReading = { state: string; elevation?: number; rising?: boolean };
/** What the cover entity says: `open`, `closed`, `opening`, `closing`, or unavailable; `current_position` is 0 (closed) to 100 (open). */
export type CoverReading = { state: string; current_position?: number };
/** The owner's settings for one blackout curtain (lib/curtain.ts curtainLayers). `openAt` is "HH:MM", local time. */
export type Rule = { dawn: boolean; openAt?: string };

/** Everything the rule keeps between two looks. Days are local calendar days, "YYYY-MM-DD". Small on purpose: it is stored per curtain. */
export type Memory = {
  /** The sun at the previous look (`at` = ms since epoch): how a crossing of -6 degrees is seen. */
  prevSun?: SunReading & { at: number };
  /** The day the dawn rule was settled: it closed the curtain, found it already closed, or gave up. At most once a day. */
  dawnDay?: string;
  /** When dawn was seen but the curtain could not be reached yet (so it is tried again for a while). */
  dawnDueAt?: number;
  /** The day, and the moment, this rule closed the curtain itself. Only such a curtain is opened again at the set time. */
  closedDay?: string;
  closedAt?: number;
  /** The day the open-again rule was settled. */
  openDay?: string;
  /** Calls to Home Assistant that failed today, so a broken cover is not hammered. */
  tries?: { day: string; n: number };
};

export type Decision = {
  action: "close" | "open" | "none";
  /** One plain sentence about what happened or why nothing did. */
  why: string;
  /** What to keep, assuming the action worked. */
  memory: Memory;
  /** What to keep when the call to Home Assistant failed. Equals `memory` for "none". */
  ifFailed: Memory;
  /** Worth a line in the log and in the "last automatic action" shown to the owner. False for the quiet minutes in between. */
  log: boolean;
};

/** Civil dawn: the sun is this many degrees below the horizon (about 30 minutes before sunrise). */
const DAWN_ELEVATION = -6;
/** Restarting inside this window of a rising sun, with nothing done today, still counts as dawn. */
const WINDOW_TOP = 2;
/** A look at the sun older than this is not "the previous look": a crossing in between was not observed. */
export const RECENT_MS = 15 * 60_000;
/** A dawn that could not be acted on (curtain unreachable) is tried again for this long. */
export const DUE_MS = 45 * 60_000;
/** Failed calls per day before the rule leaves that curtain alone. */
export const MAX_TRIES = 3;

const pad = (n: number) => String(n).padStart(2, "0");
/** The local calendar day of `d` ("YYYY-MM-DD"): the server's own clock and zone, so a daylight-saving day is just a day. */
export const localDay = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/** "HH:MM" (00:00 to 23:59) as [hours, minutes], or undefined. */
export function parseTime(s: string | undefined): [number, number] | undefined {
  const m = s !== undefined ? /^([01]\d|2[0-3]):([0-5]\d)$/.exec(s) : null;
  return m ? [Number(m[1]), Number(m[2])] : undefined;
}

const alive = (state: string | undefined) => state !== undefined && state !== "" && state !== "unavailable" && state !== "unknown";
const isShut = (c: CoverReading) => c.state === "closed" || c.state === "closing" || c.current_position === 0;
const num = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n);

/** The sun went from below -6 degrees to -6 or above since the previous look; without elevations, from below to above the horizon. */
function crossed(prev: SunReading, sun: SunReading) {
  if (num(prev.elevation) && num(sun.elevation)) return prev.elevation < DAWN_ELEVATION && sun.elevation >= DAWN_ELEVATION;
  return prev.state === "below_horizon" && sun.state === "above_horizon";
}

/** After a failed call: count it, and give the curtain up for today when it keeps failing. */
function failed(m: Memory, today: string, settled: Memory): Memory {
  const n = (m.tries?.day === today ? m.tries.n : 0) + 1;
  return n >= MAX_TRIES ? { ...settled, tries: { day: today, n } } : { ...m, tries: { day: today, n } };
}

export function decide(input: { now: Date; sun: SunReading | undefined; cover: CoverReading | undefined; rule: Rule; memory: Memory }): Decision {
  const { now, sun, rule } = input;
  const t = now.getTime();
  const today = localDay(now);
  const sunOk = sun && alive(sun.state) ? sun : undefined;
  const p = input.memory.prevSun;
  const prev = p && t >= p.at && t - p.at <= RECENT_MS ? p : undefined;
  const m: Memory = sunOk ? { ...input.memory, prevSun: { state: sunOk.state, elevation: sunOk.elevation, rising: sunOk.rising, at: t } } : input.memory;
  const done = (action: Decision["action"], why: string, memory: Memory, log: boolean, ifFailed = memory): Decision => ({ action, why, memory, ifFailed, log });
  const quiet = (why: string) => done("none", why, m, false);
  const cover = input.cover && alive(input.cover.state) ? input.cover : undefined;

  if (!rule.dawn) return quiet("Closing at dawn is switched off.");

  // ---- dawn: the sun crossed -6 degrees since the last look, or this is the first look in a while and it is rising between -6 and +2 ----
  let dueAt = m.dawnDueAt !== undefined && localDay(new Date(m.dawnDueAt)) === today && m.dawnDay !== today ? m.dawnDueAt : undefined;
  if (dueAt === undefined && m.dawnDay !== today && sunOk) {
    const atDawn = prev
      ? crossed(prev, sunOk)
      : sunOk.rising === true && num(sunOk.elevation) && sunOk.elevation >= DAWN_ELEVATION && sunOk.elevation <= WINDOW_TOP;
    if (atDawn) dueAt = t;
  }
  if (dueAt !== undefined) {
    const settled: Memory = { ...m, dawnDay: today, dawnDueAt: undefined };
    if (t - dueAt > DUE_MS) return done("none", "Dawn came but the curtain could not be reached, so it was left alone today.", settled, true);
    if (!cover) return done("none", "Dawn came but the curtain cannot be reached right now. Trying again for a while.", { ...m, dawnDueAt: dueAt }, m.dawnDueAt === undefined);
    if (isShut(cover)) return done("none", "Dawn came and the curtain was already closed.", settled, true);
    const { tries: _tries, ...rest } = settled;
    return done("close", "Closed at dawn.", { ...rest, closedDay: today, closedAt: t }, true, failed({ ...m, dawnDueAt: dueAt }, today, settled));
  }

  // ---- open again at the set time, only a curtain this rule closed today, and only when that time is after it closed ----
  const at = parseTime(rule.openAt);
  if (at && m.closedDay === today && m.closedAt !== undefined && m.openDay !== today) {
    const openAt = new Date(now.getFullYear(), now.getMonth(), now.getDate(), at[0], at[1]).getTime();
    if (openAt > m.closedAt && t >= openAt) {
      if (!cover) return quiet("Time to open the curtain, but it cannot be reached right now.");
      const settled: Memory = { ...m, openDay: today };
      if (!isShut(cover)) return done("none", "The curtain was already open at the set time.", settled, true);
      const { tries: _tries, ...rest } = settled;
      return done("open", `Opened at ${rule.openAt}.`, rest, true, failed(m, today, settled));
    }
  }
  return quiet(sunOk ? "Nothing to do." : "The sun is not available, so dawn cannot be told.");
}
